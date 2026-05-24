import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.media.ffmpeg_check import check_ffmpeg, require_ffmpeg_for_video_render


class FfmpegCheckTest(unittest.TestCase):
    def test_missing_all_ffmpeg_sources_returns_safe_message(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(sys.modules, {"imageio_ffmpeg": None}):
                with patch("src.media.ffmpeg_check.shutil.which", return_value=None):
                    status = check_ffmpeg()

        self.assertFalse(status.found)
        self.assertEqual(status.source, "")
        self.assertEqual(status.exe, "")
        self.assertIn("ffmpeg", status.safe_message)
        self.assertIn("imageio-ffmpeg", status.safe_message)
        self.assertNotIn("Authorization", status.safe_message)
        self.assertNotIn("SECRET", status.safe_message)
        self.assertNotIn("API_KEY", status.safe_message)

    def test_env_ffmpeg_path_has_priority(self):
        completed = Mock(stdout="ffmpeg version env-build\n", stderr="", returncode=0)
        with patch.dict(os.environ, {"IMAGEIO_FFMPEG_EXE": "C:/Tools/ffmpeg/bin/ffmpeg.exe"}, clear=True):
            with patch("src.media.ffmpeg_check.subprocess.run", return_value=completed) as run:
                status = check_ffmpeg()

        self.assertTrue(status.found)
        self.assertEqual(status.source, "env")
        self.assertEqual(status.exe, "C:/Tools/ffmpeg/bin/ffmpeg.exe")
        self.assertEqual(status.version, "ffmpeg version env-build")
        run.assert_called_once()

    def test_imageio_ffmpeg_fallback_is_used_before_system_path(self):
        completed = Mock(stdout="ffmpeg version imageio-build\n", stderr="", returncode=0)
        fake_imageio = Mock()
        fake_imageio.get_ffmpeg_exe.return_value = "C:/imageio/ffmpeg.exe"

        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(sys.modules, {"imageio_ffmpeg": fake_imageio}):
                with patch("src.media.ffmpeg_check.shutil.which", return_value="C:/System/ffmpeg.exe"):
                    with patch("src.media.ffmpeg_check.subprocess.run", return_value=completed):
                        status = check_ffmpeg()

        fake_imageio.get_ffmpeg_exe.assert_called_once()
        self.assertTrue(status.found)
        self.assertEqual(status.source, "imageio-ffmpeg")
        self.assertEqual(status.exe, "C:/imageio/ffmpeg.exe")

    def test_system_path_is_used_when_imageio_is_unavailable(self):
        completed = Mock(stdout="ffmpeg version system-build\n", stderr="", returncode=0)
        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(sys.modules, {"imageio_ffmpeg": None}):
                with patch("src.media.ffmpeg_check.shutil.which", return_value="C:/System/ffmpeg.exe"):
                    with patch("src.media.ffmpeg_check.subprocess.run", return_value=completed):
                        status = check_ffmpeg()

        self.assertTrue(status.found)
        self.assertEqual(status.source, "system-path")
        self.assertEqual(status.exe, "C:/System/ffmpeg.exe")

    def test_ffmpeg_version_failure_returns_safe_message(self):
        with patch.dict(os.environ, {"IMAGEIO_FFMPEG_EXE": "C:/Tools/ffmpeg/bin/ffmpeg.exe"}, clear=True):
            with patch("src.media.ffmpeg_check.subprocess.run", side_effect=OSError("boom")):
                status = check_ffmpeg()

        self.assertFalse(status.found)
        self.assertEqual(status.source, "env")
        self.assertEqual(status.exe, "")
        self.assertEqual(status.version, "")
        self.assertIn("ffmpeg -version", status.safe_message)
        self.assertNotIn("Authorization", status.safe_message)
        self.assertNotIn("API key", status.safe_message)

    def test_require_ffmpeg_returns_resolved_exe(self):
        completed = Mock(stdout="ffmpeg version imageio-build\n", stderr="", returncode=0)
        fake_imageio = Mock()
        fake_imageio.get_ffmpeg_exe.return_value = "C:/imageio/ffmpeg.exe"

        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(sys.modules, {"imageio_ffmpeg": fake_imageio}):
                with patch("src.media.ffmpeg_check.subprocess.run", return_value=completed):
                    exe = require_ffmpeg_for_video_render()

        self.assertEqual(exe, "C:/imageio/ffmpeg.exe")

    def test_require_ffmpeg_raises_safe_error_when_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch.dict(sys.modules, {"imageio_ffmpeg": None}):
                with patch("src.media.ffmpeg_check.shutil.which", return_value=None):
                    with self.assertRaisesRegex(RuntimeError, "imageio-ffmpeg"):
                        require_ffmpeg_for_video_render()


if __name__ == "__main__":
    unittest.main()
