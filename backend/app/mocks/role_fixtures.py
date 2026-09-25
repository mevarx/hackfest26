"""Single source of truth for the role catalogue the matcher ranks against.

Role ids reuse the slugs already used by ``app.mocks.hana_fixtures`` so the two
catalogues line up, and every role is written for a manual QA tester who lost
her job in Chennai: each one is reachable with manual-testing experience plus a
short bridge, pay is an annual Chennai figure in rupees, and the two
lowest-paid roles exist so the Wage-Scar Guardrail has something it can
honestly block.
"""

from app.models import RoleProfile

CHENNAI: str = "Chennai"
ENGLISH: str = "English"
TAMIL: str = "Tamil"

ROLE_PROFILES: tuple[RoleProfile, ...] = (
    RoleProfile(
        role_id="qa-analyst",
        title="QA Analyst",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=18,
        weekly_hours=40,
        annual_pay=620_000,
        required_skills=[
            "Test case design",
            "Regression testing",
            "Defect triage",
            "API testing",
            "Test planning",
        ],
    ),
    RoleProfile(
        role_id="sdet",
        title="Software Development Engineer in Test",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=22,
        weekly_hours=45,
        annual_pay=1_450_000,
        required_skills=[
            "Test automation",
            "API testing",
            "CI maintenance",
            "Defect triage",
            "Regression testing",
            "Requirements analysis",
        ],
    ),
    RoleProfile(
        role_id="qa-automation-engineer",
        title="Test Automation Engineer",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=20,
        weekly_hours=40,
        annual_pay=1_180_000,
        required_skills=[
            "Test automation",
            "CI maintenance",
            "API testing",
            "Regression testing",
            "Defect triage",
        ],
    ),
    RoleProfile(
        role_id="product-analyst",
        title="Product Analyst",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=15,
        weekly_hours=40,
        annual_pay=900_000,
        required_skills=[
            "Requirements analysis",
            "Stakeholder communication",
            "Data validation",
            "Test planning",
        ],
    ),
    RoleProfile(
        role_id="data-quality-analyst",
        title="Data Quality Analyst",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=24,
        weekly_hours=40,
        annual_pay=780_000,
        required_skills=[
            "Data validation",
            "API testing",
            "Defect triage",
            "Stakeholder communication",
            "Regression testing",
        ],
    ),
    RoleProfile(
        role_id="test-manager",
        title="Test Manager",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=30,
        weekly_hours=48,
        annual_pay=1_350_000,
        required_skills=[
            "Release verification",
            "CI maintenance",
            "Stakeholder communication",
            "Defect triage",
            "Test planning",
            "Regression testing",
        ],
    ),
    RoleProfile(
        role_id="api-test-engineer",
        title="API Test Engineer",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=19,
        weekly_hours=40,
        annual_pay=1_050_000,
        required_skills=[
            "API testing",
            "API tooling",
            "Test automation",
            "Data validation",
            "Defect triage",
        ],
    ),
    RoleProfile(
        role_id="quality-analyst",
        title="Software Quality Analyst",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=21,
        weekly_hours=40,
        annual_pay=700_000,
        required_skills=[
            "Regression testing",
            "Test case design",
            "Defect triage",
            "Compatibility testing",
            "Requirements analysis",
        ],
    ),
    RoleProfile(
        role_id="support-operations-lead",
        title="Support Operations Lead",
        city=CHENNAI,
        language=TAMIL,
        commute_km=26,
        weekly_hours=42,
        annual_pay=660_000,
        required_skills=[
            "Defect triage",
            "Defect reproduction",
            "Stakeholder communication",
            "Data validation",
        ],
    ),
    RoleProfile(
        role_id="performance-test-engineer",
        title="Performance Test Engineer",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=28,
        weekly_hours=45,
        annual_pay=1_250_000,
        required_skills=[
            "Test automation",
            "API testing",
            "Data validation",
            "CI maintenance",
            "Regression testing",
        ],
    ),
    RoleProfile(
        role_id="mobile-qa-engineer",
        title="Mobile QA Engineer",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=17,
        weekly_hours=40,
        annual_pay=1_100_000,
        required_skills=[
            "Compatibility testing",
            "Regression testing",
            "Test automation",
            "Defect reproduction",
            "API testing",
        ],
    ),
    RoleProfile(
        role_id="business-analyst",
        title="Business Systems Analyst",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=12,
        weekly_hours=40,
        annual_pay=850_000,
        required_skills=[
            "Requirements analysis",
            "Stakeholder communication",
            "Test planning",
            "Data validation",
        ],
    ),
    RoleProfile(
        role_id="compatibility-test-lead",
        title="Compatibility Test Lead",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=34,
        weekly_hours=40,
        annual_pay=950_000,
        required_skills=[
            "Compatibility testing",
            "Regression testing",
            "Test planning",
            "Defect triage",
            "Stakeholder communication",
        ],
    ),
    RoleProfile(
        role_id="qa-test-associate",
        title="QA Test Associate",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=14,
        weekly_hours=40,
        annual_pay=450_000,
        required_skills=[
            "Test case design",
            "Regression testing",
            "Defect reproduction",
            "Defect triage",
        ],
    ),
    RoleProfile(
        role_id="manual-testing-technician",
        title="Manual Testing Technician",
        city=CHENNAI,
        language=ENGLISH,
        commute_km=12,
        weekly_hours=38,
        annual_pay=420_000,
        required_skills=[
            "Test case design",
            "Regression testing",
            "Defect reproduction",
            "Defect triage",
        ],
    ),
)

ROLE_PROFILES_BY_ID: dict[str, RoleProfile] = {
    profile.role_id: profile for profile in ROLE_PROFILES
}


def role_embedding_text(profile: RoleProfile) -> str:
    """Render the text both the seed script and the matcher embed for a role.

    The seed script and the matcher must embed byte-identical text or the
    stored vectors and the live query compare different things.
    """
    skills = ", ".join(profile.required_skills)
    return f"{profile.title}. Required skills: {skills}."
