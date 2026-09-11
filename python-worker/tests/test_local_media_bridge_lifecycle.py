from __future__ import annotations

import importlib.util
import errno
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "local_media_bridge",
    ROOT / "tools" / "video-automation" / "local_media_bridge.py",
)
assert SPEC and SPEC.loader
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)


class LocalMediaBridgeLifecycleTests(unittest.TestCase):
    def begin(self, root: Path, **context: str) -> None:
        BRIDGE.begin_trace({
            "operation": "render_v2",
            "output": str(root / "attempt" / "output.mp4"),
            "input_root": str(root),
            "image_paths": [],
            "audio_path": str(root / "audio.wav"),
            "diagnostic_context": context,
        })

    def test_render_inputs_are_realpath_contained_and_hash_bound(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            image = root / "image.jpg"
            audio = root / "audio.wav"
            image.write_bytes(b"image-bytes")
            audio.write_bytes(b"audio-bytes")
            paths, resolved_audio, digest = BRIDGE.resolve_render_inputs({
                "input_root": str(root),
                "image_paths": [str(image)],
                "audio_path": str(audio),
            })
            self.assertEqual(paths, [image.resolve()])
            self.assertEqual(resolved_audio, audio.resolve())
            self.assertRegex(digest, r"^[a-f0-9]{64}$")

    def test_render_input_outside_owned_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory).resolve()
            image = Path(outside).resolve() / "image.jpg"
            audio = root / "audio.wav"
            image.write_bytes(b"image")
            audio.write_bytes(b"audio")
            with self.assertRaisesRegex(ValueError, "LOCAL_MEDIA_INPUT_OUTSIDE_ROOT"):
                BRIDGE.resolve_render_inputs({
                    "input_root": str(root),
                    "image_paths": [str(image)],
                    "audio_path": str(audio),
                })

    def test_output_publication_is_atomic_and_never_reuses_stale_target(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory).resolve() / "output.mp4"
            temporary = BRIDGE.owned_temporary_output(output)
            temporary.write_bytes(b"rendered-video")
            BRIDGE.publish_atomic_output(temporary, output)
            self.assertEqual(output.read_bytes(), b"rendered-video")
            self.assertFalse(temporary.exists())
            with self.assertRaisesRegex(ValueError, "LOCAL_MEDIA_OUTPUT_CONFLICT"):
                BRIDGE.owned_temporary_output(output)

    def test_native_tool_is_resolved_to_an_existing_absolute_file(self) -> None:
        resolved = Path(BRIDGE.resolve_local_tool(sys.executable))
        self.assertTrue(resolved.is_absolute())
        self.assertTrue(resolved.is_file())
        self.assertRegex(BRIDGE.file_sha256(resolved), r"^[a-f0-9]{64}$")

    def test_product_reference_uses_contain_with_safe_margin_motion(self) -> None:
        reference_filter = BRIDGE.scene_motion_base_filter(0, "product_reference")
        generic_filter = BRIDGE.scene_motion_base_filter(1, "generic_usage_example")
        self.assertIn("force_original_aspect_ratio=decrease", reference_filter)
        self.assertIn("scale=1000:1800", reference_filter)
        self.assertIn("pad=1160:2000", reference_filter)
        self.assertIn("crop=1080:1920", reference_filter)
        self.assertIn("40+40*sin(2*PI*t/2.4)", reference_filter)
        self.assertIn("force_original_aspect_ratio=increase", generic_filter)
        self.assertIn("crop=1080:1920", generic_filter)

    def test_executable_missing_before_spawn_has_phase_and_no_fake_pid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root, slotId="SLOT_011", candidateId="candidate-1")
            missing = root / "missing-ffmpeg.exe"
            with self.assertRaises(FileNotFoundError) as raised:
                BRIDGE.run_captured_process([str(missing), "-version"], check=True, capture_output=True, text=True)
            diagnostic = BRIDGE.failure_diagnostic(raised.exception)
            self.assertEqual(diagnostic["failurePhase"], "SPAWN_FFMPEG")
            self.assertEqual(diagnostic["missingObject"]["kind"], "executable")
            process = diagnostic["processes"][0]
            self.assertFalse(process["processStarted"])
            self.assertIsNone(process["pid"])

    def test_input_missing_has_exact_phase_errno_and_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            audio = root / "audio.wav"
            audio.write_bytes(b"audio")
            request = {"input_root": str(root), "image_paths": [str(root / "missing.jpg")], "audio_path": str(audio)}
            BRIDGE.begin_trace({**request, "operation": "render_v2", "output": str(root / "output.mp4")})
            with self.assertRaises(FileNotFoundError) as raised:
                BRIDGE.resolve_render_inputs(request)
            diagnostic = BRIDGE.failure_diagnostic(raised.exception)
            self.assertEqual(diagnostic["failurePhase"], "VALIDATE_INPUT_PATH")
            self.assertEqual(diagnostic["errno"], errno.ENOENT)
            self.assertEqual(diagnostic["missingObject"]["kind"], "input")
            self.assertEqual(diagnostic["missingObject"]["primary"]["basename"], "missing.jpg")

    def test_input_lifetime_records_present_then_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            image = root / "image.jpg"
            audio = root / "audio.wav"
            image.write_bytes(b"image")
            audio.write_bytes(b"audio")
            request = {"input_root": str(root), "image_paths": [str(image)], "audio_path": str(audio)}
            BRIDGE.begin_trace({**request, "operation": "render_v2", "output": str(root / "output.mp4")})
            BRIDGE.resolve_render_inputs(request)
            image.unlink()
            BRIDGE.set_phase("STAT_INPUT", "input", image)
            try:
                image.stat()
                self.fail("expected FileNotFoundError")
            except FileNotFoundError as error:
                diagnostic = BRIDGE.failure_diagnostic(error)
            pre = next(item for item in diagnostic["inputLifetime"]["preRender"] if item["basename"] == "image.jpg")
            current = next(item for item in diagnostic["inputLifetime"]["atFailure"] if item["basename"] == "image.jpg")
            self.assertTrue(pre["exists"])
            self.assertFalse(current["exists"])

    def test_missing_temp_output_is_file_not_found_at_stat_phase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            output = root / "output.mp4"
            temporary = root / ".output.mp4.1.missing.tmp.mp4"
            with self.assertRaises(FileNotFoundError) as raised:
                BRIDGE.publish_atomic_output(temporary, output)
            diagnostic = BRIDGE.failure_diagnostic(raised.exception)
            self.assertEqual(diagnostic["failurePhase"], "STAT_TEMP_OUTPUT")
            self.assertEqual(diagnostic["missingObject"]["kind"], "temp_output")

    def test_output_parent_missing_is_distinct_from_source_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            temporary = root / ".output.mp4.1.owned.tmp.mp4"
            temporary.write_bytes(b"rendered")
            output = root / "missing-parent" / "output.mp4"
            with self.assertRaises(FileNotFoundError) as raised:
                BRIDGE.publish_atomic_output(temporary, output)
            diagnostic = BRIDGE.failure_diagnostic(raised.exception)
            self.assertEqual(diagnostic["failurePhase"], "PREPARE_ATOMIC_PUBLICATION")
            self.assertEqual(diagnostic["missingObject"]["kind"], "output_parent")

    def test_cleanup_only_deletes_owned_temporary_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            output = root / "output.mp4"
            temporary = BRIDGE.owned_temporary_output(output)
            temporary.write_bytes(b"partial")
            BRIDGE.cleanup_owned_temporary_output(temporary, output)
            self.assertFalse(temporary.exists())
            unrelated = root / "next-candidate.tmp.mp4"
            unrelated.write_bytes(b"next")
            with self.assertRaisesRegex(ValueError, "LOCAL_MEDIA_TEMP_OWNERSHIP_MISMATCH"):
                BRIDGE.cleanup_owned_temporary_output(unrelated, output)
            self.assertTrue(unrelated.exists())

    def test_sibling_candidate_temporary_outputs_are_unique_and_isolated(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            output_a = root / "candidate-a" / "output.mp4"
            output_b = root / "candidate-b" / "output.mp4"
            temporary_a = BRIDGE.owned_temporary_output(output_a)
            temporary_b = BRIDGE.owned_temporary_output(output_b)
            self.assertNotEqual(temporary_a, temporary_b)
            temporary_a.write_bytes(b"a")
            temporary_b.write_bytes(b"b")
            BRIDGE.cleanup_owned_temporary_output(temporary_a, output_a)
            self.assertTrue(temporary_b.exists())

    def test_sibling_slot_temporary_outputs_never_collide(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            paths = [BRIDGE.owned_temporary_output(root / f"slot-{index}" / "output.mp4") for index in range(3)]
            self.assertEqual(len(set(paths)), 3)

    def test_fallback_cleanup_cannot_delete_next_candidate_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            prior_output = root / "fallback-1" / "output.mp4"
            next_output = root / "fallback-2" / "output.mp4"
            prior_temp = BRIDGE.owned_temporary_output(prior_output)
            next_temp = BRIDGE.owned_temporary_output(next_output)
            prior_temp.write_bytes(b"prior")
            next_temp.write_bytes(b"next")
            BRIDGE.cleanup_owned_temporary_output(prior_temp, prior_output)
            self.assertEqual(next_temp.read_bytes(), b"next")

    def test_errno_and_winerror_are_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            error = FileNotFoundError(errno.ENOENT, "missing", str(root / "missing"))
            error.winerror = 3
            diagnostic = BRIDGE.failure_diagnostic(error)
            self.assertEqual(diagnostic["errno"], errno.ENOENT)
            self.assertEqual(diagnostic["winerror"], 3)
            self.assertEqual(diagnostic["strerrorCategory"], "ENOENT")

    def test_child_exit_preserves_real_pid_and_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            with self.assertRaises(subprocess.CalledProcessError) as raised:
                BRIDGE.run_captured_process([sys.executable, "-c", "raise SystemExit(7)"], check=True, capture_output=True, text=True)
            diagnostic = BRIDGE.failure_diagnostic(raised.exception)
            process = diagnostic["processes"][0]
            self.assertTrue(process["processStarted"])
            self.assertGreater(process["pid"], 0)
            self.assertEqual(process["exitCode"], 7)

    def test_process_success_preserves_output_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            completed = BRIDGE.run_captured_process([sys.executable, "-c", "print('ok')"], check=True, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0)
            process = BRIDGE.success_diagnostic()["processes"][0]
            self.assertRegex(process["stdoutSha256"], r"^[a-f0-9]{64}$")
            self.assertEqual(process["exitCode"], 0)

    def test_file_not_found_diagnostic_never_authorizes_blind_retry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            error = FileNotFoundError(errno.ENOENT, "missing", str(root / "missing"))
            diagnostic = BRIDGE.failure_diagnostic(error)
            self.assertEqual(diagnostic["retryDecision"], {"allowed": False, "reason": "ROOT_CAUSE_NOT_PROVEN"})

    def test_executable_hash_mismatch_class_never_authorizes_retry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            diagnostic = BRIDGE.failure_diagnostic(ValueError("LOCAL_MEDIA_TOOL_HASH_MISMATCH"))
            self.assertFalse(diagnostic["retryDecision"]["allowed"])

    def test_failed_publication_never_exposes_partial_media(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            output = root / "output.mp4"
            temporary = root / ".output.mp4.1.missing.tmp.mp4"
            with self.assertRaises(FileNotFoundError):
                BRIDGE.publish_atomic_output(temporary, output)
            self.assertFalse(output.exists())

    def test_successful_publication_is_atomic_and_final_is_hashed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.begin(root)
            output = root / "output.mp4"
            temporary = BRIDGE.owned_temporary_output(output)
            temporary.write_bytes(b"complete-video")
            BRIDGE.publish_atomic_output(temporary, output)
            self.assertEqual(BRIDGE.file_sha256(output), BRIDGE.hashlib.sha256(b"complete-video").hexdigest())
            publication = BRIDGE.success_diagnostic()["publication"]
            self.assertTrue(publication["before"]["tempExists"])
            self.assertTrue(publication["before"]["destinationParentExists"])
            self.assertFalse(publication["before"]["destinationExists"])
            self.assertTrue(publication["after"]["tempExpectedAbsent"])
            self.assertTrue(publication["after"]["destinationExpectedPresent"])


if __name__ == "__main__":
    unittest.main()
