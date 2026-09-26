"""Deterministic fixtures for the mocked SAP GenAI Hub pathway.

``SKILL_CATALOG`` pairs a transcript search term with the canonical skill name it
resolves to. ``NEEDS_PROOF_TERMS`` is keyed by that canonical name -- the value
extraction actually produces -- and carries the evidence request shown to the
worker for a skill that cannot be self-attested.
"""

SKILL_CATALOG: tuple[tuple[str, str], ...] = (
    ("manual test case design", "Test case design"),
    ("defect reporting", "Defect triage"),
    ("regression testing", "Regression testing"),
    ("test automation scripting", "Test automation"),
    ("api testing", "API testing"),
    ("sql and data validation", "Data validation"),
    ("defect reproduction", "Defect reproduction"),
    ("requirements interpretation", "Requirements analysis"),
    ("stakeholder communication", "Stakeholder communication"),
    ("release verification", "Release verification"),
    ("jira defect tracking", "Defect tracking"),
    ("cross-browser compatibility testing", "Compatibility testing"),
    ("postman collections", "API tooling"),
    ("test plan authoring", "Test planning"),
    ("ci pipeline maintenance", "CI maintenance"),
)

NEEDS_PROOF_TERMS: dict[str, str] = {
    "Test automation": "Show a working Selenium or Playwright script you wrote.",
    "API testing": "Share a Postman collection or API test you ran.",
    "CI maintenance": "Link a pipeline you configured or repaired.",
}

PROOF_REQUESTS_BY_SKILL: dict[str, str] = {
    name.casefold(): text for name, text in NEEDS_PROOF_TERMS.items()
}

CREDENTIAL_THRESHOLD = 70


def proof_request_for(skill_name: str) -> str | None:
    """The evidence a worker must supply for ``skill_name``, if it needs any."""
    return PROOF_REQUESTS_BY_SKILL.get(skill_name.casefold())
