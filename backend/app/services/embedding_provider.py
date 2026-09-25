import hashlib
import logging
import math
import os
import re
from collections.abc import Sequence
from functools import lru_cache
from importlib import import_module
from itertools import pairwise
from typing import Any, Final, Literal

logger = logging.getLogger(__name__)

EmbeddingBackend = Literal["sentence_transformers", "hashing"]

EMBEDDING_DIMENSIONS: Final[int] = 384
MODEL_NAME: Final[str] = "all-MiniLM-L6-v2"
MODEL_MODULE: Final[str] = "sentence_transformers"
BACKEND_ENV_VAR: Final[str] = "REROUTE_EMBEDDING_BACKEND"
MODEL_BACKEND: Final[EmbeddingBackend] = "sentence_transformers"
HASHING_BACKEND: Final[EmbeddingBackend] = "hashing"
AUTO_BACKEND: Final[str] = "auto"
TOKEN_PATTERN: Final[re.Pattern[str]] = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def is_model_available() -> bool:
    """Report whether the optional sentence-transformers model can be imported.

    This never constructs the model, so calling it performs no download.
    """
    try:
        import_module(MODEL_MODULE)
    except Exception:
        return False
    return True


def active_backend() -> EmbeddingBackend:
    """Resolve which embedder embed_texts will use for this process.

    REROUTE_EMBEDDING_BACKEND=model loads sentence-transformers,
    REROUTE_EMBEDDING_BACKEND=hashing forces the offline embedder, and the
    default "auto" uses the model only when it is importable.
    """
    requested = os.environ.get(BACKEND_ENV_VAR, AUTO_BACKEND).strip().casefold()
    if requested == HASHING_BACKEND:
        return HASHING_BACKEND
    if requested == MODEL_BACKEND:
        return MODEL_BACKEND
    return MODEL_BACKEND if is_model_available() else HASHING_BACKEND


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """Embed every text, using the model when available and hashing otherwise.

    Every returned vector holds exactly EMBEDDING_DIMENSIONS L2-normalized
    floats so the same helper can validate live HANA rows and local fixtures.
    """
    if not texts:
        return []
    if active_backend() == MODEL_BACKEND:
        model = _load_model()
        if model is not None:
            try:
                return _model_vectors(model, texts)
            except Exception:
                logger.warning(
                    "sentence-transformers embedding failed; using the offline hashing embedder",
                    exc_info=True,
                )
    return [hashing_embedding(text) for text in texts]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def hashing_embedding(text: str) -> list[float]:
    """Return a deterministic 384-dimension embedding without any model.

    Unigrams and adjacent bigrams are hashed with BLAKE2b into
    EMBEDDING_DIMENSIONS buckets, the low bit of a separate digest byte picks a
    positive or negative weight so unrelated text cancels out instead of always
    looking similar, and the bucket vector is L2 normalized. The same text
    always yields the same vector across processes and machines. Text without
    any token maps to a fixed unit vector instead of an all-zero vector, so
    cosine similarity stays defined.
    """
    vector = [0.0] * EMBEDDING_DIMENSIONS
    tokens = TOKEN_PATTERN.findall(text.casefold())
    features = [*tokens, *(f"{first}_{second}" for first, second in pairwise(tokens))]
    for feature in features:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSIONS
        vector[bucket] += 1.0 if digest[4] & 1 else -1.0
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        vector[0] = 1.0
        return vector
    return [value / norm for value in vector]


def validate_embedding(vector: Sequence[float], label: str = "embedding") -> list[float]:
    """Return the embedding as a plain float list or reject a wrong length."""
    if len(vector) != EMBEDDING_DIMENSIONS:
        raise ValueError(f"{label} must have {EMBEDDING_DIMENSIONS} dimensions, got {len(vector)}")
    return [float(value) for value in vector]


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    """Return the cosine similarity of two 384-dimension embeddings in [-1, 1].

    A zero vector scores 0.0 rather than raising so a missing fixture can never
    break a ranking.
    """
    left_values = validate_embedding(left, "left embedding")
    right_values = validate_embedding(right, "right embedding")
    dot = sum(a * b for a, b in zip(left_values, right_values, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


@lru_cache(maxsize=1)
def _load_model() -> Any | None:
    """Load sentence-transformers once, or return None when it is unusable."""
    try:
        module = import_module(MODEL_MODULE)
    except Exception:
        logger.debug("sentence-transformers is not installed; using the offline embedder")
        return None
    try:
        return module.SentenceTransformer(MODEL_NAME)
    except Exception:
        logger.warning(
            "could not load the %s model; using the offline hashing embedder",
            MODEL_NAME,
            exc_info=True,
        )
        return None


def _model_vectors(model: Any, texts: Sequence[str]) -> list[list[float]]:
    raw = model.encode(
        list(texts),
        convert_to_numpy=False,
        normalize_embeddings=False,
        show_progress_bar=False,
    )
    return [
        validate_embedding([float(value) for value in vector], f"embedding for {text[:32]!r}")
        for vector, text in zip(raw, texts, strict=True)
    ]
