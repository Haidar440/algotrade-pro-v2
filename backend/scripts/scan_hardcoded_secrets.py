#!/usr/bin/env python3
"""
Module: scripts/scan_hardcoded_secrets.py
Purpose: Pre-commit security scanner — blocks commits with hardcoded credentials.

Run manually:
    python scripts/scan_hardcoded_secrets.py

Set up as pre-commit hook:
    cp scripts/scan_hardcoded_secrets.py .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

Exit codes:
    0 — No violations found, safe to commit.
    1 — Violations found, commit blocked.
"""

import re
import sys
from pathlib import Path

# ━━━━━━━━━━━━━━━ Detection Patterns ━━━━━━━━━━━━━━━

PATTERNS: list[tuple[str, str]] = [
    (r'api[_-]?key\s*=\s*["\'][A-Za-z0-9]{10,}["\']', "Hardcoded API key"),
    (r'password\s*=\s*["\'][^"\']{6,}["\']', "Hardcoded password"),
    (r'secret\s*=\s*["\'][A-Za-z0-9+/=]{20,}["\']', "Hardcoded secret"),
    (r'token\s*=\s*["\'][A-Za-z0-9._\-]{20,}["\']', "Hardcoded token"),
    (r'(ghp_|sk-|tvly-|AIza)[A-Za-z0-9]{10,}', "Leaked service key"),
    (r'totp[_-]?secret\s*=\s*["\'][A-Z2-7]{16,}["\']', "Hardcoded TOTP"),
    (r'postgresql://\w+:\w+@', "Hardcoded DB credentials"),
    (r'Fernet\(["\'][A-Za-z0-9+/=]+["\']\)', "Hardcoded Fernet key"),
    (r'Bearer\s+[A-Za-z0-9._\-]{20,}', "Hardcoded Bearer token"),
    (r'client[_-]?id\s*=\s*["\'][A-Z0-9]{4,}["\']', "Hardcoded client ID"),
    (r'mongodb(\+srv)?://\w+:\w+@', "Hardcoded MongoDB URI"),
]

# Files and directories to skip during scanning
EXCLUDE_DIRS: set[str] = {"node_modules", ".git", "__pycache__", ".venv", "venv", "logs"}
EXCLUDE_FILES: set[str] = {
    ".env", ".env.example", ".env.local",
    "scan_hardcoded_secrets.py",  # Don't flag patterns in this scanner
    "config.py",                  # Config reads from env, contains field names
    "coding_standards.md",        # Contains examples
}


def scan(scan_path: Path | None = None) -> list[tuple[Path, int, str, str]]:
    """Scan Python files for hardcoded secrets.

    Args:
        scan_path: Directory to scan. Defaults to backend/app.

    Returns:
        List of violations: (file_path, line_number, pattern_name, matched_text).
    """
    if scan_path is None:
        scan_path = Path(__file__).parent.parent / "app"

    if not scan_path.exists():
        print(f"⚠️  Scan path does not exist: {scan_path}")
        return []

    violations: list[tuple[Path, int, str, str]] = []

    for file_path in scan_path.rglob("*.py"):
        # Skip excluded directories
        if any(excluded in file_path.parts for excluded in EXCLUDE_DIRS):
            continue

        # Skip excluded files
        if file_path.name in EXCLUDE_FILES:
            continue

        try:
            content = file_path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue

        for line_number, line in enumerate(content.splitlines(), start=1):
            # Skip comments and docstrings
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'''"):
                continue

            for pattern, description in PATTERNS:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    violations.append((
                        file_path,
                        line_number,
                        description,
                        match.group()[:50],  # Truncate for display safety
                    ))

    return violations


def main() -> None:
    """Run the scanner and print results."""
    print("🔍 Scanning for hardcoded secrets...\n")

    violations = scan()

    if violations:
        print("⛔ HARDCODED SECRETS FOUND! Fix before committing:\n")
        for file_path, line_num, description, snippet in violations:
            relative = file_path.relative_to(Path.cwd()) if file_path.is_relative_to(Path.cwd()) else file_path
            print(f"  ❌ {relative}:{line_num}")
            print(f"     {description}: ...{snippet}...")
            print()

        print(f"\n🚫 {len(violations)} violation(s) found. Commit BLOCKED.")
        print("💡 Fix: Move secrets to .env and use settings.YOUR_SECRET\n")
        sys.exit(1)
    else:
        print("✅ No hardcoded secrets found. Safe to commit!\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
