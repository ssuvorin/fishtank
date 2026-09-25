"""Site scraping (T010): landing page + privacy-policy discovery via scrapling."""
from __future__ import annotations

import asyncio
import re
from urllib.parse import urljoin, urlparse

from markdownify import markdownify as md

from ..errors import (
    AuditTimeoutError,
    BlockedError,
    HTTPFetchError,
    InvalidURLError,
    NoContentError,
    UnreachableError,
)

from ..models import ScrapedDocument

_FETCH_TIMEOUT_S = 20.0
_MIN_TEXT_CHARS = 200  # below this, try rendered fallback / no-content
_PRIVACY_HREF_RE = re.compile(
    r"privacy|privacy-policy|data-protection|privacy-notice", re.I
)
_COOKIE_HREF_RE = re.compile(r"cookie|cookies", re.I)
_LEGAL_HREF_RE = re.compile(
    r"terms|legal|data-processing|dpa|cookie-policy|gdpr", re.I
)
# Common policy paths probed when link discovery comes up empty.
_COMMON_POLICY_PATHS = (
    "/privacy", "/privacy-policy", "/privacy-notice",
    "/cookies", "/cookie-policy", "/legal", "/terms",
)
_MAX_POLICY_PAGES = 3
_MAX_TEXT_CHARS = 60_000  # keep Jev `state` bounded


def validate_url(url: str) -> str:
    """Reject non-http(s) schemes and hostname-less URLs before any fetch."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise InvalidURLError(
            "Invalid URL: only http:// and https:// addresses can be audited."
        )
    return url


def _to_text(html: str) -> str:
    return md(html or "", strip=["img", "script", "style"]).strip()


def _fetch_static(url: str):
    from scrapling import Fetcher  # imported lazily: heavy optional deps

    return Fetcher.get(url, timeout=_FETCH_TIMEOUT_S, follow_redirects=True)


def _fetch_rendered(url: str):
    """DynamicFetcher (headless Chromium) fallback — handles JS-only SPAs."""
    from scrapling import DynamicFetcher

    return DynamicFetcher.fetch(
        url, timeout=int(_FETCH_TIMEOUT_S * 1000), network_idle=True
    )


def _classify_response(resp, url: str) -> str:
    """Return HTML body or raise the right typed error."""
    status = getattr(resp, "status", 200) or 200
    try:
        status = int(status)
    except (TypeError, ValueError):
        status = 200
    if status >= 400:
        if status == 403:
            raise BlockedError("The site returned HTTP 403 — likely bot-blocked.")
        raise HTTPFetchError(f"The site returned HTTP {status}.", status_code=status)
    body = getattr(resp, "body", "") or ""
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    return body


def _discover_policy_links(resp, base_url: str, limit: int = _MAX_POLICY_PAGES) -> list[str]:
    """Same-origin privacy/cookie/legal links in priority order, deduped."""
    base_host = urlparse(base_url).hostname or ""
    found: list[str] = []
    try:
        anchors = resp.css("a[href]")
    except Exception:
        return found
    tiers = (_PRIVACY_HREF_RE, _COOKIE_HREF_RE, _LEGAL_HREF_RE)
    seen: set[str] = set()
    for tier in tiers:
        for a in anchors:
            try:
                href = (a.attrib.get("href") or "").strip()
                text = (a.text or "").strip()
            except Exception:
                continue
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            if not (tier.search(href) or tier.search(text)):
                continue
            full = urljoin(base_url, href).split("#")[0].rstrip("/")
            if full in seen or urlparse(full).hostname != base_host:
                continue
            seen.add(full)
            found.append(full)
            if len(found) >= limit:
                return found
    return found


def _probe_common_paths(base_url: str, already: list[str]) -> list[str]:
    """Candidate policy URLs to try when anchors reveal nothing."""
    p = urlparse(base_url)
    root = f"{p.scheme}://{p.netloc}"
    tried = set(already)
    return [root + path for path in _COMMON_POLICY_PATHS if root + path not in tried]


def _fetch_page_sync(url: str) -> tuple[str, str, object | None]:
    """Blocking fetch+classify; returns (html, method, response)."""
    resp = _fetch_static(url)
    html = _classify_response(resp, url)
    method = "static"
    text = _to_text(html)
    if len(text) < _MIN_TEXT_CHARS:
        try:
            resp2 = _fetch_rendered(url)
            html2 = _classify_response(resp2, url)
            if len(_to_text(html2)) > len(text):
                html, method, resp = html2, "rendered", resp2
        except Exception:
            pass  # rendered fallback optional — degrade gracefully
    return html, method, resp


async def _fetch_page(url: str):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_fetch_page_sync, url), timeout=_FETCH_TIMEOUT_S + 10
        )
    except asyncio.TimeoutError:
        raise AuditTimeoutError(
            "The audit timed out — the site is too slow to respond. Retry."
        )
    except (InvalidURLError, HTTPFetchError, BlockedError, NoContentError):
        raise
    except UnreachableError:
        raise
    except Exception as exc:
        name = type(exc).__name__.lower()
        if any(k in name for k in ("timeout", "connect", "resolve", "dns")):
            raise UnreachableError(f"Could not reach this site: {exc}")
        raise UnreachableError(f"Could not reach this site: {exc}")


async def scrape_site(url: str) -> tuple[list[ScrapedDocument], str, list[str]]:
    """Fetch landing + up to N policy pages (privacy/cookies/legal).

    Discovery order: same-origin anchors by tier (privacy → cookies → legal);
    if anchors yield nothing, probe common paths (/privacy, /cookie-policy…).
    Landing failures raise; policy-page failures only annotate coverage.
    """
    validate_url(url)
    warnings: list[str] = []

    html, method, resp = await _fetch_page(url)
    text = _to_text(html)
    if len(text) < _MIN_TEXT_CHARS:
        raise NoContentError("Could not extract readable content from this site.")
    notes = ["rendered fetch used"] if method == "rendered" else []
    docs = [
        ScrapedDocument(
            source_url=url, page_kind="landing",
            extraction_method=method, text=text, coverage_notes=notes,
        )
    ]

    policy_urls: list[str] = (
        _discover_policy_links(resp, url) if resp is not None else []
    )
    if not policy_urls:
        policy_urls = _probe_common_paths(url, [])[:_MAX_POLICY_PAGES]
        if policy_urls:
            warnings.append("no policy links found in DOM — probed common paths")

    async def _try_policy(purl: str) -> ScrapedDocument | None:
        try:
            phtml, pmethod, _ = await _fetch_page(purl)
            ptext = _to_text(phtml)
            if len(ptext) < 120:
                return None
            kind = "cookie" if _COOKIE_HREF_RE.search(purl) else (
                "legal" if not _PRIVACY_HREF_RE.search(purl) else "privacy"
            )
            return ScrapedDocument(
                source_url=purl, page_kind=kind,
                extraction_method=pmethod, text=ptext,
                coverage_notes=["rendered fetch used"] if pmethod == "rendered" else [],
            )
        except Exception as exc:
            warnings.append(f"policy page {purl} failed: {type(exc).__name__}")
            return None

    extra = await asyncio.gather(*(_try_policy(u) for u in policy_urls))
    docs.extend(d for d in extra if d is not None)

    if len(docs) < 2:
        warnings.append("no separate policy page found — landing text only")

    combined = "\n\n".join(d.text for d in docs)[:_MAX_TEXT_CHARS]
    return docs, combined, warnings
