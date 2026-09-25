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
    "test automation scripting": "Show a working Selenium or Playwright script you wrote.",
    "api testing": "Share a Postman collection or API test you ran.",
    "ci pipeline maintenance": "Link a pipeline you configured or repaired.",
}

CREDENTIAL_THRESHOLD = 70
