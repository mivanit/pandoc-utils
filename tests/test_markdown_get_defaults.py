import sys
from pathlib import Path

import pytest
import yaml

# add repo root to path so we can import the module
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from markdown_get_defaults_yaml import get_front_matter, get_defaults, FILTERS_DIR  # noqa: E402


class TestGetFrontMatter:
    def test_parses_basic_front_matter(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\ntitle: Hello\nauthor: Test\n---\nBody text\n")
        result = get_front_matter(str(md))
        assert result == {"title": "Hello", "author": "Test"}

    def test_raises_when_no_front_matter(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("No front matter here\n")
        with pytest.raises(ValueError, match="does not start with yaml front matter"):
            get_front_matter(str(md))

    def test_parses_defaults_key(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\n__defaults__:\n  key: value\n---\nBody\n")
        result = get_front_matter(str(md))
        assert "__defaults__" in result
        assert result["__defaults__"] == {"key": "value"}

    def test_parses_pandoc_key(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\n__pandoc__:\n  key: value\n---\nBody\n")
        result = get_front_matter(str(md))
        assert "__pandoc__" in result


class TestGetDefaults:
    def test_writes_defaults_file_from_defaults_key(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text(
            "---\n__defaults__:\n  variable:\n    fontsize: 12pt\n---\nBody\n"
        )
        out = temp_dir / "defaults.yml"
        get_defaults(str(md), defaults_file=str(out))
        assert out.exists()
        data = yaml.safe_load(out.read_text())
        assert data["variable"] == {"fontsize": "12pt"}

    def test_writes_defaults_file_from_pandoc_key(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\n__pandoc__:\n  variable:\n    fontsize: 12pt\n---\nBody\n")
        out = temp_dir / "defaults.yml"
        get_defaults(str(md), defaults_file=str(out))
        assert out.exists()
        data = yaml.safe_load(out.read_text())
        assert data["variable"] == {"fontsize": "12pt"}

    def test_replaces_filters_placeholder(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text(
            "---\n__pandoc__:\n  filters:\n    - $FILTERS$/mermaid.py\n---\nBody\n"
        )
        out = temp_dir / "defaults.yml"
        get_defaults(str(md), defaults_file=str(out), filters_dir="/fake/filters")
        data = yaml.safe_load(out.read_text())
        assert data["filters"] == ["/fake/filters/mermaid.py"]

    def test_replaces_filters_placeholder_with_real_dir(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text(
            "---\n__pandoc__:\n  filters:\n    - $FILTERS$/mermaid.py\n---\nBody\n"
        )
        out = temp_dir / "defaults.yml"
        get_defaults(str(md), defaults_file=str(out), filters_dir=FILTERS_DIR)
        data = yaml.safe_load(out.read_text())
        assert data["filters"] == [f"{FILTERS_DIR}/mermaid.py"]

    def test_warns_on_missing_filter(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text(
            "---\n__pandoc__:\n  filters:\n    - /nonexistent/filter.py\n---\nBody\n"
        )
        out = temp_dir / "defaults.yml"
        with pytest.warns(UserWarning, match="could not find filter"):
            get_defaults(str(md), defaults_file=str(out))

    def test_raises_when_both_keys_present(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\n__defaults__:\n  a: 1\n__pandoc__:\n  b: 2\n---\nBody\n")
        out = temp_dir / "defaults.yml"
        with pytest.raises(KeyError, match="found too many keys"):
            get_defaults(str(md), defaults_file=str(out))

    def test_no_output_when_no_defaults_key(self, temp_dir):
        md = temp_dir / "test.md"
        md.write_text("---\ntitle: Hello\n---\nBody\n")
        out = temp_dir / "defaults.yml"
        get_defaults(str(md), defaults_file=str(out))
        assert not out.exists()

    def test_filters_dir_resolves_to_real_path(self):
        """FILTERS_DIR should resolve relative to the script location."""
        assert Path(FILTERS_DIR).is_dir()
        assert (Path(FILTERS_DIR) / "mermaid.py").is_file()
