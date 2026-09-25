"""Devin v3 API client — hands an audit remediation prompt to a Devin session
that clones the target GitHub repo, applies the fixes and opens a pull request.

The target org has no native GitHub connection, so git access is supplied per
session as a sensitive session secret (GITHUB_TOKEN); the PR URL comes back via
structured output (and Devin's own pull_requests list when it detects one).
"""
from __future__ import annotations

import re

import httpx

from ..config import settings
from ..errors import AuditError

_API = "https://api.devin.ai/v3/organizations"
_TIMEOUT = 30.0

_REPO_RE = re.compile(
    r"^(?:https?://github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$"
)

_PR_SCHEMA = {
    "type": "object",
    "properties": {
        "pr_url": {"type": "string", "description": "URL of the opened pull request"},
        "branch": {"type": "string"},
        "summary": {"type": "string", "description": "One paragraph: what was changed"},
        "todo_for_owner": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Facts/placeholders the site owner must fill in",
        },
    },
    "required": ["pr_url", "summary"],
}


class DevinUnavailableError(AuditError):
    http_status = 503
    code = "devin_unavailable"


class InvalidRepoError(AuditError):
    http_status = 422
    code = "invalid_repo"


def parse_repo(raw: str) -> str:
    """'https://github.com/o/r(.git)' or 'o/r' → 'o/r'."""
    m = _REPO_RE.match(raw.strip())
    if not m:
        raise InvalidRepoError("Repository must be a GitHub URL or owner/name")
    return f"{m.group(1)}/{m.group(2)}"


def _config() -> tuple[str, dict[str, str]]:
    if not (settings.DEVIN_API_KEY and settings.DEVIN_ORG_ID and settings.GITHUB_TOKEN):
        raise DevinUnavailableError(
            "Devin PR hand-off is not configured — set DEVIN_API_KEY, DEVIN_ORG_ID "
            "and GITHUB_TOKEN in backend/.env"
        )
    headers = {
        "Authorization": f"Bearer {settings.DEVIN_API_KEY}",
        "Content-Type": "application/json",
    }
    return f"{_API}/{settings.DEVIN_ORG_ID}/sessions", headers


def _session_prompt(repo: str, remediation_md: str) -> str:
    return f"""You are fixing privacy-compliance findings in the GitHub repository `{repo}` and must finish by opening ONE pull request.

## Git access
The environment variable `GITHUB_TOKEN` holds a GitHub token with push + pull-request access to `{repo}`.
1. `git clone https://x-access-token:$GITHUB_TOKEN@github.com/{repo}.git && cd {repo.split('/')[1]}`
2. `git checkout -b complyrisk/compliance-fixes-$(date +%Y%m%d-%H%M)` from the default branch.
3. Implement every finding below directly in the repo's files (HTML/JSX/policy text/scripts). Keep the existing design; do not delete accurate content.
4. Commit with clear messages, `git push -u origin HEAD`.
5. Open the PR against the default branch — `GH_TOKEN=$GITHUB_TOKEN gh pr create --repo {repo} ...`, or `curl -X POST https://api.github.com/repos/{repo}/pulls -H "Authorization: Bearer $GITHUB_TOKEN"` if `gh` is missing.
   - Title: `Compliance fixes from ComplyRisk AI audit`
   - Body: a checklist mapping each finding (category + law/articles) to the files changed, then the list of placeholders the owner must fill in.
6. Report the PR URL through structured output. Do not ask for confirmation — work autonomously end to end; mark unknown business facts as `TODO` placeholders instead of stopping.

Never print, log or commit the token.

---

{remediation_md}
"""


async def create_fix_session(repo_input: str, remediation_md: str) -> dict:
    repo = parse_repo(repo_input)
    url, headers = _config()
    body = {
        "title": f"ComplyRisk fixes → {repo}",
        "prompt": _session_prompt(repo, remediation_md),
        "session_secrets": [
            {"key": "GITHUB_TOKEN", "value": settings.GITHUB_TOKEN, "sensitive": True}
        ],
        "structured_output_schema": _PR_SCHEMA,
        "max_acu_limit": settings.DEVIN_MAX_ACU,
        "tags": ["complyrisk", "compliance-fix"],
        "devin_mode": settings.DEVIN_MODE,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise DevinUnavailableError(f"Could not reach Devin API: {exc}")
    if resp.status_code >= 400:
        raise DevinUnavailableError(
            f"Devin rejected session create (HTTP {resp.status_code}): {resp.text[:300]}"
        )
    data = resp.json()
    return {"session_id": data["session_id"], "session_url": data["url"], "repo": repo}


async def get_fix_session(session_id: str) -> dict:
    if not re.fullmatch(r"devin-[A-Za-z0-9]+", session_id):
        raise InvalidRepoError("Invalid Devin session id")
    url, headers = _config()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{url}/{session_id}", headers=headers)
    except httpx.HTTPError as exc:
        raise DevinUnavailableError(f"Could not reach Devin API: {exc}")
    if resp.status_code >= 400:
        raise DevinUnavailableError(
            f"Devin session lookup failed (HTTP {resp.status_code}): {resp.text[:300]}"
        )
    data = resp.json()
    out = data.get("structured_output") or {}
    prs = [p["pr_url"] for p in data.get("pull_requests") or [] if p.get("pr_url")]
    pr_url = out.get("pr_url") or (prs[0] if prs else None)
    return {
        "session_id": data["session_id"],
        "session_url": data["url"],
        "status": data["status"],
        "status_detail": data.get("status_detail"),
        "pr_url": pr_url,
        "summary": out.get("summary"),
        "todo_for_owner": out.get("todo_for_owner") or [],
        "acus_consumed": data.get("acus_consumed"),
    }
