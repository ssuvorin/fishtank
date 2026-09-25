"""Evidence, ADGM applicability, revenue contract, narration script."""
import asyncio

import pytest

from app.models import AuditRequest, NarrationItem, NarrationRequest
from app.rules import get_rules
from app.services import audit as A
from app.services.evidence import extract_evidence
from app.services.narration import build_script, spoken_money

RULES = {r.id: r for r in get_rules()}


def test_short_keywords_match_whole_words_only():
    rule = RULES["gdpr_child_data"]  # keys include "age"
    quote = extract_evidence(rule, "Our agent will manage your page settings.", policy_texts=[])
    assert quote.startswith("The policy omits")


def test_escaped_json_is_never_quoted():
    rule = RULES["cross_border_data_transfers"]
    blob = '\\",\\"recipientGetsLabel\\":\\"Recipient gets\\",\\"transferFeesLabel\\":\\"Transfer fees incl.'
    assert extract_evidence(rule, blob, policy_texts=[]).startswith("The policy omits")


def test_quotes_are_not_reused_across_rules():
    text = "We will notify you of any breach and transfer data outside the UAE with safeguards."
    used: set[str] = set()
    q1 = extract_evidence(RULES["uae_breach_notification"], text, policy_texts=[], used=used)
    q2 = extract_evidence(RULES["adgm_breach_notification"], text, policy_texts=[], used=used)
    assert q1 != q2


def test_adgm_rules_need_an_adgm_nexus():
    adgm = RULES["adgm_breach_notification"]
    assert not A._applies(adgm, "Careem is licensed in Dubai under UAE PDPL.")
    assert A._applies(adgm, "Sarwa is regulated under ADGM Data Protection Regulations 2021.")
    assert A._applies(RULES["uae_breach_notification"], "anything")


def test_adgm_rules_not_scored_or_priced_without_nexus(monkeypatch):
    from app.models import ScrapedDocument

    docs = [
        ScrapedDocument(source_url="https://x.ae", page_kind="landing", extraction_method="static", text="Dubai shop " * 40),
        ScrapedDocument(source_url="https://x.ae/privacy", page_kind="privacy", extraction_method="static", text="We collect personal data. " * 20),
    ]

    async def fake_scrape(url):
        return docs, "state", []

    seen: list[str] = []

    async def fake_score(rules, text):
        seen.extend(r.id for r in rules)
        return {r.id: 0.9 for r in rules}

    async def fake_brief(v, e):
        return ""

    monkeypatch.setattr(A, "scrape_site", fake_scrape)
    monkeypatch.setattr(A, "score_rules", fake_score)
    monkeypatch.setattr(A, "generate_briefing", fake_brief)
    res = asyncio.run(A._pipeline(AuditRequest(url="https://x.ae")))
    adgm = [v for v in res.violations if v.id.startswith("adgm_")]
    assert adgm and all(not v.applicable and not v.flagged and v.exposure_usd == 0 for v in adgm)
    assert not any(i.startswith("adgm_") for i in seen)
    assert res.limited_coverage is False  # a privacy page made it in


@pytest.mark.parametrize("raw", ["abc", -5, 0, float("nan"), None])
def test_revenue_falls_back_to_default(raw):
    # api-audit.md: omitted, null, non-numeric or <= 0 -> default (was a 422 for "abc")
    assert AuditRequest(url="https://x.ae", annual_revenue=raw).annual_revenue is None


def test_revenue_accepts_formatted_string():
    assert AuditRequest(url="https://x.ae", annual_revenue="5,000,000").annual_revenue == 5_000_000


def test_narration_script_is_built_from_figures_only():
    req = NarrationRequest(
        host="www.sarwa.co", exposure_usd=561000, exposure_aed=2060553, flagged=9, total=14,
        top=[
            NarrationItem(rule_id="adgm_breach_notification", exposure_usd=130500),
            NarrationItem(rule_id="uae_breach_notification", exposure_usd=82000),
        ],
    )
    script, cues = build_script(req)
    assert script.startswith("ComplyRisk briefing for sarwa.co.")
    assert "561 thousand US dollars" in script and "2.1 million dirhams" in script
    assert "under ADGM rules" in script and "under the UAE PDPL" in script  # same category twice
    assert [rid for _, rid in cues] == ["adgm_breach_notification", "uae_breach_notification"]
    assert script[cues[0][0]:].startswith("The largest driver is")


@pytest.mark.parametrize(
    "host,top",
    [("evil.com/<script>", []), ("ok.ae", [NarrationItem(rule_id="say anything", exposure_usd=1)])],
)
def test_narration_rejects_free_text(host, top):
    with pytest.raises(ValueError):
        build_script(NarrationRequest(host=host, exposure_usd=1, exposure_aed=1, flagged=1, total=14, top=top))


def test_spoken_money():
    assert spoken_money(1_250_000) == "1.2 million US dollars" or spoken_money(1_250_000) == "1.3 million US dollars"
    assert spoken_money(564_250) == "564 thousand US dollars"
