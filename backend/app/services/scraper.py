"""Site scraping (T010): landing page + privacy-policy discovery via scrapling."""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import logging
import re
import socket
from concurrent.futures import ThreadPoolExecutor
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

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT_S = 20.0
_MIN_TEXT_CHARS = 200  # below this, try rendered fallback / no-content
# Client-rendered pages (Next.js RSC, SPAs) ship the prose inside JSON: a big
# HTML body with almost no visible text also gets the rendered fallback.
_THIN_TEXT_CHARS = 3_000
_THIN_TEXT_RATIO = 0.02
_PRIVACY_HREF_RE = re.compile(
    r"privacy|privacidad|privacit|datenschutz|dataprotection|data-protection|"
    r"privacy-notice|конфиденц|политик|персональн|приватност|"
    r"datenschutzerkl|vie-priv|donnees-personnelles|protección-de-datos",
    re.I,
)
_COOKIE_HREF_RE = re.compile(
    r"cookie|cookies|куки|cookies-policy|cookie-policy", re.I
)
_LEGAL_HREF_RE = re.compile(
    r"terms|legal|data-processing|dpa|cookie-policy|gdpr|правов|услови|"
    r"impressum|mentions-legales|aviso-legal|rechtlich",
    re.I,
)
# Common policy paths probed when link/sitemap discovery comes up empty.
_COMMON_POLICY_PATHS = (
    "/privacy", "/privacy-policy", "/privacy-notice",
    "/politika-konfidencialnosti", "/privacy-policy/", "/ru/privacy",
    "/cookies", "/cookie-policy", "/legal", "/terms",
    "/en/privacy", "/privacy.html",
)
_MAX_POLICY_PAGES = 4
_POLICY_FETCH_SLACK = 2  # fetch a few spare candidates: soft-404s get dropped
_MAX_TEXT_CHARS = 60_000  # keep Jev `state` bounded
_LANDING_BUDGET_CHARS = 8_000  # landing is context; policy pages get the rest

# Paths that match policy words but are articles/events, not policies.
_NON_POLICY_PATH_RE = re.compile(
    r"/(?:events?|news|blogs?|insights?|whats-on|media|press|articles?|stories|"
    r"careers?|jobs|podcasts?|webinars?|posts?|recipes?|products?)(?:/|$)",
    re.I,
)
_LOCALE_SEG_RE = re.compile(r"^[a-z]{2}(?:[-_][a-z]{2})?$", re.I)
# Country-market slugs (careem: privacy-notice-eg-ride). "ae" is the home market.
_FOREIGN_MARKETS = frozenset(
    "eg iq pk sa ksa jo ma kw qa bh om lb tr ke ng za dz tn ly sd ye sy".split()
)
_SOURCE_RANK = {"anchor": 0, "sitemap": 1, "probe": 3}
_LAST_RESORT = 100  # article pages, other-country notices: only if nothing else

# A real policy page talks about several of these; a soft-404 shell does not.
_POLICY_CONCEPTS = (
    re.compile(r"personal (?:data|information)|البيانات الشخصية|персональн", re.I),
    re.compile(r"privacy|الخصوصية|конфиденциальн", re.I),
    re.compile(r"\bcollect|\bprocess", re.I),
    re.compile(r"\bconsent|\bwithdraw", re.I),
    re.compile(r"\bcookie", re.I),
    re.compile(r"your rights|right to (?:access|erasure|object)|data subject", re.I),
    re.compile(r"third[- ]part|disclos|share your", re.I),
    re.compile(r"retain|retention|data protection", re.I),
)
_MIN_POLICY_CONCEPTS = 3
_LANDING_OVERLAP_MAX = 0.8  # share of a page's lines also on the landing page

# HTML blocks whose *content* is never prose. markdownify's strip= keeps the
# inner text of stripped tags, so script/JSON payloads must be cut beforehand.
_NOISE_BLOCK_RE = re.compile(
    r"<(script|style|noscript|template|svg|iframe|object|canvas|head)\b[^>]*>.*?</\1\s*>",
    re.I | re.S,
)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
_CODE_MARKERS_RE = re.compile(
    r'\\",\\"|":\s*[\[{"]|\bfunction\s*\(|=>|\b(?:var|let|const)\s+[\w$]+\s*=|'
    r"\b(?:self|window|document)\.[\w$]+|\\u00[0-9a-f]{2}|static/chunks"
)
_CODE_PUNCT = set('{}[];=<>\\"')  # not '|': markdown tables (cookie lists) are prose


