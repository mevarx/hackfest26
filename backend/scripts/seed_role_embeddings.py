"""Seed the role embeddings used by the inclusive matcher.

Run it from the repository root with ``python backend/scripts/seed_role_embeddings.py``
or from ``backend`` with ``python scripts/seed_role_embeddings.py``. Pass
``--regenerate`` to overwrite vectors that were seeded earlier.

The script never needs a model download and never needs SAP HANA: it embeds the
role catalogue with the offline hashing embedder, and when HANA is configured
and reachable it upserts one row per role into ``ROLE_EMBEDDINGS`` and then
verifies the row count with ``hana_client.run_scalar``. When HANA is missing or
rejects the statement it logs a warning and writes
``ROLE_EMBEDDINGS_PATH`` instead, which is the file
``app.services.inclusive_matching`` reads for its simulated pathway. That path is
owned by the application module and imported from it, so the two cannot drift.

``init_hana_schema.sql`` creates ``ROLE_EMBEDDINGS`` with ``ROLE_ID`` and
``EMBEDDING`` only, so the wide upsert is tried first and the two-column upsert
is used when the role attribute columns do not exist yet. Embeddings are bound
as the plain decimal literal that ``REAL_VECTOR`` columns accept.
"""

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
EMBEDDING_PRECISION = 6

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.inclusive_matching import ROLE_EMBEDDINGS_PATH  # noqa: E402

__all__ = ["ROLE_EMBEDDINGS_PATH", "main"]

logger = logging.getLogger("scripts.seed_role_embeddings")

UPSERT_ROLE_EMBEDDING_SQL = """
UPSERT ROLE_EMBEDDINGS (
    ROLE_ID,
    TITLE,
    CITY,
    LANGUAGE,
    COMMUTE_KM,
    WEEKLY_HOURS,
    ANNUAL_PAY,
    REQUIRED_SKILLS,
    EMBEDDING
) VALUES (
    :role_id,
    :title,
    :city,
    :language,
    :commute_km,
    :weekly_hours,
    :annual_pay,
    :required_skills,
    :embedding
)
"""
COUNT_ROLE_EMBEDDINGS_SQL = "SELECT COUNT(*) FROM ROLE_EMBEDDINGS"
UPSERT_ROLE_EMBEDDING_FALLBACK_SQL = """
UPSERT ROLE_EMBEDDINGS (ROLE_ID, EMBEDDING) VALUES (:role_id, :embedding)
"""


@dataclass(frozen=True, slots=True)
class SeedSummary:
    mode: str
    role_count: int
    dimensions: int
    backend: str
    destination: str
    hana_row_count: int | None = None


def build_role_embeddings() -> dict[str, list[float]]:
    """Embed every fixture role once, keyed by role id."""
    from app.mocks.role_fixtures import ROLE_PROFILES, role_embedding_text
    from app.services import embedding_provider

    texts = [role_embedding_text(profile) for profile in ROLE_PROFILES]
    vectors = embedding_provider.embed_texts(texts)
    return {profile.role_id: vector for profile, vector in zip(ROLE_PROFILES, vectors, strict=True)}


def write_role_embeddings(
    embeddings: dict[str, list[float]],
    path: Path | None = None,
) -> Path:
    """Write the local JSON mapping role id to its embedding and return the path.

    One role per line keeps a regenerated file reviewable in a diff.
    """
    target = path if path is not None else ROLE_EMBEDDINGS_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    rows = ",\n".join(
        f"  {json.dumps(role_id)}: {json.dumps(_rounded(vector))}"
        for role_id, vector in sorted(embeddings.items())
    )
    target.write_text(f"{{\n{rows}\n}}\n", encoding="utf-8")
    return target


def read_role_embeddings(path: Path | None = None) -> dict[str, list[float]]:
    """Read a previously seeded JSON mapping, or an empty mapping when absent."""
    target = path if path is not None else ROLE_EMBEDDINGS_PATH
    if not target.is_file():
        return {}
    payload = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{target} does not hold a role id mapping")
    return {str(role_id): list(vector) for role_id, vector in payload.items()}


