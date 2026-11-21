"""Content identity for the demo's sources, independent of commits and build outputs."""

import hashlib
import subprocess
import sys
from pathlib import Path


def source_version(root: Path) -> str:
    names = subprocess.check_output(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "html-papers",
            "filters",
            "Makefile",
            "*.py",
            "*.sh",
            "pyproject.toml",
            "uv.lock",
            ":(exclude)docs",
            ":(exclude)html-papers/tests",
            ":(exclude)tests",
        ],
        cwd=root,
    )
    digest = hashlib.sha256()
    for name in sorted(set(names.split(b"\0")) - {b""}):
        path = root / name.decode()
        if path.is_file():
            content = path.read_bytes()
            digest.update(name + b"\0" + str(len(content)).encode() + b"\0" + content)
    return "sha256:" + digest.hexdigest()


if __name__ == "__main__":
    print(
        source_version(
            Path(sys.argv[1])
            if len(sys.argv) > 1
            else Path(__file__).resolve().parent.parent
        )
    )
