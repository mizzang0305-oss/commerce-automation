from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.tts_generator import (
    BLOCKED_AUDIO,
    BLOCKED_DELIVERY_STYLE,
    BLOCKED_NOT_APPROVED,
    BLOCKED_NOT_KOREAN,
    BLOCKED_PAID_OR_CLOUD,
    BLOCKED_SAPI,
    create_tts_audio,
)


def write_wav(path: Path, duration: float, amplitude: int = 1200) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = int(round(44100 * duration))
    sample = int(amplitude).to_bytes(2, byteorder="little", signed=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(sample * frames)


class TtsGeneratorTest(unittest.TestCase):
    def test_placeholder_remains_explicit_local_test_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "placeholder.wav"
            create_tts_audio("local dry run", target, duration_seconds=1.25)
            with wave.open(str(target), "rb") as wav:
                self.assertAlmostEqual(wav.getnframes() / wav.getframerate(), 1.25, places=2)

    def test_local_provider_requires_approval_and_korean_language(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            command = Path(temp_dir) / "voice.cmd"
            command.write_text("@echo off", encoding="utf-8")
            target = Path(temp_dir) / "voice.wav"
            with self.assertRaisesRegex(RuntimeError, BLOCKED_NOT_APPROVED):
                create_tts_audio("테스트", target, provider="local_command", command=str(command))
            with self.assertRaisesRegex(RuntimeError, BLOCKED_NOT_KOREAN):
                create_tts_audio(
                    "테스트",
                    target,
                    provider="local_command",
                    provider_approved=True,
                    language="en",
                    command=str(command),
                )

    def test_local_provider_requires_exact_delivery_style_before_subprocess(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            command = Path(temp_dir) / "voice.cmd"
            command.write_text("@echo off", encoding="utf-8")
            target = Path(temp_dir) / "voice.wav"
            for delivery_style in ("", "calm_narration"):
                with self.subTest(delivery_style=delivery_style):
                    with patch("src.media.tts_generator.subprocess.run") as run:
                        with self.assertRaisesRegex(RuntimeError, BLOCKED_DELIVERY_STYLE):
                            create_tts_audio(
                                "테스트",
                                target,
                                provider="local_command",
                                provider_approved=True,
                                command=str(command),
                                delivery_style=delivery_style,
                            )
                    run.assert_not_called()

    def test_local_provider_rejects_sapi_and_paid_cloud_markers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "voice.wav"
            sapi = Path(temp_dir) / "system.speech.cmd"
            sapi.write_text("@echo off", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, BLOCKED_SAPI):
                create_tts_audio(
                    "테스트",
                    target,
                    provider="local_command",
                    provider_approved=True,
                    command=str(sapi),
                    delivery_style="brisk_confident_sales",
                )
            paid = Path(temp_dir) / "cloud-voice.cmd"
            paid.write_text("@echo off", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, BLOCKED_PAID_OR_CLOUD):
                create_tts_audio(
                    "테스트",
                    target,
                    provider="local_command",
                    provider_approved=True,
                    command=str(paid),
                    delivery_style="brisk_confident_sales",
                )

    def test_local_provider_generates_and_normalizes_non_silent_wav(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            command = root / "voice.cmd"
            command.write_text("@echo off", encoding="utf-8")
            target = Path("voice.wav")
            original_cwd = Path.cwd()

            def fake_run(args, **_kwargs):
                if "--output" in args:
                    output = Path(args[args.index("--output") + 1])
                    self.assertTrue(output.is_absolute())
                    self.assertEqual(
                        _kwargs["env"]["KOREAN_VOICE_DELIVERY_STYLE"],
                        "brisk_confident_sales",
                    )
                    self.assertEqual(_kwargs["env"]["MELOTTS_SPEED"], "1.250")
                    write_wav(output, 2.0)
                else:
                    write_wav(Path(args[-1]), 1.0)
                return type("Completed", (), {"returncode": 0})()

            try:
                os.chdir(root)
                with patch("src.media.tts_generator.subprocess.run", side_effect=fake_run) as run:
                    result = create_tts_audio(
                        "실제 한국어 음성 테스트",
                        target,
                        duration_seconds=1.0,
                        provider="local_command",
                        provider_approved=True,
                        command=str(command),
                        delivery_style="brisk_confident_sales",
                        speed=1.25,
                    )
            finally:
                os.chdir(original_cwd)

            self.assertEqual(result, (root / target).resolve())
            self.assertEqual(run.call_count, 2)
            self.assertFalse((root / "voice.script.txt").exists())
            self.assertFalse((root / "voice.raw.wav").exists())
            with wave.open(str(root / target), "rb") as wav:
                self.assertAlmostEqual(wav.getnframes() / wav.getframerate(), 1.0, places=2)

    def test_local_provider_rejects_silent_output(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            command = root / "voice.cmd"
            command.write_text("@echo off", encoding="utf-8")
            target = root / "voice.wav"

            def fake_run(args, **_kwargs):
                output = Path(args[args.index("--output") + 1])
                write_wav(output, 1.0, amplitude=0)
                return type("Completed", (), {"returncode": 0})()

            with patch("src.media.tts_generator.subprocess.run", side_effect=fake_run):
                with self.assertRaisesRegex(RuntimeError, BLOCKED_AUDIO):
                    create_tts_audio(
                        "무음 거부 테스트",
                        target,
                        provider="local_command",
                        provider_approved=True,
                        command=str(command),
                        delivery_style="brisk_confident_sales",
                    )


if __name__ == "__main__":
    unittest.main()
