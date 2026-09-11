from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python-worker"))

from src.media import video_renderer as RENDERER  # noqa: E402

SPEC = importlib.util.spec_from_file_location(
    "local_media_bridge_transport",
    ROOT / "tools" / "video-automation" / "local_media_bridge.py",
)
assert SPEC and SPEC.loader
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)


class VideoRendererFiltergraphTransportTests(unittest.TestCase):
    def test_historical_inline_graph_exceeds_windows_limit(self) -> None:
        historical_tail = "C:/" + ("long/" * 1400) + "input.jpg"
        command = ["ffmpeg.exe", "-filter_complex", "x" * 27458, "-i", historical_tail]
        self.assertGreater(
            RENDERER.windows_command_line_metrics(command)["effectiveCommandLineCharsIncludingTerminator"],
            RENDERER.WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT,
        )

    def test_file_backed_graph_is_below_windows_limit(self) -> None:
        command = ["ffmpeg.exe", "-/filter_complex", "C:/owned temp/filtergraph.ffscript", *("-i", "C:/input.jpg") * 14]
        self.assertLess(
            RENDERER.windows_command_line_metrics(command)["effectiveCommandLineCharsIncludingTerminator"],
            RENDERER.WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT,
        )

    def test_graph_bytes_and_hash_are_preserved_after_reopen(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            graph = "color=c=검정:s=16x16:d=0.1[video]"
            script, metadata = RENDERER._write_owned_filtergraph(root, graph)
            self.assertEqual(script.read_bytes(), graph.encode("utf-8"))
            self.assertEqual(metadata["filterGraphSha256"], metadata["filterScriptSha256"])
            self.assertEqual(metadata["scriptFileSize"], len(graph.encode("utf-8")))

    def test_script_is_inside_owned_temp_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            script, metadata = RENDERER._write_owned_filtergraph(root, "null[video]")
            self.assertEqual(script.parent, root)
            self.assertEqual(metadata["scriptPathClassification"], "RENDER_INVOCATION_TEMP")

    def test_script_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            real = root / "real.ffscript"
            real.write_text("null[video]", encoding="utf-8")
            link = root / "filtergraph.ffscript"
            try:
                link.symlink_to(real)
            except OSError as exc:
                self.skipTest(f"symlink unavailable: {exc}")
            with self.assertRaisesRegex(ValueError, "LOCAL_MEDIA_FILTER_SCRIPT_INVALID"):
                RENDERER._validate_owned_filtergraph(root, link, RENDERER._sha256_bytes(real.read_bytes()))

    def test_reparse_root_is_rejected_deterministically(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with mock.patch.object(RENDERER, "_is_reparse_path", return_value=True):
                with self.assertRaisesRegex(ValueError, "LOCAL_MEDIA_FILTER_SCRIPT_ROOT_REPARSE_REJECTED"):
                    RENDERER._write_owned_filtergraph(root, "null[video]")

    def test_missing_script_fails_closed_before_spawn(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            with self.assertRaisesRegex(RuntimeError, "LOCAL_MEDIA_FILTER_SCRIPT_MISSING"):
                RENDERER._validate_owned_filtergraph(root, root / "missing.ffscript", "0" * 64)

    @unittest.skipUnless(os.name == "nt", "Windows CreateProcess contract")
    def test_oversized_command_is_caught_before_popen_without_pid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            BRIDGE.begin_trace({"operation": "inspect", "output": str(root / "out.mp4")})
            with mock.patch.object(BRIDGE.subprocess, "Popen") as popen:
                with self.assertRaisesRegex(RuntimeError, "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"):
                    BRIDGE.run_captured_process([sys.executable, "x" * 40000], check=True)
                popen.assert_not_called()
            process = BRIDGE.failure_diagnostic(RuntimeError("WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED"))["processes"][0]
            self.assertFalse(process["processStarted"])
            self.assertIsNone(process["pid"])

    def test_small_sequence_command_uses_current_file_option(self) -> None:
        command = RENDERER.build_render_command(
            Path("a.jpg"), Path("a.wav"), Path("a.srt"), Path("out.mp4"), "ffmpeg",
            shot_durations=[1, 1], shot_image_paths=[Path("a.jpg"), Path("b.jpg")],
            filter_complex="null[video]", filter_complex_path=Path("owned path/filtergraph.ffscript"),
        )
        self.assertIn("-/filter_complex", command)
        self.assertNotIn("-filter_complex", command)
        self.assertNotIn("null[video]", command)

    def test_concurrent_roots_and_scripts_are_unique(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            roots = [RENDERER._create_owned_render_root(parent / f"out-{index}.mp4") for index in range(4)]
            try:
                scripts = [RENDERER._write_owned_filtergraph(root, "null[video]")[0] for root in roots]
                self.assertEqual(len(set(roots)), 4)
                self.assertEqual(len(set(scripts)), 4)
            finally:
                for index, root in enumerate(roots):
                    RENDERER._cleanup_owned_render_root(root, parent / f"out-{index}.mp4")

    def test_one_cleanup_cannot_remove_sibling_script(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            target_a, target_b = parent / "a.mp4", parent / "b.mp4"
            root_a = RENDERER._create_owned_render_root(target_a)
            root_b = RENDERER._create_owned_render_root(target_b)
            script_b, _ = RENDERER._write_owned_filtergraph(root_b, "null[video]")
            RENDERER._cleanup_owned_render_root(root_a, target_a)
            self.assertTrue(script_b.is_file())
            RENDERER._cleanup_owned_render_root(root_b, target_b)

    def test_filter_script_lives_until_runner_returns(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            for name in ("a.jpg", "b.jpg", "a.wav", "a.srt"):
                (parent / name).write_bytes(b"fixture")
            observed = {}
            def runner(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
                script = Path(command[command.index("-/filter_complex") + 1])
                observed["present"] = script.is_file()
                Path(command[-1]).write_bytes(b"video")
                return subprocess.CompletedProcess(command, 0, "", "")
            RENDERER.render_vertical_video(
                parent / "a.jpg", parent / "a.wav", parent / "a.srt", parent / "out.mp4", "title", "ffmpeg",
                shot_durations=[1, 1], shot_image_paths=[parent / "a.jpg", parent / "b.jpg"], process_runner=runner,
            )
            self.assertTrue(observed["present"])
            self.assertFalse(any(parent.glob(".render-*")))

    def test_failed_runner_cleans_owned_root_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            sibling = parent / "sibling.txt"
            sibling.write_text("keep", encoding="utf-8")
            for name in ("a.jpg", "b.jpg", "a.wav", "a.srt"):
                (parent / name).write_bytes(b"fixture")
            def runner(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
                raise subprocess.CalledProcessError(1, command)
            with self.assertRaises(subprocess.CalledProcessError):
                RENDERER.render_vertical_video(
                    parent / "a.jpg", parent / "a.wav", parent / "a.srt", parent / "out.mp4", "title", "ffmpeg",
                    shot_durations=[1, 1], shot_image_paths=[parent / "a.jpg", parent / "b.jpg"], process_runner=runner,
                )
            self.assertEqual(sibling.read_text(encoding="utf-8"), "keep")
            self.assertFalse(any(parent.glob(".render-*")))

    def test_successful_renderer_publication_is_atomic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            for name in ("a.jpg", "a.wav", "a.srt"):
                (parent / name).write_bytes(b"fixture")
            diagnostic = {}
            def runner(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
                Path(command[-1]).write_bytes(b"complete")
                return subprocess.CompletedProcess(command, 0, "", "")
            output = RENDERER.render_vertical_video(
                parent / "a.jpg", parent / "a.wav", parent / "a.srt", parent / "out.mp4", "title", "ffmpeg",
                process_runner=runner, lifecycle_diagnostic=diagnostic,
            )
            self.assertEqual(output.read_bytes(), b"complete")
            self.assertTrue(diagnostic["atomicPublication"])

    def test_sanitized_diagnostic_never_contains_raw_graph(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _, metadata = RENDERER._write_owned_filtergraph(Path(directory).resolve(), "secret-local-path[video]")
            self.assertNotIn("secret-local-path", repr(metadata))
            self.assertFalse(metadata["rawFilterGraphStored"])

    def test_windows_quoting_with_spaces_is_measured_by_list2cmdline(self) -> None:
        command = [r"C:\Program Files\ffmpeg\ffmpeg.exe", "-/filter_complex", r"C:\owned temp\filtergraph.ffscript"]
        metrics = RENDERER.windows_command_line_metrics(command)
        self.assertEqual(metrics["effectiveCommandLineChars"], len(subprocess.list2cmdline(command)))
        self.assertEqual(metrics["effectiveCommandLineCharsIncludingTerminator"], metrics["effectiveCommandLineChars"] + 1)

    def test_winerror_206_maps_to_exact_safe_error_without_retry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            BRIDGE.begin_trace({"operation": "inspect", "output": str(root / "out.mp4")})
            error = FileNotFoundError(2, "too long", sys.executable)
            error.winerror = 206
            with mock.patch.object(BRIDGE.subprocess, "Popen", side_effect=error):
                with self.assertRaises(FileNotFoundError):
                    BRIDGE.run_captured_process([sys.executable, "-V"], check=True)
            diagnostic = BRIDGE.failure_diagnostic(error)
            self.assertEqual(diagnostic["safeError"], "WINDOWS_CREATEPROCESS_COMMAND_LINE_LIMIT_EXCEEDED")
            self.assertEqual(diagnostic["retryDecision"]["reason"], "DETERMINISTIC_WINDOWS_COMMAND_LINE_LIMIT")


if __name__ == "__main__":
    unittest.main()
