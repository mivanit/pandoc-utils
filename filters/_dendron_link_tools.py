from collections.abc import Callable
from typing import Any
import re

from pandocfilters import Str, Link


class LinkRegexPattern:
    def __init__(
        self,
        name: str,
        regex_raw: str,
        link_group_idx: int,
    ) -> None:
        self.name: str = name
        self.regex_raw: str = regex_raw
        self.link_group_idx: int = link_group_idx
        self.pattern: re.Pattern[str] = re.compile(regex_raw)


LINK_REGEXS: dict[str, LinkRegexPattern] = {
    "md": LinkRegexPattern(
        name="md",
        regex_raw=r"\[(.*?)\]\((.*?)\)",
        link_group_idx=2,
    ),
    "dendron": LinkRegexPattern(
        name="dendron",
        regex_raw=r"\[\[(.*?)\]\]",
        link_group_idx=1,
    ),
    # 'html' : LinkRegexPattern(
    # 	name = 'html',
    # 	regex_raw = r'<a href="(.*?)">(.*?)</a>',
    # 	link_group_idx = 1,
    # ),
}

DENDRON_LINK_REGEX: LinkRegexPattern = LINK_REGEXS["dendron"]


def get_dendron_link(data: str) -> str | None:
    """check if the given data is a dendron link

    if no link exists, return `None`
    otherwise, return the link text
    """

    match: re.Match[str] | None = DENDRON_LINK_REGEX.pattern.match(data)
    if match:
        return match.group(DENDRON_LINK_REGEX.link_group_idx)
    else:
        return None


def convert_dlink_factory(
    linktext_gen: Callable[[str], str] = lambda x: x.split(".")[-1],
    pref: str = "",
    ext: str = "md",
) -> Callable[[str], dict[str, Any]]:
    def convert(link: str) -> dict[str, Any]:
        return Link(
            ["", [], []],
            [Str(linktext_gen(link))],
            [
                f"{pref}{link}.{ext}",
                "",
            ],
        )

    return convert


def dendron_to_markdown_factory(
    linktext_gen: Callable[[str], str] = lambda x: x.split(".")[-1],
    pref: str = "",
    ext: str = "md",
) -> Callable[[str, Any, Any, Any], dict[str, Any] | None]:
    converter: Callable[[str], dict[str, Any]] = convert_dlink_factory(
        linktext_gen=linktext_gen,
        pref=pref,
        ext=ext,
    )

    def filter(
        key: str,
        value: Any,
        format: Any,
        meta: Any,
    ) -> dict[str, Any] | None:
        """convert dendron links to markdown links"""

        # if its a plain string
        if key == "Str":
            dlink: str | None = get_dendron_link(value)
            if dlink:
                output = converter(dlink)

                return output
        else:
            return None

    return filter


if __name__ == "__main__":
    raise Exception("this is a module")
