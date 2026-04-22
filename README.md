# docs-wireframe-demo

A reusable Sphinx extension for embedding interactive wireframe demos in
documentation. Fetches arbitrary HTML into a container, overlays
play/pause/restart controls, and steps through a configurable sequence of
actions (clicks, class toggles, custom handlers, …).

## Installation

```bash
pip install docs-wireframe-demo
```

Or for development:

```bash
pip install -e /path/to/docs-wireframe-demo
```

## Quick start

Enable the extension in your Sphinx `conf.py`:

```python
extensions = [
    "docs_wireframe_demo",
]
```

Then use the directive in any RST file:

```rst
.. wireframe-demo:: _static/my-app.html
   :steps: #btn@1500:click, .panel@1000:toggle-class=open
   :repeat: true
   :height: 500px
```

## Directive options

| Option                 | Description                                                       | Default  |
| ---------------------- | ----------------------------------------------------------------- | -------- |
| `:steps:`              | Comma-separated shorthand step strings                            | *(none)* |
| `:steps-json:`         | Inline JSON array of step objects (alternative to `:steps:`)      | *(none)* |
| `:repeat:`             | Loop the demo when it finishes (`true` / `false`)                 | `true`   |
| `:auto-start:`         | Start automatically when the container scrolls into view          | `true`   |
| `:pause-on-interaction:` | Pause when the user clicks inside the demo                      | `true`   |
| `:css:`                | Path to an additional CSS file to include                         | *(none)* |
| `:js:`                 | Path to an additional JS file to include                          | *(none)* |
| `:id:`                 | Explicit container id (auto-generated if omitted)                 | *(auto)* |
| `:height:`             | Container height, e.g. `500px`                                    | *(none)* |
| `:initial-class:`      | CSS class(es) added to the content root on load                   | *(none)* |

## Step syntax

### Shorthand string

```
target@delay:action=value
```

| Part       | Description                                                    | Default     |
| ---------- | -------------------------------------------------------------- | ----------- |
| `target`   | CSS selector for the element to act on                         | *(none)*    |
| `@delay`   | Milliseconds to wait before the next step; append `!` to suppress highlight | `2000` |
| `:action`  | Action name (`click`, `add-class`, `toggle-class`, …)          | `highlight` |
| `=value`   | Value passed to the action                                     | *(none)*    |

### JSON step object

```json
{
  "target": "#my-btn",
  "action": "click",
  "delay": 1500,
  "noHighlight": true
}
```

### Built-in actions

`highlight`, `click`, `add-class`, `remove-class`, `toggle-class`,
`set-attribute`, `remove-attribute`, `set-value`, `set-text`, `set-html`,
`scroll-into-view`, `dispatch-event`, `pause`.

### Custom actions

Register custom actions from a separate JS file loaded via the `:js:` option:

```js
WireframeDemo.registerAction('my-action', function (step, el, contentRoot) {
    // `this` is the WireframeDemo instance
    // `step` has .target, .action, .value, .delay
    // `el` is the resolved DOM element (or null)
    // `contentRoot` is the container holding the fetched HTML
});
```

## Styling the control button

The play/pause/restart button lives inside a Shadow DOM for style isolation.
It exposes **CSS custom properties** that you can set on the
`[data-wireframe-demo]` container (or any ancestor) to theme the button
without breaking encapsulation.

### Available custom properties

| Custom property              | What it controls           | Default                 |
| ---------------------------- | -------------------------- | ----------------------- |
| `--wfd-control-size`         | Button width & height      | `44px`                  |
| `--wfd-control-radius`       | Border-radius              | `8px`                   |
| `--wfd-control-bg`           | Background color           | `rgba(0,0,0,0.55)`     |
| `--wfd-control-bg-hover`     | Background on hover        | `rgba(0,0,0,0.75)`     |
| `--wfd-control-border`       | Border shorthand           | `none`                  |
| `--wfd-control-color`        | Icon / text color          | `#fff`                  |
| `--wfd-control-icon-size`    | SVG icon width & height    | `22px`                  |
| `--wfd-control-bottom`       | Bottom offset              | `12px`                  |
| `--wfd-control-right`        | Right offset               | `12px`                  |
| `--wfd-control-tooltip-bg`   | Tooltip background         | `rgba(0,0,0,0.8)`      |
| `--wfd-control-tooltip-color`| Tooltip text color         | `#fff`                  |

### Example: theming the control downstream

In your project's CSS file (e.g. `_static/my-wireframe.css`), override
any combination of properties:

```css
/* Dark teal button matching jdaviz branding */
[data-wireframe-demo] {
    --wfd-control-bg: rgba(0, 59, 77, 0.9);
    --wfd-control-bg-hover: rgba(0, 125, 164, 0.9);
    --wfd-control-border: 2px solid rgba(255, 255, 255, 0.2);
    --wfd-control-radius: 8px;
    --wfd-control-size: 44px;
}
```

You can also scope overrides to light/dark themes:

```css
html[data-theme="light"] [data-wireframe-demo] {
    --wfd-control-bg: rgba(0, 0, 0, 0.6);
    --wfd-control-bg-hover: rgba(0, 0, 0, 0.8);
}
```

### Overriding highlight styles

The element highlight (orange pulse) is injected into the main document, so
standard CSS specificity applies:

```css
/* Change highlight to blue */
.wfd-highlight {
    animation: none;
    outline-color: rgba(0, 120, 255, 0.7);
}
```

### Overriding controls host positioning

The `.wfd-controls-host` class is in the light DOM and can be targeted
directly:

```css
/* Move button to bottom-left */
.wfd-controls-host {
    right: auto;
    left: 12px;
}
```

## Programmatic usage

```js
const demo = new WireframeDemo(containerElement, {
    htmlSrc: '_static/app.html',
    steps: [
        '#btn@1500:click',
        { target: '.panel', action: 'toggle-class', value: 'open', delay: 1000 }
    ],
    repeat: true,
    autoStart: true,
    pauseOnInteraction: true,
    onStepStart: function (index, step) { },
    onStepEnd: function (index, step) { },
    onComplete: function () { }
});

// Control playback
demo.pause();
demo.play();
demo.restart();
demo.destroy();
```

## License

BSD 3-Clause
