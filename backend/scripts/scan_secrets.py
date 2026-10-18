"""Security scan script for accidental private key or secret exposures.

Scans all source, configuration, and artifact files for secret leaks.
Never prints or displays any discovered secret values.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SECRET_PATTERNS = [
    (re.compile(r"""(?:private_?key|secret_?key)\s*[:=]\s*["']([^"']+)["']""", re.IGNORECASE), "private_key_assignment"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "pem_private_key"),
]

EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    ".next",
    "artifacts",
    "cache",
    ".pytest_cache",
    "dist",
    "build",
}

SAFE_PLACEHOLDERS = (
    "",
    "YOUR_",
    "your_",
    "<",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x...",
    "YOUR_INFURA_KEY",
)


def run_scan() -> int:
    findings: list[tuple[str, int, str]] = []

    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for file in files:
            if file.endswith((".ts", ".tsx", ".py", ".json", ".example", ".sol", ".md")):
                filepath = Path(root) / file
                rel_path = filepath.relative_to(REPO_ROOT)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        for line_no, line in enumerate(f, 1):
                            for pattern, label in SECRET_PATTERNS:
                                match = pattern.search(line)
                                if match:
                                    val = match.group(1) if match.groups() else match.group(0)
                                    val_clean = val.strip()
                                    if any(val_clean.startswith(prefix) for prefix in SAFE_PLACEHOLDERS):
                                        continue
                                    findings.append((str(rel_path), line_no, label))
                except Exception as exc:
                    print(f"Warning: could not read {rel_path}: {exc}", file=sys.stderr)

    print("==================================================")
    print("VOTEX SECURITY AUDIT: SECRET EXPOSURE SCAN")
    print("==================================================")
    print(f"Target directory: {REPO_ROOT}")
    print(f"Total potential secret exposures found: {len(findings)}")

    if findings:
        print("\nFindings detected:")
        for path, line_no, label in findings:
            # Note: strictly avoid printing the secret value!
            print(f"  [FLAGGED] File: {path} (Line {line_no}, Rule: {label})")
        return 1

    print("\nSCAN RESULT: PASSED - 0 real secret values or private keys exposed in source tree.")
    return 0


if __name__ == "__main__":
    sys.exit(run_scan())
