"""
Sphinx directive for embedding interactive wireframe demos.

Usage in RST::

    .. wireframe-demo:: _static/my-wireframe.html
       :steps: #btn@1500:click, #panel@1000:toggle-class=open
       :repeat: true
       :height: 500px
"""

import html as html_module
import json
import os
import time

from docutils import nodes
from sphinx.util.docutils import SphinxDirective


class WireframeDemoDirective(SphinxDirective):
    """Embed an interactive wireframe demo with playback controls.

    Required argument: path to the HTML file (relative to the source directory
    or the ``_static`` directory).

    Options
    -------
    steps
        Comma-separated shorthand step strings.
    steps-json
        Inline JSON array of step objects.
    repeat
        Loop the demo (``true`` or ``false``, default ``true``).
    auto-start
        Start automatically when visible (``true`` or ``false``, default ``true``).
    pause-on-interaction
        Pause on user click (``true`` or ``false``, default ``true``).
    css
        Additional CSS file path to include.
    js
        Additional JS file path to include.
    id
        Explicit container id (auto-generated if omitted).
    height
        Container height (e.g. ``500px``).
    """

    required_arguments = 1   # path to HTML file
    optional_arguments = 0
    has_content = False

    option_spec = {
        'steps': str,
        'steps-json': str,
        'repeat': str,
        'auto-start': str,
        'pause-on-interaction': str,
        'css': str,
        'js': str,
        'id': str,
        'height': str,
        'initial-class': str,
        'cursor': str,
        'cursor-speed': str,
        'reduce-motion': str,
    }

    def run(self):
        html_path = self.arguments[0]

        # Compute relative path prefix to _static/ based on document depth.
        # A page at "plugins/gaussian_smooth" is 1 level deep → "../_static/"
        # A page at "loaders/sources/file" is 2 levels deep → "../../_static/"
        # A page at "index" is 0 levels deep → "_static/"
        depth = self.env.docname.count('/')
        static_prefix = '../' * depth + '_static/'

        def resolve_static_path(p):
            """Resolve a path that may reference a _static/ file."""
            if p.startswith('_static/'):
                return static_prefix + p[len('_static/'):]
            if '/' not in p:
                # Bare filename — assume it lives in _static/
                return static_prefix + p
            return p

        # Build config object
        config = {}
        config['htmlSrc'] = resolve_static_path(html_path)

        # Steps: either shorthand strings or JSON
        steps_str = self.options.get('steps')
        steps_json = self.options.get('steps-json')
        if steps_json:
            try:
                config['steps'] = json.loads(steps_json)
            except json.JSONDecodeError as exc:
                error = nodes.error()
                error += nodes.paragraph(
                    text=f'wireframe-demo: invalid :steps-json:: {exc}')
                return [error]
        elif steps_str:
            config['steps'] = [s.strip() for s in steps_str.split(',')]

        # Boolean options
        for opt, key in [('repeat', 'repeat'),
                         ('auto-start', 'autoStart'),
                         ('pause-on-interaction', 'pauseOnInteraction')]:
            val = self.options.get(opt)
            if val is not None:
                config[key] = val.strip().lower() == 'true'

        # Cursor
        cursor_val = self.options.get('cursor')
        if cursor_val is not None:
            config['cursor'] = cursor_val.strip().lower() == 'true'
        cursor_speed = self.options.get('cursor-speed')
        if cursor_speed is not None:
            try:
                config['cursorSpeed'] = int(cursor_speed)
            except ValueError:
                pass

        # Reduce motion
        reduce_motion = self.options.get('reduce-motion')
        if reduce_motion is not None:
            val = reduce_motion.strip().lower()
            if val == 'true':
                config['reduceMotion'] = True
            elif val == 'false':
                config['reduceMotion'] = False
            else:
                config['reduceMotion'] = 'auto'

        # Container id
        container_id = self.options.get(
            'id', f'wfd-{int(time.time() * 1000000) % 1000000}')

        # Height
        height = self.options.get('height', '')

        # Initial CSS class(es) to apply to the content root
        initial_class = self.options.get('initial-class', '')
        if initial_class:
            config['initialClass'] = initial_class

        config_json = json.dumps(config)
        config_escaped = html_module.escape(config_json)

        style_attr = f' style="height:{height}"' if height else ''

        # Additional CSS/JS — resolve paths relative to _static/
        extra_css = ''
        css_path = self.options.get('css')
        if css_path:
            resolved_css = resolve_static_path(css_path)
            extra_css = f'<link rel="stylesheet" href="{html_module.escape(resolved_css)}">'

        extra_js = ''
        js_path = self.options.get('js')
        if js_path:
            resolved_js = resolve_static_path(js_path)
            extra_js = f'<script src="{html_module.escape(resolved_js)}"></script>'

        raw_html = f"""\
{extra_css}
{extra_js}
<div id="{container_id}"
     data-wireframe-demo
     data-wireframe-config="{config_escaped}"{style_attr}>
</div>
"""
        node = nodes.raw('', raw_html, format='html')
        return [node]