def _locale_of(path: str) -> str | None:
    first = next((seg for seg in path.split("/") if seg), "")
    return first.lower().replace("_", "-") if _LOCALE_SEG_RE.match(first) else None


def _candidate_score(full: str, tier: int, source: str, base_lang: str) -> int:
    """Lower is better: tier (privacy>cookie>legal), then discovery source,
    then penalties for article paths, other-language and other-market pages."""
    path = urlparse(full).path
    score = tier * 10 + _SOURCE_RANK.get(source, 3)
    if _NON_POLICY_PATH_RE.search(path):
        score += _LAST_RESORT
    loc = _locale_of(path)
    if loc and loc.split("-")[0] != base_lang:
        score += 2
    # market tokens come from the path proper — the "en-AE" locale segment
    # would otherwise lift an Egypt notice back under the last-resort bar
    bare = path[len(loc) + 1:] if loc else path
    tokens = set(re.split(r"[-_/.]", bare.lower()))
    if tokens & _FOREIGN_MARKETS:
        score += _LAST_RESORT
    if tokens & {"ae", "uae"}:
        score -= 1
    return score


def _rank_candidates(
    candidates: list[tuple[str, str]], base_url: str, limit: int = _MAX_POLICY_PAGES
) -> list[str]:
    """Dedupe, keep same-origin policy URLs, rank best-first.

    `candidates` are (url, source) pairs; source is anchor | sitemap | probe.
    Probed paths rank after discovered links of the same tier, so a guessed
    /privacy never displaces the policy the site actually links to.
    """
    base = urlparse(base_url)
    base_host = base.hostname or ""
    base_lang = (_locale_of(base.path) or "en").split("-")[0]
    tiers = (_PRIVACY_HREF_RE, _COOKIE_HREF_RE, _LEGAL_HREF_RE)
    best: dict[str, int] = {}
    order: dict[str, int] = {}
    variant: dict[str, str] = {}  # same page in another language → keep best
    for n, (u, source) in enumerate(candidates):
        try:
            full = urljoin(base_url, u).split("#")[0].rstrip("/")
        except Exception:
            continue
        if urlparse(full).hostname != base_host:
            continue
        tier = next((i for i, t in enumerate(tiers) if t.search(full)), None)
        if tier is None:
            continue
        score = _candidate_score(full, tier, source, base_lang)
        path = urlparse(full).path
        key = path[len(_locale_of(path) or "") + 1:] if _locale_of(path) else path
        key = key.strip("/").lower()
        prev = variant.get(key)
        if prev is not None and best[prev] <= score:
            continue
        if prev is not None:
            del best[prev]
        variant[key] = full
        best[full] = score
        order.setdefault(full, n)
    ranked = sorted(best, key=lambda f: (best[f], order[f]))
    if any(best[f] < _LAST_RESORT for f in ranked):
        ranked = [f for f in ranked if best[f] < _LAST_RESORT]
    return ranked[:limit]


