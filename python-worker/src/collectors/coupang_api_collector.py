import os

from .base import CandidateRecord


def collect_coupang_api_candidates() -> list[CandidateRecord]:
    """Return no candidates until official Coupang API credentials are configured."""
    if not os.getenv("COUPANG_ACCESS_KEY") or not os.getenv("COUPANG_SECRET_KEY"):
        return []
    # Official API integration is intentionally deferred to a separate PR.
    return []
