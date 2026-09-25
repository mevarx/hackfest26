"""Deterministic displacement radar for the Market Intelligence agent.

Every row is illustrative demo content written for a Chennai manual tester who
lost her job, not a scrape of a real job board. The figures are stable across
processes so the agent log, the UI and the tests all read the same numbers, and
every payload is stamped ``source="simulated"`` because nothing here was
observed from a live employer or SAP service. The Market Intelligence node never
reports these rows as ``live``.
"""

from typing import Final, Literal, TypedDict

from pydantic import JsonValue

SIMULATED_LABEL: Final[str] = "simulated"
DISCLAIMER: Final[str] = (
    "Illustrative displacement and demand figures bundled with the demo, "
    "not observed job-board data."
)

Exposure = Literal["high", "moderate", "low"]
Demand = Literal["growing", "steady", "contracting"]

DEFAULT_CITY: Final[str] = "Chennai"
MAX_ENTRIES: Final[int] = 4


class DisplacementEntry(TypedDict):
    role: str
    city: str
    exposure: Exposure
    demand: Demand
    openings: int
    median_pay: int
    signal: str


DISPLACEMENT_RADAR: Final[tuple[DisplacementEntry, ...]] = (
    DisplacementEntry(
        role="manual-testing-technician",
        city="Chennai",
        exposure="high",
        demand="contracting",
        openings=4,
        median_pay=420_000,
        signal="Automation tooling is absorbing entry-level manual testing seats.",
    ),
    DisplacementEntry(
        role="qa-test-associate",
        city="Chennai",
        exposure="high",
        demand="steady",
        openings=7,
        median_pay=450_000,
        signal="Backfill demand exists but pays below the current manual tester salary.",
    ),
    DisplacementEntry(
        role="support-operations-lead",
        city="Chennai",
        exposure="moderate",
        demand="growing",
        openings=11,
        median_pay=660_000,
        signal="Escalation desks keep absorbing testers who triage defects well.",
    ),
    DisplacementEntry(
        role="data-quality-analyst",
        city="Chennai",
        exposure="moderate",
        demand="growing",
        openings=6,
        median_pay=780_000,
        signal="SQL data validation is the cheapest bridge from manual testing.",
    ),
    DisplacementEntry(
        role="qa-analyst",
        city="Chennai",
        exposure="low",
        demand="growing",
        openings=14,
        median_pay=620_000,
        signal="Reachable with a short bridge, but pays slightly under the current seat.",
    ),
    DisplacementEntry(
        role="qa-automation-engineer",
        city="Bengaluru",
        exposure="moderate",
        demand="growing",
        openings=23,
        median_pay=1_180_000,
        signal="Highest paid bridge, but it needs scripting evidence she does not have yet.",
    ),
    DisplacementEntry(
        role="product-analyst",
        city="Bengaluru",
        exposure="low",
        demand="steady",
        openings=9,
        median_pay=900_000,
        signal="Requirements interpretation transfers directly from test planning.",
    ),
    DisplacementEntry(
        role="test-manager",
        city="Hyderabad",
        exposure="low",
        demand="steady",
        openings=5,
        median_pay=1_350_000,
        signal="A three-to-five year route once release verification evidence exists.",
    ),
)

DISPLACEMENT_RADAR_BY_CITY: Final[dict[str, tuple[DisplacementEntry, ...]]] = {
    city: tuple(entry for entry in DISPLACEMENT_RADAR if entry["city"] == city)
    for city in dict.fromkeys(entry["city"] for entry in DISPLACEMENT_RADAR)
}


def market_brief(city: str = DEFAULT_CITY, limit: int = MAX_ENTRIES) -> dict[str, JsonValue]:
    """Return the simulated radar rows for one city, capped at ``limit``.

    An unknown city falls back to the whole radar instead of raising so the
    Market Intelligence node always has something honest to show.
    """
    rows = DISPLACEMENT_RADAR_BY_CITY.get(city.strip(), DISPLACEMENT_RADAR)
    selected = rows[: max(0, limit)]
    entries: list[JsonValue] = [
        {
            "role": entry["role"],
            "city": entry["city"],
            "exposure": entry["exposure"],
            "demand": entry["demand"],
            "openings": entry["openings"],
            "median_pay": entry["median_pay"],
            "signal": entry["signal"],
        }
        for entry in selected
    ]
    demand: list[JsonValue] = [entry["demand"] for entry in selected]
    openings = sum(entry["openings"] for entry in selected)
    return {
        "source": SIMULATED_LABEL,
        "city": city.strip() or DEFAULT_CITY,
        "disclaimer": DISCLAIMER,
        "entry_count": len(entries),
        "openings": openings,
        "entry_demand": demand,
        "entries": entries,
    }