def _is_public_ip(raw: str) -> bool:
    ip = ipaddress.ip_address(raw.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def ensure_public_host(url: str) -> None:
    """Refuse hosts that resolve to loopback/private/link-local space (SSRF).

    Blocking call (DNS) — run it in a worker thread from async code.
    """
    p = urlparse(url)
    host = (p.hostname or "").lower().rstrip(".")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise InvalidURLError(_PRIVATE_HOST_MSG)
    try:
        infos = socket.getaddrinfo(host, p.port or 443, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError):
        raise UnreachableError("Could not resolve this domain — check the address.")
    if not infos or not all(_is_public_ip(info[4][0]) for info in infos):
        raise InvalidURLError(_PRIVATE_HOST_MSG)


_PRIVATE_HOST_MSG = (
    "Invalid URL: this address points to a private or local network and cannot be audited."
)


def validate_url(url: str) -> str:
    """Reject non-http(s) schemes and hostname-less URLs before any fetch."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise InvalidURLError(
            "Invalid URL: only http:// and https:// addresses can be audited."
        )
    return url


def _looks_like_code(line: str) -> bool:
    """True for serialized JSON / minified JS lines that survived tag removal."""
    s = line.strip()
    if len(s) < 40:
        return False
    if _CODE_MARKERS_RE.search(s):
        return True
    punct = sum(1 for c in s if c in _CODE_PUNCT)
    if punct / len(s) > 0.08:
        return True
    return any(len(tok) > 60 for tok in s.split())  # base64 / hashes


def _to_text(html: str) -> str:
    """Readable text of a page: prose only, no script/JSON payloads or URLs."""
    cleaned = _COMMENT_RE.sub(" ", html or "")
    cleaned = _NOISE_BLOCK_RE.sub(" ", cleaned)
    text = md(cleaned, strip=["img", "a"])
    lines = [ln.rstrip() for ln in text.splitlines()]
    text = "\n".join(ln for ln in lines if not _looks_like_code(ln))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _fetch_static(url: str):
    from scrapling import Fetcher  # imported lazily: heavy optional deps

    return Fetcher.get(url, timeout=_FETCH_TIMEOUT_S, follow_redirects=True)


def _fetch_rendered(url: str):
    """DynamicFetcher (headless Chromium) fallback — handles JS-only SPAs."""
    from scrapling import DynamicFetcher

    # A fixed settle wait instead of network_idle: sites with analytics beacons
    # never go idle and each render hit the full timeout (~25s, kitopi).
    return DynamicFetcher.fetch(
        url, timeout=int(_FETCH_TIMEOUT_S * 1000), network_idle=False, wait=2000
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


def _sitemap_policy_urls(base_url: str) -> list[str]:
    """Pull /sitemap.xml (+ index children), return URLs matching policy patterns."""
    p = urlparse(base_url)
    root = f"{p.scheme}://{p.netloc}"
    out: list[str] = []

    def _locs(xml: str) -> list[str]:
        return re.findall(r"<loc>\s*([^<\s]+)", xml)

    def _fetch(url: str) -> str:
        try:
            resp = _fetch_static(url)
            body = getattr(resp, "body", "") or ""
            if isinstance(body, bytes):
                body = body.decode("utf-8", errors="replace")
            return body
        except Exception:
            return ""

    index = _fetch(root + "/sitemap.xml")
    if not index:
        return out
    locs = _locs(index)
    # sitemap index → descend into child maps
    if "<sitemapindex" in index or all(u.endswith(".xml") for u in locs[:3]):
        # page/legal maps first; children fetched in parallel (was ~1s each, serial)
        children = sorted(locs[:10], key=lambda u: 0 if re.search(r"page|legal|static", u, re.I) else 1)
        with ThreadPoolExecutor(max_workers=6) as pool:
            locs = [loc for xml in pool.map(_fetch, children) for loc in _locs(xml)]
    policy_re = re.compile(
        r"privacy|cookie|legal|terms|data-protection|dpo|gdpr|"
        r"конфиденц|политик|персональн|cookie|условия|правов",
        re.I,
    )
    for u in locs:
        if policy_re.search(u):
            out.append(u)
    return out


def _discover_policy_links(resp, base_url: str, limit: int = _MAX_POLICY_PAGES) -> list[str]:
    """Same-origin anchors whose href or visible text matches policy tiers."""
    found: list[str] = []
    try:
        anchors = resp.css("a[href]")
    except Exception:
        return found
    for a in anchors:
        try:
            href = (a.attrib.get("href") or "").strip()
            text = (a.text or "").strip()
        except Exception:
            continue
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        if not (
            _PRIVACY_HREF_RE.search(href) or _PRIVACY_HREF_RE.search(text)
            or _COOKIE_HREF_RE.search(href) or _COOKIE_HREF_RE.search(text)
            or _LEGAL_HREF_RE.search(href) or _LEGAL_HREF_RE.search(text)
        ):
            continue
        found.append(urljoin(base_url, href))
        if len(found) >= limit * 3:  # over-collect; ranker trims
            break
    return found


def _probe_common_paths(base_url: str) -> list[str]:
    """Guessed policy URLs; ranked after anything the site actually links to."""
    p = urlparse(base_url)
    root = f"{p.scheme}://{p.netloc}"
    return [root + path for path in _COMMON_POLICY_PATHS]


def _is_thin(text: str, html: str) -> bool:
    if len(text) < _MIN_TEXT_CHARS:
        return True
    return len(text) < _THIN_TEXT_CHARS and len(text) < _THIN_TEXT_RATIO * len(html)


def _fetch_page_sync(url: str, allow_render: bool = True) -> tuple[str, str, object | None]:
    """Blocking fetch+classify; returns (html, method, response).

    Static first; when the extracted text is thin, retry via DynamicFetcher
    (headless Chromium) — JS-only SPAs. Rendered failures degrade to static.
    """
    resp = _fetch_static(url)
    try:
        html = _classify_response(resp, url)
    except (BlockedError, HTTPFetchError) as exc:
        # 403/429/503 are usually bot walls, not real errors — a headless
        # browser often gets through. Other statuses are genuine.
        status = getattr(exc, "status_code", None) or 403
        if status not in (403, 429, 503) or not allow_render:
            raise
        try:
            resp2 = _fetch_rendered(url)
            html2 = _classify_response(resp2, url) or ""
        except Exception:
            raise exc
        if len(_to_text(html2)) < _MIN_TEXT_CHARS:
            raise exc
        return html2, "rendered", resp2
    method = "static"
    text = _to_text(html)
    if allow_render and _is_thin(text, html):
        try:
            resp2 = _fetch_rendered(url)
            html2 = _classify_response(resp2, url) or ""
            text2 = _to_text(html2)
            logger.info(
                "rendered attempt %s: static=%d rendered=%d",
                url, len(text), len(text2),
            )
            if len(text2) > len(text):
                html, method, resp = html2, "rendered", resp2
        except Exception as exc:
            logger.warning("rendered fetch failed for %s: %s: %s", url, type(exc).__name__, exc)
    return html or "", method, resp


async def _fetch_page(url: str, allow_render: bool = True):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_fetch_page_sync, url, allow_render),
            timeout=_FETCH_TIMEOUT_S + 10,
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
        # Raw curl/playwright text names internal hosts and library details —
        # log it, show the user a plain reason.
        logger.warning("fetch failed for %s: %s: %s", url, type(exc).__name__, exc)
        raise UnreachableError(_unreachable_reason(exc))


def _unreachable_reason(exc: Exception) -> str:
    raw = f"{type(exc).__name__} {exc}".lower()
    if "timed out" in raw or "timeout" in raw or "(28)" in raw:
        return "The site did not respond in time."
    if "resolve" in raw or "(6)" in raw or "dns" in raw:
        return "Could not resolve this domain — check the address."
    if "ssl" in raw or "tls" in raw or "certificate" in raw or "(35)" in raw or "(60)" in raw:
        return "Could not establish a secure (TLS) connection to the site."
    if "connect" in raw or "(7)" in raw or "refused" in raw or "reset" in raw:
        return "The site refused the connection."
    return "Could not reach this site."


def _fingerprint(text: str) -> str:
    return hashlib.sha1(re.sub(r"\s+", " ", text[:5000]).lower().encode()).hexdigest()


def _line_set(text: str) -> set[str]:
    return {ln.strip().lower() for ln in text.splitlines() if len(ln.strip()) > 20}


def _is_policy_text(text: str, landing_lines: set[str]) -> bool:
    """Reject soft-404s: SPA shells and redirects that re-serve the landing page."""
    concepts = sum(1 for rx in _POLICY_CONCEPTS if rx.search(text))
    if concepts < _MIN_POLICY_CONCEPTS:
        return False
    lines = _line_set(text)
    if lines and len(lines & landing_lines) / len(lines) > _LANDING_OVERLAP_MAX:
        return False
    return True


def _assemble(docs: list[ScrapedDocument]) -> str:
    """Scoring state: policy pages first (fair share of the budget), then a
    bounded landing excerpt. A huge landing page can no longer crowd out the
    privacy policy the rules are actually about."""
    landing, policies = docs[0], docs[1:]
    landing_part = landing.text[: _LANDING_BUDGET_CHARS if policies else _MAX_TEXT_CHARS]
    remaining = _MAX_TEXT_CHARS - len(landing_part)
    shares: dict[int, int] = {}
    pending = sorted(range(len(policies)), key=lambda i: len(policies[i].text))
    while pending:
        fair = remaining // len(pending)
        i = pending.pop(0)
        shares[i] = min(len(policies[i].text), fair)
        remaining -= shares[i]
    parts = [
        f"=== {d.page_kind.upper()} PAGE: {d.source_url} ===\n{d.text[: shares[i]]}"
        for i, d in enumerate(policies)
    ]
    parts.append(f"=== LANDING PAGE: {landing.source_url} ===\n{landing_part}")
    return "\n\n".join(parts)


async def scrape_site(url: str) -> tuple[list[ScrapedDocument], str, list[str]]:
    """Fetch landing + up to N policy pages (privacy/cookies/legal).

    Discovery: same-origin anchors, sitemap, then guessed common paths; all
    ranked by `_rank_candidates`. Fetched pages that duplicate another page or
    are soft-404s (landing shell served at /privacy) are dropped.
    Landing failures raise; policy-page failures only annotate coverage.
    """
    validate_url(url)
    await asyncio.to_thread(ensure_public_host, url)
    warnings: list[str] = []

    html, method, resp = await _fetch_page(url)
    final_url = str(getattr(resp, "url", "") or url)
    if urlparse(final_url).hostname != urlparse(url).hostname:
        await asyncio.to_thread(ensure_public_host, final_url)
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
    landing_lines = _line_set(text)
    landing_home = urlparse(final_url).path.rstrip("/")

    candidates: list[tuple[str, str]] = []
    if resp is not None:
        candidates += [(u, "anchor") for u in _discover_policy_links(resp, url)]
    try:
        candidates += [(u, "sitemap") for u in await asyncio.to_thread(_sitemap_policy_urls, url)]
    except Exception:
        pass  # sitemap optional
    candidates += [(u, "probe") for u in _probe_common_paths(url)]
    policy_urls = _rank_candidates(candidates, url, _MAX_POLICY_PAGES + _POLICY_FETCH_SLACK)
    # Guessed paths are fetched statically only: headless-rendering every
    # soft-404 on a JS site costs ~10s each and blew the 90s budget (kitopi).
    discovered = {urljoin(url, u).split("#")[0].rstrip("/") for u, src in candidates if src != "probe"}

    async def _try_policy(purl: str) -> tuple[str, ScrapedDocument] | None:
        try:
            phtml, pmethod, presp = await _fetch_page(purl, allow_render=purl in discovered)
        except Exception as exc:
            logger.info("policy page %s skipped: %s", purl, type(exc).__name__)
            return None
        landed = str(getattr(presp, "url", "") or purl)
        if urlparse(landed).path.rstrip("/") == landing_home:
            return None  # redirected back to the landing page
        ptext = _to_text(phtml)
        if len(ptext) < 120 or not _is_policy_text(ptext, landing_lines):
            return None
        landed_key = landed.split("#")[0].rstrip("/")
        kind = "cookie" if _COOKIE_HREF_RE.search(purl) else (
            "legal" if not _PRIVACY_HREF_RE.search(purl) else "privacy"
        )
        doc = ScrapedDocument(
            source_url=purl, page_kind=kind,
            extraction_method=pmethod, text=ptext,
            coverage_notes=["rendered fetch used"] if pmethod == "rendered" else [],
        )
        return landed_key, doc

    fetched = await asyncio.gather(*(_try_policy(u) for u in policy_urls))
    seen = {_fingerprint(text)}
    landed_seen: set[str] = set()
    for item in fetched:  # rank order preserved by gather
        if item is None or len(docs) > _MAX_POLICY_PAGES:
            continue
        landed_key, doc = item
        fp = _fingerprint(doc.text)
        if fp in seen or landed_key in landed_seen:
            continue  # same page reached via two links / redirects
        seen.add(fp)
        landed_seen.add(landed_key)
        docs.append(doc)

    if len(docs) < 2:
        warnings.append("no policy page found — scored on landing text only")

    return docs, _assemble(docs), warnings
