import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.runtime_check import get_runtime_error


class RuntimeCheckTest(unittest.TestCase):
    def test_python_312_is_supported(self):
        self.assertIsNone(get_runtime_error((3, 12, 5), platform_name="Windows"))

    def test_python_311_is_supported(self):
        self.assertIsNone(get_runtime_error((3, 11, 9), platform_name="Windows"))

    def test_python_314_returns_operator_friendly_error(self):
        message = get_runtime_error((3, 14, 0), platform_name="Windows")

        self.assertIsNotNone(message)
        self.assertIn("Python Worker requires Python 3.12.x on Windows", message)
        self.assertIn("Detected Python 3.14.x", message)
        self.assertIn("py -3.12 -m venv .venv", message)


if __name__ == "__main__":
    unittest.main()
