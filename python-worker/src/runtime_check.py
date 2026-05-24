import platform
import sys
from typing import Optional, Sequence


MIN_SUPPORTED = (3, 11)
MAX_EXCLUSIVE = (3, 13)
RECOMMENDED_WINDOWS = "3.12.x"


def get_runtime_error(
    version_info: Optional[Sequence[int]] = None,
    platform_name: Optional[str] = None,
) -> Optional[str]:
    version = tuple(version_info or sys.version_info[:3])
    system = platform_name or platform.system()
    major_minor = version[:2]

    if MIN_SUPPORTED <= major_minor < MAX_EXCLUSIVE:
        return None

    detected = f"Python {version[0]}.{version[1]}.x"
    if system == "Windows":
        return (
            f"Python Worker requires Python {RECOMMENDED_WINDOWS} on Windows "
            f"(Python 3.11.x is also supported). Detected {detected}. "
            "Please create the venv with: py -3.12 -m venv .venv"
        )

    return (
        "Python Worker supports Python 3.11.x or 3.12.x. "
        f"Detected {detected}. Please create a Python 3.12 virtual environment."
    )


def ensure_supported_runtime() -> None:
    message = get_runtime_error()
    if message:
        print(message, file=sys.stderr)
        raise SystemExit(2)
