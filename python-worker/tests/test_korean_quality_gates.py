from pathlib import Path
import json
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.korean_asr_validator import validate_korean_asr
from src.media.korean_text_normalizer import normalize_korean_tts_text
from src.media.render_output_validator import validate_render_output
from src.media.video_renderer import HOOK_FONT_SIZE


class KoreanQualityGatesTest(unittest.TestCase):
    def test_tts_normalization_and_hook_size(self):
        self.assertEqual(
            normalize_korean_tts_text("에어컨+선풍기 · 빠르게!"),
            "에어컨 플러스 선풍기, 빠르게!",
        )
        self.assertGreaterEqual(HOOK_FONT_SIZE, 100)

    def test_asr_requires_similarity_and_product_anchor(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            audio = root / "voice.wav"
            audio.write_bytes(b"RIFF" + b"\0" * 100)
            python = root / "python.exe"
            validator = root / "validate.py"
            python.write_text("", encoding="utf-8")
            validator.write_text("", encoding="utf-8")

            def completed(*args, **kwargs):
                slot = root / "work" / "asr" / "morning_commute"
                slot.mkdir(parents=True, exist_ok=True)
                (slot / "asr-probe.json").write_text(
                    json.dumps({"similarity": 0.91}), encoding="utf-8"
                )
                (slot / "asr-transcript.txt").write_text(
                    "장마철 제습기 사용 팁", encoding="utf-8"
                )
                return type("Completed", (), {"returncode": 0})()

            with patch("src.media.korean_asr_validator.subprocess.run", side_effect=completed):
                result = validate_korean_asr(
                    audio_path=audio,
                    expected_script="장마철 제습기 사용 팁",
                    product_name="빠른 건조 제습기",
                    work_dir=root / "work",
                    provider="faster_whisper_local_command",
                    provider_approved=True,
                    python_executable=str(python),
                    validator_script=str(validator),
                    model="small",
                    similarity_threshold=0.82,
                    timeout_seconds=30,
                )
            self.assertTrue(result["pass"])
            self.assertTrue(result["product_anchor_recognized"])
            self.assertNotIn("transcript", result)

    def test_render_output_requires_h264_aac_vertical_video(self):
        with TemporaryDirectory() as temp_dir:
            video = Path(temp_dir) / "video.mp4"
            video.write_bytes(b"video")
            completed = type(
                "Completed",
                (),
                {"stdout": "", "stderr": "Video: h264, yuv420p, 1080x1920\nAudio: aac, 44100 Hz"},
            )()
            with patch("src.media.render_output_validator.subprocess.run", return_value=completed):
                result = validate_render_output(video, "ffmpeg")
            self.assertEqual(result["video_codec"], "h264")
            self.assertEqual(result["audio_codec"], "aac")
            self.assertTrue(result["audio_present"])


if __name__ == "__main__":
    unittest.main()