def seed(overrides: dict[str, Any] | None = None, regenerate: bool = False) -> SeedSummary:
    """Seed HANA when it is configured and reachable, otherwise seed the JSON file."""
    from app.config import Settings
    from app.services import embedding_provider, hana_client

    settings = Settings(**(overrides or {}))
    dimensions = embedding_provider.EMBEDDING_DIMENSIONS
    backend = embedding_provider.active_backend()
    if not regenerate:
        try:
            existing = read_role_embeddings()
        except (OSError, ValueError):
            logger.warning("ignoring an unreadable local seed file", exc_info=True)
            existing = {}
        if existing and all(len(vector) == dimensions for vector in existing.values()):
            logger.info(
                "role embeddings already seeded at %s; pass --regenerate to rebuild them",
                ROLE_EMBEDDINGS_PATH,
            )
            return SeedSummary(
                mode="skipped",
                role_count=len(existing),
                dimensions=dimensions,
                backend=backend,
                destination=str(ROLE_EMBEDDINGS_PATH),
            )
    embeddings = build_role_embeddings()
    if hana_client.is_available(settings):
        try:
            _upsert_roles(settings, embeddings)
            row_count = hana_client.run_scalar(settings, COUNT_ROLE_EMBEDDINGS_SQL)
            logger.info("seeded %d role embeddings into SAP HANA", len(embeddings))
            return SeedSummary(
                mode="live",
                role_count=len(embeddings),
                dimensions=dimensions,
                backend=backend,
                destination="ROLE_EMBEDDINGS",
                hana_row_count=int(row_count) if row_count is not None else None,
            )
        except Exception:
            logger.warning(
                "the SAP HANA role embedding upsert failed; seeding the local JSON file instead",
                exc_info=True,
            )
    destination = write_role_embeddings(embeddings)
    return SeedSummary(
        mode="simulated",
        role_count=len(embeddings),
        dimensions=dimensions,
        backend=backend,
        destination=str(destination),
    )


def main(argv: Sequence[str] | None = None) -> int:
    """Seed the role embeddings and report where they landed."""
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    parser = argparse.ArgumentParser(description="Seed role embeddings for the matcher")
    parser.add_argument(
        "--regenerate",
        action="store_true",
        help="rebuild the embeddings even when a local seed file already exists",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="log the seeding steps",
    )
    arguments = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if arguments.verbose else logging.WARNING,
        format="%(levelname)s %(name)s %(message)s",
    )
    summary = seed(regenerate=arguments.regenerate)
    print(
        f"seeded {summary.role_count} role embeddings "
        f"({summary.dimensions} dimensions, {summary.backend} embedder) -> {summary.destination}"
    )
    return 0


def _upsert_roles(settings: Any, embeddings: dict[str, list[float]]) -> None:
    """Upsert every role, falling back to the two-column table when needed."""
    from app.mocks.role_fixtures import ROLE_PROFILES_BY_ID
    from app.services import hana_client

    wide = {
        role_id: {
            "role_id": ROLE_PROFILES_BY_ID[role_id].role_id,
            "title": ROLE_PROFILES_BY_ID[role_id].title,
            "city": ROLE_PROFILES_BY_ID[role_id].city,
            "language": ROLE_PROFILES_BY_ID[role_id].language,
            "commute_km": ROLE_PROFILES_BY_ID[role_id].commute_km,
            "weekly_hours": ROLE_PROFILES_BY_ID[role_id].weekly_hours,
            "annual_pay": ROLE_PROFILES_BY_ID[role_id].annual_pay,
            "required_skills": json.dumps(ROLE_PROFILES_BY_ID[role_id].required_skills),
            "embedding": _vector_literal(vector),
        }
        for role_id, vector in embeddings.items()
    }
    try:
        for parameters in wide.values():
            hana_client.run_query(settings, UPSERT_ROLE_EMBEDDING_SQL, parameters)
        return
    except Exception:
        logger.info(
            "ROLE_EMBEDDINGS has no role attribute columns; seeding ROLE_ID and EMBEDDING only",
            exc_info=True,
        )
    for role_id, vector in embeddings.items():
        hana_client.run_query(
            settings,
            UPSERT_ROLE_EMBEDDING_FALLBACK_SQL,
            {"role_id": role_id, "embedding": _vector_literal(vector)},
        )


def _vector_literal(vector: Sequence[float]) -> str:
    return ",".join(f"{value:.{EMBEDDING_PRECISION}f}" for value in vector)


def _rounded(vector: Sequence[float]) -> list[float]:
    return [round(value, EMBEDDING_PRECISION) for value in vector]


if __name__ == "__main__":
    raise SystemExit(main())
