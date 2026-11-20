"""A line chart as an SVG file, with nothing but the standard library.

Enough for the paper's figures: several series, linear or log axes, markers, dashed lines, a
key. Numbers are written with fixed precision, so the same data always gives the same file,
and a file whose content would not change is left alone (the PDF build converts an SVG again
only when it is newer than its PDF).
"""

import math
from dataclasses import dataclass, field
from html import escape
from pathlib import Path

COLORS: list[str] = ["#3b5a8c", "#a8842c", "#3d7a4e", "#8c3b5a", "#555555"]
FONT: str = "Helvetica, Arial, sans-serif"


def write(path: Path, text: str) -> None:
    """Write `text` to `path` unless that is what the file already holds."""
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


@dataclass
class Series:
    """One line: its points, and how it is drawn."""

    label: str
    points: list[tuple[float, float]]
    dashed: bool = False
    markers: bool = True
    line: bool = True
    color: str | None = None  # default: by position


@dataclass
class Chart:
    """A chart's axes and series; `write` draws it."""

    xlabel: str
    ylabel: str
    series: list[Series]
    xticks: list[float]
    yticks: list[float]
    xlog: bool = False
    ylog: bool = False
    xticklabels: list[str] = field(default_factory=list)  # default: the numbers
    width: int = 640
    height: int = 320
    key: str = "top right"  # the corner of the plot the key sits in

    def write(self, path: Path) -> None:
        for name, ticks, log in (
            ("x", self.xticks, self.xlog),
            ("y", self.yticks, self.ylog),
        ):
            if len(ticks) < 2 or ticks != sorted(set(ticks)):
                raise ValueError(f"{path.name}: {name} needs two or more rising ticks")
            if log and ticks[0] <= 0:
                raise ValueError(f"{path.name}: a log {name} axis starts above zero")
        for s in self.series:
            for px, py in s.points:
                inside = (
                    self.xticks[0] <= px <= self.xticks[-1]
                    and self.yticks[0] <= py <= self.yticks[-1]
                )
                if not inside:
                    raise ValueError(
                        f"{path.name}: {s.label or 'a series'} has ({px:g}, {py:g}),"
                        " outside the ticks"
                    )
        left, right, top, bottom = 62, 18, 14, 48
        plot_w, plot_h = self.width - left - right, self.height - top - bottom

        def scale(v: float, ticks: list[float], log: bool) -> float:
            lo, hi = ticks[0], ticks[-1]
            if log:
                return (math.log(v) - math.log(lo)) / (math.log(hi) - math.log(lo))
            return (v - lo) / (hi - lo)

        def x(v: float) -> float:
            return left + plot_w * scale(v, self.xticks, self.xlog)

        def y(v: float) -> float:
            return top + plot_h * (1 - scale(v, self.yticks, self.ylog))

        def label(v: float) -> str:
            return f"{v:g}"

        out: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}"'
            f' width="{self.width}" height="{self.height}" font-family="{FONT}" font-size="13">',
            f'<rect width="{self.width}" height="{self.height}" fill="white"/>',
        ]
        # grid and tick labels
        for tick in self.yticks:
            out.append(
                f'<path d="M{left} {y(tick):.1f} H{left + plot_w}" stroke="#e3e3e3"/>'
                f'<text x="{left - 8}" y="{y(tick) + 4:.1f}" text-anchor="end" fill="#222">{label(tick)}</text>'
            )
        names: list[str] = self.xticklabels or [label(t) for t in self.xticks]
        for tick, name in zip(self.xticks, names):
            out.append(
                f'<path d="M{x(tick):.1f} {top + plot_h} v5" stroke="#222"/>'
                f'<text x="{x(tick):.1f}" y="{top + plot_h + 20}" text-anchor="middle" fill="#222">{escape(name)}</text>'
            )
        out.append(
            f'<path d="M{left} {top} V{top + plot_h} H{left + plot_w}" fill="none" stroke="#222" stroke-width="1.5"/>'
            f'<text x="{left + plot_w / 2:.1f}" y="{self.height - 8}" text-anchor="middle" fill="#222">{escape(self.xlabel)}</text>'
            f'<text x="16" y="{top + plot_h / 2:.1f}" text-anchor="middle" fill="#222"'
            f' transform="rotate(-90 16 {top + plot_h / 2:.1f})">{escape(self.ylabel)}</text>'
        )
        # series
        for i, s in enumerate(self.series):
            color: str = s.color or COLORS[i % len(COLORS)]
            dash: str = ' stroke-dasharray="6 4"' if s.dashed else ""
            if s.line:
                d: str = " ".join(
                    f"{'L' if j else 'M'}{x(px):.1f} {y(py):.1f}"
                    for j, (px, py) in enumerate(s.points)
                )
                out.append(
                    f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.2"{dash}/>'
                )
            if s.markers:
                out.extend(
                    f'<circle cx="{x(px):.1f}" cy="{y(py):.1f}" r="3.2" fill="{color}"/>'
                    for px, py in s.points
                )
        # key: one row per series, on a white box so grid lines do not cross the text
        rows: list[Series] = [s for s in self.series if s.label]
        if rows:
            key_w: int = 28 + 12 + max(len(s.label) for s in rows) * 7
            key_h: int = len(rows) * 19 + 6
            key_x: int = left + plot_w - key_w - 8 if "right" in self.key else left + 14
            key_y: int = top + 8 if "top" in self.key else top + plot_h - key_h - 10
            out.append(
                f'<rect x="{key_x - 6}" y="{key_y - 4}" width="{key_w + 8}" height="{key_h}"'
                f' fill="white" fill-opacity="0.9"/>'
            )
            for i, s in enumerate(rows):
                color = s.color or COLORS[self.series.index(s) % len(COLORS)]
                row_y: int = key_y + 10 + i * 19
                dash = ' stroke-dasharray="6 4"' if s.dashed else ""
                if s.line:
                    out.append(
                        f'<path d="M{key_x} {row_y} h28" stroke="{color}" stroke-width="2.2"{dash}/>'
                    )
                if s.markers:
                    out.append(
                        f'<circle cx="{key_x + 14}" cy="{row_y}" r="3.2" fill="{color}"/>'
                    )
                out.append(
                    f'<text x="{key_x + 36}" y="{row_y + 4}" fill="#222">{escape(s.label)}</text>'
                )
        out.append("</svg>")
        write(path, "\n".join(out) + "\n")
