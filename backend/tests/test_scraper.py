"""Scraper fixes from the 25.09 smoke/regression pass."""
import socket

import pytest

from app.errors import InvalidURLError
from app.models import ScrapedDocument
from app.services import scraper as S

NEXT_PAGE = """<html><head><title>x</title><script>var a = {"k": 1};</script></head>
<body><p>We process personal data only with your consent.</p>
<script>self.__next_f.push([1,"{\\"recipientGetsLabel\\":\\"Recipient gets\\",\\"totalToPayLabel\\":\\"Total\\"}"])</script>
<style>.a{color:red}</style><noscript>enable js</noscript>
<p>Read our <a href="/privacy">privacy policy</a>.</p></body></html>"""


def test_to_text_drops_script_payloads_and_urls():
    text = S._to_text(NEXT_PAGE)
    assert "We process personal data only with your consent." in text
    assert "recipientGetsLabel" not in text  # Next.js payload used to leak here
    assert "color:red" not in text and "var a" not in text
    assert "privacy policy" in text and "/privacy" not in text  # anchor text only


def test_looks_like_code_keeps_markdown_tables():
    assert S._looks_like_code('\\",\\"totalToPayLabel\\":\\"Total you\'ll pay\\",\\"transferFees')
    assert not S._looks_like_code("| _ga | Google Analytics | 2 years | analytics cookie |")


def test_rank_prefers_linked_policy_over_probe_and_drops_articles():
    base = "https://www.example.ae"
    ranked = S._rank_candidates(
        [
            (base + "/privacy", "probe"),
            (base + "/legal/privacy-policy", "anchor"),
            (base + "/events/data-protection-day", "sitemap"),
            (base + "/post/the-viral-cookie", "sitemap"),
        ],
        base,
    )
    assert ranked[0] == base + "/legal/privacy-policy"
    assert all("/events/" not in u and "/post/" not in u for u in ranked)


def test_rank_drops_foreign_market_notices_and_language_twins():
    base = "https://www.careem.com"
    ranked = S._rank_candidates(
        [
            (base + "/ar-AE/privacy-notice-ae-ride", "anchor"),
            (base + "/en-AE/privacy-notice-ae-ride", "anchor"),
            (base + "/en-AE/privacy-notice-eg-ride", "anchor"),
            (base + "/en-AE/privacy-notice-ksa-ride", "anchor"),
        ],
        base,
    )
    assert ranked == [base + "/en-AE/privacy-notice-ae-ride"]


def test_soft_404_shell_is_not_a_policy():
    landing = "Invest, trade and save\nOpen an account in minutes today\nPrivacy policy | Terms"
    lines = S._line_set(landing)
    assert not S._is_policy_text(landing, lines)
    policy = (
        "We collect personal data when you open an account. You may withdraw consent. "
        "Your rights include access and erasure. We share your data with third parties."
    )
    assert S._is_policy_text(policy, lines)


def test_assemble_keeps_policy_when_landing_is_huge():
    docs = [
        ScrapedDocument(source_url="https://x.ae", page_kind="landing", extraction_method="static", text="L" * 500_000),
        ScrapedDocument(source_url="https://x.ae/privacy", page_kind="privacy", extraction_method="static", text="P" * 20_000),
    ]
    state = S._assemble(docs)
    assert len(state) <= S._MAX_TEXT_CHARS + 200
    assert state.count("P") >= 20_000  # the whole policy reaches the scorer


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "::ffff:127.0.0.1"])
def test_private_hosts_are_refused(monkeypatch, ip):
    fam = socket.AF_INET6 if ":" in ip else socket.AF_INET
    monkeypatch.setattr(S.socket, "getaddrinfo", lambda *a, **k: [(fam, 1, 6, "", (ip, 443))])
    with pytest.raises(InvalidURLError):
        S.ensure_public_host("http://metadata.attacker.test/")


def test_localhost_refused_without_dns():
    with pytest.raises(InvalidURLError):
        S.ensure_public_host("http://localhost:8000/health")


def test_public_host_allowed(monkeypatch):
    monkeypatch.setattr(S.socket, "getaddrinfo", lambda *a, **k: [(socket.AF_INET, 1, 6, "", ("104.18.2.1", 443))])
    S.ensure_public_host("https://tabby.ai")


def test_unreachable_reason_hides_library_text():
    exc = Exception("Failed to perform, curl: (7) Failed to connect to 127.0.0.1:9 after 0 ms")
    msg = S._unreachable_reason(exc)
    assert "curl" not in msg and "127.0.0.1" not in msg
