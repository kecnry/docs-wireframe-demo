#!/usr/bin/env python3
"""
Record wireframe demo pages as animated GIFs.

For each built HTML demo page in _site/, this script:
1. Opens it in headless Chromium via Playwright
2. Captures screenshots at regular intervals for one full cycle
3. Assembles the frames into an animated GIF using Pillow

Usage:
    python examples/record.py                          # record all demos
    python examples/record.py --demo kitchen-sink-full # record one demo
    python examples/record.py --fps 10 --width 800     # custom settings

Requires: playwright, Pillow
    pip install playwright Pillow
    playwright install chromium
"""

import json
import re
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("ERROR: playwright is required. Install with: pip install playwright && playwright install chromium")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DEMOS_DIR = ROOT / "examples" / "demos"
DEFAULT_SITE_DIR = ROOT / "_site"


def parse_step_delay(step) -> int:
    """Extract the delay (ms) from a step string or object."""
    if isinstance(step, dict):
        return step.get("delay", 2000)
    # Shorthand: target@delay:action=value
    m = re.search(r"@(\d+)!?:", str(step))
    if m:
        return int(m.group(1))
    # pause@delay
    m = re.search(r"@(\d+)$", str(step))
    if m:
        return int(m.group(1))
    return 2000  # default


def total_duration_ms(steps: list) -> int:
    """Calculate total duration of one demo cycle in milliseconds."""
    return sum(parse_step_delay(s) for s in steps)


def record_demo(html_path: Path, output_path: Path, config: dict,
                fps: int = 10, width: int = 800) -> None:
    """Record a single demo page as an animated GIF."""
    steps = config.get("steps", [])
    duration_ms = total_duration_ms(steps)

    # Add buffer: 1s for page load/init + 0.5s after last step
    total_ms = duration_ms + 1500
    interval_ms = 1000 // fps

    # Parse height from config (e.g. "420px" → 420)
    height_str = config.get("height", "420px")
    height = int(re.sub(r"[^\d]", "", height_str)) if re.search(r"\d", height_str) else 420

    print(f"  Duration: {duration_ms}ms, capturing {total_ms // interval_ms} frames at {fps}fps")

    frames = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})

        # Load the self-contained page (resolve to absolute path for file:// URL)
        page.goto(f"file://{html_path.resolve()}", wait_until="domcontentloaded")

        # Hide playback controls — they don't work in a GIF
        page.add_style_tag(content=".wfd-controls-host { display: none !important; }")

        # Wait for the controller to initialise and auto-play to start
        # The demo waits for 50% visibility via IntersectionObserver,
        # which fires immediately in headless since the viewport matches.
        page.wait_for_timeout(500)

        # Capture frames
        elapsed = 0
        while elapsed < total_ms:
            screenshot = page.screenshot(type="png")
            img = Image.open(__import__("io").BytesIO(screenshot))
            # Convert to palette mode for smaller GIF
            img = img.convert("RGBA")
            frames.append(img)
            page.wait_for_timeout(interval_ms)
            elapsed += interval_ms

        browser.close()

    if not frames:
        print("  WARNING: No frames captured")
        return

    # Assemble GIF
    # Convert all frames to RGBA first, then to P mode for GIF
    gif_frames = []
    for frame in frames:
        # Quantize to 256 colors for GIF
        gif_frames.append(frame.convert("P", palette=Image.ADAPTIVE, colors=256))

    gif_frames[0].save(
        output_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=interval_ms,  # ms per frame
        loop=0,  # infinite loop
        optimize=True,
    )

    size_kb = output_path.stat().st_size / 1024
    print(f"  → {output_path} ({size_kb:.0f} KB, {len(gif_frames)} frames)")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Record wireframe demos as animated GIFs.")
    parser.add_argument("--site", default=str(DEFAULT_SITE_DIR), help="Directory with built HTML pages")
    parser.add_argument("--out", default=None, help="Output directory for GIFs (default: same as --site)")
    parser.add_argument("--demo", default=None, help="Record only this demo (stem name, e.g. 'kitchen-sink-full')")
    parser.add_argument("--fps", type=int, default=10, help="Frames per second (default: 10)")
    parser.add_argument("--width", type=int, default=800, help="Viewport width in pixels (default: 800)")
    args = parser.parse_args()

    site_dir = Path(args.site)
    out_dir = Path(args.out) if args.out else site_dir

    if not site_dir.exists():
        print(f"ERROR: Site directory not found: {site_dir}")
        print("Run 'python examples/build.py' first.")
        sys.exit(1)

    out_dir.mkdir(parents=True, exist_ok=True)

    # Find demo configs to determine durations
    demo_files = sorted(DEMOS_DIR.glob("*.json"))
    if args.demo:
        demo_files = [f for f in demo_files if f.stem == args.demo]
        if not demo_files:
            print(f"ERROR: Demo config not found: {args.demo}")
            sys.exit(1)

    recorded = 0
    for demo_file in demo_files:
        stem = demo_file.stem
        html_path = site_dir / f"{stem}.html"

        if not html_path.exists():
            print(f"Skipping {stem}: {html_path} not found")
            continue

        print(f"Recording {stem}...")
        config = json.loads(demo_file.read_text(encoding="utf-8"))
        output_path = out_dir / f"{stem}.gif"

        record_demo(html_path, output_path, config, fps=args.fps, width=args.width)
        recorded += 1

    print(f"\nRecorded {recorded} GIF(s) in {out_dir}")


if __name__ == "__main__":
    main()
