from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from run_windows_persistent_worker import load_env_files, validate_production_worker_env


class WindowsPersistentWorkerLauncherTest(unittest.TestCase):
    def test_env_files_merge_in_order_but_do_not_override_process_env(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "first.env"
            second = root / "second.env"
            first.write_text("FROM_FILE=first\nPROCESS_VALUE=file\n", encoding="utf-8")
            second.write_text("FROM_FILE=second\nSECOND_ONLY=value\n", encoding="utf-8")

            merged = load_env_files(
                [first, second],
                {"PROCESS_VALUE": "process"},
            )

        self.assertEqual(merged["PROCESS_VALUE"], "process")
        self.assertEqual(merged["FROM_FILE"], "second")
        self.assertEqual(merged["SECOND_ONLY"], "value")

    def test_production_validation_accepts_r2_and_approved_local_tts(self):
        env = {
            "WEB_APP_BASE_URL": "https://commerce.example",
            "WORKER_API_SECRET": "present",
            "STORAGE_BACKEND": "r2",
            "R2_ENDPOINT_URL": "https://r2.example",
            "R2_ACCESS_KEY_ID": "present",
            "R2_SECRET_ACCESS_KEY": "present",
            "KOREAN_VOICE_PROVIDER": "local_command",
            "KOREAN_VOICE_PROVIDER_APPROVED": "true",
            "KOREAN_VOICE_COMMAND": "provider command",
        }

        self.assertEqual(validate_production_worker_env(env), [])

    def test_production_validation_fails_closed_without_required_contract(self):
        blockers = validate_production_worker_env({"WEB_APP_BASE_URL": "http://localhost:3000"})

        self.assertIn("WEB_APP_BASE_URL must be a non-local HTTPS URL", blockers)
        self.assertIn("WORKER_API_SECRET is required", blockers)
        self.assertIn("STORAGE_BACKEND must be r2", blockers)
        self.assertIn("KOREAN_VOICE_PROVIDER must be local_command", blockers)

    def test_installer_persists_logon_and_repeating_recovery_triggers(self):
        installer = (
            Path(__file__).resolve().parents[1]
            / "scripts"
            / "install_windows_autostart.ps1"
        ).read_text(encoding="utf-8")

        self.assertIn("[ValidateRange(1, 255)]", installer)
        self.assertIn("[int]$RestartCount = 3", installer)
        self.assertNotIn("-RestartCount 999", installer)
        self.assertIn("$logonTrigger = New-ScheduledTaskTrigger -AtLogOn", installer)
        self.assertIn("$recoveryTrigger = New-ScheduledTaskTrigger", installer)
        self.assertIn("-RepetitionInterval $recoveryInterval", installer)
        self.assertIn("-RepetitionDuration $recoveryDuration", installer)
        self.assertIn("-Trigger @($logonTrigger, $recoveryTrigger)", installer)
        self.assertIn("-MultipleInstances IgnoreNew", installer)
        self.assertIn("-StartWhenAvailable", installer)
        self.assertIn("-Hidden", installer)


if __name__ == "__main__":
    unittest.main()
