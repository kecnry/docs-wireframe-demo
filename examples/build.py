#!/usr/bin/env python3
"""
Build self-contained wireframe demo pages.

For each JSON config in examples/demos/, this script:
1. Reads the referenced wireframe HTML
2. Extracts the <body> content and <style> blocks
3. Inlines everything into a single self-contained page with the
   controller JS/CSS, the wireframe content, and the step config
4. Writes the output to _site/<demo-name>.html

The output pages work in iframes (no fetch() calls) and can be
embedded in Confluence or any other platform.

Usage:
    python examples/build.py                # output to _site/
    python examples/build.py --out /tmp/out # custom output dir
"""

import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"
WIREFRAMES_DIR = EXAMPLES / "wireframes"
DEMOS_DIR = EXAMPLES / "demos"
STATIC_DIR = ROOT / "src" / "docs_wireframe_demo" / "static"


def extract_body_and_styles(wireframe_html: str) -> tuple[str, str]:
    """Extract <style> blocks and <body> content from a wireframe HTML file.

    Returns (styles_html, body_html).
    """
    # Extract all <style>...</style> blocks
    styles = re.findall(r"<style[^>]*>.*?</style>", wireframe_html, re.DOTALL)
    styles_html = "\n".join(styles)

    # Extract body content
    body_match = re.search(r"<body[^>]*>(.*)</body>", wireframe_html, re.DOTALL)
    body_html = body_match.group(1).strip() if body_match else wireframe_html

    return styles_html, body_html


def build_page(demo_config: dict, wireframe_path: Path, controller_js: str, controls_css: str) -> str:
    """Build a self-contained HTML page from a demo config and wireframe."""
    wireframe_html = wireframe_path.read_text(encoding="utf-8")
    styles_html, body_html = extract_body_and_styles(wireframe_html)

    title = demo_config.get("title", "Wireframe Demo")
    height = demo_config.get("height", "100vh")

    # Build the config object (without wireframe-specific fields)
    config = {
        "steps": demo_config.get("steps", []),
        "repeat": demo_config.get("repeat", True),
        "autoStart": demo_config.get("autoStart", True),
    }
    if demo_config.get("pauseOnInteraction") is not None:
        config["pauseOnInteraction"] = demo_config["pauseOnInteraction"]
    if demo_config.get("initialClass"):
        config["initialClass"] = demo_config["initialClass"]
    if demo_config.get("cursor") is not None:
        config["cursor"] = demo_config["cursor"]
    if demo_config.get("cursorSpeed") is not None:
        config["cursorSpeed"] = demo_config["cursorSpeed"]

    config_json = html.escape(json.dumps(config), quote=True)

    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{html.escape(title)}</title>
<style>
  body {{
    margin: 0;
    overflow: hidden;
    background: transparent;
  }}
  [data-wireframe-demo] {{
    width: 100%;
    height: {height};
  }}
</style>
<style>
/* wireframe-demo-controls.css (inlined) */
{controls_css}
</style>
{styles_html}
</head>
<body>
<div data-wireframe-demo
     data-wireframe-config="{config_json}">
{body_html}
</div>
<script>
// wireframe-demo-controller.js (inlined)
{controller_js}
</script>
</body>
</html>
"""


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Build self-contained wireframe demo pages.")
    parser.add_argument("--out", default=str(ROOT / "_site"), help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Read controller assets once
    controller_js = (STATIC_DIR / "wireframe-demo-controller.js").read_text(encoding="utf-8")
    controls_css = (STATIC_DIR / "wireframe-demo-controls.css").read_text(encoding="utf-8")

    demo_files = sorted(DEMOS_DIR.glob("*.json"))
    if not demo_files:
        print("No demo configs found in", DEMOS_DIR)
        sys.exit(1)

    built = 0
    for demo_file in demo_files:
        print(f"Building {demo_file.name}...")
        demo_config = json.loads(demo_file.read_text(encoding="utf-8"))

        wireframe_name = demo_config.get("wireframe")
        if not wireframe_name:
            print(f"  SKIP: no 'wireframe' key in {demo_file.name}")
            continue

        wireframe_path = WIREFRAMES_DIR / wireframe_name
        if not wireframe_path.exists():
            print(f"  ERROR: wireframe not found: {wireframe_path}")
            sys.exit(1)

        page_html = build_page(demo_config, wireframe_path, controller_js, controls_css)

        out_name = demo_file.stem + ".html"
        out_path = out_dir / out_name
        out_path.write_text(page_html, encoding="utf-8")
        print(f"  → {out_path}")
        built += 1

    print(f"\nBuilt {built} demo page(s) in {out_dir}")


if __name__ == "__main__":
    main()
