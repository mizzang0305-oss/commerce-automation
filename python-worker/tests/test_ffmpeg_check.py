import unittest
from unittest.mock import patch, Mock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.ffmpeg_check import check_ffmpeg, require_ffmpeg_for_video_render


class FfmpegCheckTest(unittest.TestCase):
    def test_missing_ffmpeg_returns_safe_message(self):
        with patch("src.media.ffmpeg_check.shutil.which", return_value=None):
            status = check_ffmpeg()

        self.assertFalse(status.found)
        self.assertEqual(status.path, "")
        self.assertIn("ffmpeg", status.safe_message)
        self.assertIn("ffmpeg -version", status.safe_message)
        self.assertNotIn("Authorization", status.safe_message)
        self.assertNotIn("WORKER_API_SECRET", status.safe_message)

    def test_require_ffmpeg_raises_safe_error_when_missing(self):
        with patch("src.media.ffmpeg_check.shutil.which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "ffmpeg -version"):
                require_ffmpeg_for_video_render()

    def test_present_ffmpeg_returns_first_version_line(self):
        completed = Mock(stdout="ffmpeg version 7.1-full_build\nextra details\n", stderr="", returncode=0)
        with patch("src.media.ffmpeg_check.shutil.which", return_value="C:/Tools/ffmpeg/bin/ffmpeg.exe"):
            with patch("src.media.ffmpeg_check.subprocess.run", return_value=completed):
                status = check_ffmpeg()

        self.assertTrue(status.found)
        self.assertEqual(status.path, "ffmpeg")
        self.assertEqual(status.version, "ffmpeg version 7.1-full_build")


if __name__ == "__main__":
    unittest.main()
