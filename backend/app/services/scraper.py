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

_FETCH_TIMEOUT_S = 20.0
_MIN_TEXT_CHARS = 200  # below this, try rendered fallback / no-content

_PRIVACY_HREF_RE = re.compile(
    r"privacy|privacy-policy|data-protection|privacy-notice|legal|terms", re.I
)


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
    """DynamicFetcher fallback — may be unavailable without `scrapling install`."""
    from scrapling import DynamicFetcher

    return DynamicFetcher.fetch(url, timeout=_FETCH_TIMEOUT_S * 1000)


def _classify_response(resp, url: str) -> str:
    """Return HTML body or raise the right typed error."""
    status = getattr(resp, "status", 200) or 200
    try:
        status = int(status)
    except (TypeError, ValueError):
        status = 200
    if status >= 400:
        if status == 403:
            raise BlockedError(f"The site returned HTTP 403 — likely bot-blocked.")
        raise HTTPFetchError(f"The site returned HTTP {status}.", status_code=status)
    body = getattr(resp, "body", "") or ""
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    return body


def _discover_privacy_link(resp, base_url: str) -> str | None:
    """Find a same-origin privacy-policy link in anchors (href or link text)."""
    base_host = urlparse(base_url).hostname or ""
    try:
        anchors = resp.css("a[href]")
    except Exception:
        return None
    for a in anchors:
        try:
            href = (a.attrib.get("href") or "").strip()
            text = (a.text or "").strip()
        except Exception:
            continue
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        if not (_PRIVACY_HREF_RE.search(href) or _PRIVACY_HREF_RE.search(text)):
            continue
        full = urljoin(base_url, href)
        if urlparse(full).hostname == base_host:
            return full
    return None


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
    """Fetch landing + discovered privacy page.

    Returns (documents, concatenated_text, warnings). Landing failures raise;
    privacy-page failures only annotate coverage (FR-014).
    """
    validate_url(url)
    warnings: list[str] = []

    html, method, resp = await _fetch_page(url)
    text = _to_text(html)
    if len(text) < _MIN_TEXT_CHARS:
        raise NoContentError("Could not extract readable content from this site.")
    notes = [f"rendered fetch used" ] if method == "rendered" else []
    docs = [
        ScrapedDocument(
            source_url=url, page_kind="landing",
            extraction_method=method, text=text, coverage_notes=notes,
        )
    ]

    privacy_url = _discover_privacy_link(resp, url) if resp is not None else None
    if privacy_url:
        try:
            phtml, pmethod, _ = await _fetch_page(privacy_url)
            ptext = _to_text(phtml)
            if ptext:
                docs.append(
                    ScrapedDocument(
                        source_url=privacy_url, page_kind="privacy",
                        extraction_method=pmethod, text=ptext,
                        coverage_notes=["rendered fetch used"] if pmethod == "rendered" else [],
                    )
                )
            else:
                warnings.append("privacy page found but no readable text extracted")
        except Exception as exc:
            warnings.append(f"privacy page fetch failed: {exc}")
    else:
        warnings.append("privacy policy page not found — landing text only")

    combined = "\n\n".join(d.text for d in docs)
    return docs, combined, warnings
