"""Transcript provenance must not label narration intent as local ASR."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

SERVICE = Path(__file__).resolve().parents[2] / "tools" / "video-automation" / "whisperx_jsonl_service.py"
SPEC = importlib.util.spec_from_file_location("whisperx_jsonl_service_test", SERVICE)
assert SPEC and SPEC.loader
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class WhisperXTranscriptRoleTests(unittest.TestCase):
    def test_narration_intent_is_explicit(self) -> None:
        self.assertEqual(service.provided_transcript_source("narration_intent"), "provided_narration_intent")
        self.assertEqual(service.provided_transcript_source("local_asr"), "provided_local_asr")

    def test_unapproved_role_fails_closed(self) -> None:
        with self.assertRaisesRegex(ValueError, "WHISPERX_TRANSCRIPT_ROLE_INVALID"):
            service.provided_transcript_source("human_verified")


if __name__ == "__main__":
    unittest.main()
