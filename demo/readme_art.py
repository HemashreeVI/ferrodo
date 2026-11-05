#!/usr/bin/env python3
"""Draws the terminal-style images used in README.md (assets/*.svg).

Run from the repo root:  python3 demo/readme_art.py
"""

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "assets"
VERSION = "0.3.0"

# Same theme as the demo recording.
BG, BAR, BORDER = "#11141c", "#1b1f2b", "#2a3040"
FG, DIM, MUTED = "#d7dce6", "#6b7385", "#8b93a7"
RUST, GREEN, CYAN, RED, YELLOW = "#ff8a5c", "#7ee787", "#5ce1e6", "#ff6b6b", "#f2cc60"
FONT = "'JetBrains Mono','SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace"

W = 860          # window width
PAD_X = 28       # left text margin
LINE = 26        # line height
TOP = 38         # title bar height


def window(title: str, body: str, height: int) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" viewBox="0 0 {W} {height}" role="img" aria-label="{escape(title)}">
<defs><clipPath id="r"><rect width="{W}" height="{height}" rx="12"/></clipPath></defs>
<g clip-path="url(#r)">
<rect width="{W}" height="{height}" fill="{BG}"/>
<rect width="{W}" height="{TOP}" fill="{BAR}"/>
<circle cx="22" cy="19" r="6.5" fill="#ff5f57"/><circle cx="44" cy="19" r="6.5" fill="#febc2e"/><circle cx="66" cy="19" r="6.5" fill="#28c840"/>
<text x="{W / 2}" y="24" text-anchor="middle" font-family="{FONT}" font-size="13" fill="{MUTED}">{escape(title)}</text>
</g>
<rect x=".5" y=".5" width="{W - 1}" height="{height - 1}" rx="12" fill="none" stroke="{BORDER}"/>
<g font-family="{FONT}" font-size="15">
{body}
</g>
</svg>
"""


def text(y: float, *parts, x: float = PAD_X) -> str:
    """One line made of (text, colour[, bold]) parts that flow left to right."""
    spans = []
    for part in parts:
        s, color, *bold = part
        weight = ' font-weight="700"' if bold and bold[0] else ""
        spans.append(f'<tspan fill="{color}"{weight}>{escape(s)}</tspan>')
    return f'<text x="{x}" y="{y}" xml:space="preserve">{"".join(spans)}</text>'


def prompt(y: float, command: str, cursor: bool = False) -> str:
    parts = [("~/projects", RUST), (" ❯ ", GREEN, True), (command, FG)]
    line = text(y, *parts)
    if cursor:
        blink = (
            f'<tspan fill="{FG}">█<animate attributeName="fill-opacity" values="1;1;0;0" '
            'keyTimes="0;.5;.5;1" dur="1.1s" repeatCount="indefinite"/></tspan>'
        )
        line = line.replace("</text>", blink + "</text>")
    return line


# A chunky block font, drawn as rectangles so it looks the same everywhere.
GLYPHS = {
    "f": ["██████", "██    ", "█████ ", "██    ", "██    "],
    "e": ["██████", "██    ", "█████ ", "██    ", "██████"],
    "r": ["█████ ", "██  ██", "█████ ", "██ ██ ", "██  ██"],
    "o": [" ████ ", "██  ██", "██  ██", "██  ██", " ████ "],
    "d": ["█████ ", "██  ██", "██  ██", "██  ██", "█████ "],
}


def logo(x0: float, y0: float, word: str, cell_w: float = 10, cell_h: float = 12) -> str:
    rects, shadow = [], []
    x = x0
    for ch in word:
        rows = GLYPHS[ch]
        for r, row in enumerate(rows):
            for c, px in enumerate(row):
                if px == "█":
                    rx, ry = x + c * cell_w, y0 + r * cell_h
                    rects.append(f'<rect x="{rx}" y="{ry}" width="{cell_w}" height="{cell_h}"/>')
                    shadow.append(f'<rect x="{rx + 4}" y="{ry + 4}" width="{cell_w}" height="{cell_h}"/>')
        x += (len(rows[0]) + 1) * cell_w
    grad = (
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="#ffb07a"/><stop offset=".55" stop-color="{RUST}"/>'
        '<stop offset="1" stop-color="#e0533a"/></linearGradient></defs>'
    )
    return (
        grad
        + f'<g fill="#5a2a1c" opacity=".7" shape-rendering="crispEdges">{"".join(shadow)}</g>'
        + f'<g fill="url(#g)" shape-rendering="crispEdges">{"".join(rects)}</g>'
    )


def hero() -> str:
    y = TOP + 36
    body = [prompt(y, "ferrodo --version"), text(y + LINE, (f"ferrodo {VERSION}", DIM))]
    logo_y = y + LINE * 2 + 6
    body.append(logo(PAD_X + 4, logo_y, "ferrodo"))
    y = logo_y + 5 * 12 + 46
    body += [
        text(y, ("A fast, friendly todo manager for your terminal.", FG, True)),
        text(y + LINE, ("Full-screen app · natural due dates · priorities · written in Rust", MUTED)),
        prompt(y + LINE * 2 + 14, "", cursor=True),
    ]
    return window("ferrodo — ~/projects", "\n".join(body), int(y + LINE * 2 + 40))


def features() -> str:
    rows = [
        ("▌", CYAN, "Full-screen app", "keyboard-driven, built with ratatui"),
        ("◷", YELLOW, "Natural due dates", "today · fri · 3d · 2w · dec 24 · 2026-12-24"),
        ("!", RED, "Smart order", "overdue and due-today first, then by priority"),
        ("!!", RED, "Priorities", "high, medium and low, changed with + and -"),
        ("✔", GREEN, "Saved instantly", "safe writes, so a crash never corrupts your list"),
        ("$", RUST, "Scriptable", "every action also works as a one-line command"),
    ]
    y = TOP + 36
    body = [prompt(y, "ferrodo --features")]
    y += LINE + 10
    for icon, color, name, desc in rows:
        body.append(text(y, (icon, color, True), x=PAD_X + 6))
        body.append(text(y, (name, FG, True), x=PAD_X + 46))
        body.append(text(y, (desc, MUTED), x=PAD_X + 250))
        y += LINE + 4
    return window("features", "\n".join(body), int(y + 14))


def keys() -> str:
    rows = [
        ("↑ ↓  j k", "move", "g G", "jump to top / bottom"),
        ("a", "add a task", "e", "edit the task"),
        ("space", "mark done / not done", "t", "set the due date"),
        ("+ -", "raise / lower priority", "d", "delete (y to confirm)"),
        ("h", "hide / show finished", "c", "clear finished tasks"),
        ("q", "quit", "esc", "cancel / quit"),
    ]
    y = TOP + 36
    body = [prompt(y, "ferrodo   # then press…")]
    y += LINE + 10
    col2 = W / 2 + 10
    for k1, a1, k2, a2 in rows:
        body.append(text(y, (k1, CYAN, True), x=PAD_X + 6))
        body.append(text(y, (a1, FG), x=PAD_X + 120))
        body.append(text(y, (k2, CYAN, True), x=col2))
        body.append(text(y, (a2, FG), x=col2 + 70))
        y += LINE + 2
    return window("keys", "\n".join(body), int(y + 14))


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, svg in {"hero.svg": hero(), "features.svg": features(), "keys.svg": keys()}.items():
        (OUT / name).write_text(svg)
        print(f"wrote assets/{name}")
