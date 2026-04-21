import html as html_module
import importlib.resources
import json
import shutil
import time

from docutils import nodes
from sphinx.util.docutils import SphinxDirective
from sphinx.util import logging

from .validator import validate_wireframe_sequence


def _load_asset(filename, assets_dir=None):
    """Read a static asset as text, preferring ``assets_dir`` over bundled defaults."""
    if assets_dir:
        import os
        path = os.path.join(assets_dir, filename)
        if os.path.isfile(path):
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
    pkg_files = importlib.resources.files('docs_wireframe_demo')
    return (pkg_files / '_static' / filename).read_text(encoding='utf-8')


def _load_asset_bytes(filename, assets_dir=None):
    """Read a static asset as bytes, preferring ``assets_dir`` over bundled defaults."""
    if assets_dir:
        import os
        path = os.path.join(assets_dir, filename)
        if os.path.isfile(path):
            with open(path, 'rb') as f:
                return f.read()
    pkg_files = importlib.resources.files('docs_wireframe_demo')
    return (pkg_files / '_static' / filename).read_bytes()


def _load_engine_js():
    """Load the generic wireframe engine JS from the package bundle (never overridden)."""
    pkg_files = importlib.resources.files('docs_wireframe_demo')
    return (pkg_files / '_static' / 'wireframe-engine.js').read_text(encoding='utf-8')


def _apply_variables(content, variables):
    """Apply ``wireframe_variables`` substitutions to a content string.

    Supports:
    - ``{{ key }}`` for flat string values
    - ``{{ prefix.subkey }}`` for nested dict values
    - ``{{ key|capitalize }}`` / ``{{ prefix.subkey|capitalize }}`` filter
    """
    for key, value in variables.items():
        if isinstance(value, dict):
            for subkey, subvalue in value.items():
                escaped = str(subvalue).replace("'", "\\'")
                content = content.replace(
                    f'{{{{ {key}.{subkey}|capitalize }}}}', escaped.capitalize()
                )
                content = content.replace(
                    f'{{{{ {key}.{subkey} }}}}', escaped
                )
        else:
            escaped = str(value).replace("'", "\\'")
            content = content.replace(f'{{{{ {key} }}}}', escaped)
    return content


class WireframeDemoDirective(SphinxDirective):
    """
    Embed an interactive wireframe demonstration.

    This directive loads the wireframe HTML and CSS from the app's ``wireframe_assets_dir``
    (with fallback to bundled defaults), and the generic engine JS from the package.
    The app defines all sidebar content statically in ``wireframe-base.html``; the engine
    runs the demo sequence by targeting elements via CSS selectors or sidebar shorthand names.

    Usage::

        .. wireframe-demo::
           :initial: viewer-add:horiz:v1
           :demo: plugins,plugins@1000:open-panel
           :enable-only: plugins
           :plugin-name: Aperture Photometry
           :show-scroll-to: false
           :demo-repeat: false

    Options
    -------
    initial
        Steps applied instantly before demo starts (and on loop/restart).
        Uses same syntax as ``demo``.
    demo
        Demo step sequence (comma-separated).
        Sidebar shorthand: ``plugins``, ``plugins:open-panel``, ``settings:select-tab=Units``
        CSS selector step: ``#format-select:select=2D Spectrum``, ``.expansion-panel:open-panel``
        Timing: ``plugins@1000:open-panel`` (milliseconds before advancing)
        No-highlight: ``plugins@500!:open-panel``
        Viewer actions: ``viewer-add:horiz:v1``, ``viewer-legend:v1:Layer A|Layer B``
    enable-only
        Restrict which toolbar buttons users can click (comma-separated sidebar names).
    show-scroll-to
        Show "Learn more" scroll-to buttons in sidebar footers. Default: ``false``
    demo-repeat
        Loop demo continuously. Default: ``true``
    plugin-name
        Substituted into ``{{ plugin_name }}`` in ``wireframe-base.html``.
        Default: ``Data Analysis Plugin``
    viewer-image
        Image path (relative to ``_static``) to display in the viewer area.
    """

    option_spec = {
        'initial': str,
        'demo': str,
        'enable-only': str,
        'show-scroll-to': str,
        'demo-repeat': str,
        'plugin-name': str,
        'viewer-image': str,
    }

    def run(self):
        assets_dir = self.env.app.config.wireframe_assets_dir
        try:
            html_content = _load_asset('wireframe-base.html', assets_dir)
            css_content  = _load_asset('wireframe-demo.css',   assets_dir)
            js_content   = _load_engine_js()
        except Exception as e:
            error_node = nodes.error()
            error_node += nodes.paragraph(text=f'Error loading wireframe components: {e}')
            return [error_node]

        # Fix relative asset paths in CSS for inline embedding (only when referenced).
        docname = self.env.docname
        depth = docname.count('/')
        static_prefix = ('../' * depth + '_static/') if depth > 0 else '_static/'
        if "url('api.svg')" in css_content:
            css_content = css_content.replace("url('api.svg')", f"url('{static_prefix}api.svg')")

        # Build per-directive variables (global wireframe_variables + directive-local overrides)
        variables = dict(self.env.app.config.wireframe_variables)
        plugin_name = self.options.get('plugin-name', 'Data Analysis Plugin')
        variables['plugin_name'] = plugin_name

        # Apply variable substitutions to HTML (engine JS needs none — it is app-agnostic)
        html_content = _apply_variables(html_content, variables)

        # Add modifier class for docs pages
        html_content = html_content.replace(
            '<div class="wireframe-section">',
            '<div class="wireframe-section wireframe-docs">'
        )

        # Process directive options
        initial_state  = self.options.get('initial', None)
        demo_order     = self.options.get('demo', None)
        enable_only    = self.options.get('enable-only', None)
        show_scroll_to = self.options.get('show-scroll-to', 'false').lower() == 'true'
        demo_repeat    = self.options.get('demo-repeat', 'true').lower() == 'true'
        viewer_image   = self.options.get('viewer-image', None)

        # Validate directive sequences at build time
        logger = logging.getLogger(__name__)
        if initial_state:
            validate_wireframe_sequence(initial_state, 'initial', docname, self.lineno, logger)
        if demo_order:
            validate_wireframe_sequence(demo_order, 'demo', docname, self.lineno, logger)

        # Generate unique ID for this wireframe instance
        unique_id = f"wireframe-{int(time.time() * 1000000) % 1000000}"

        # Build config object
        config_obj = {}
        if initial_state:
            config_obj['initialState'] = [s.strip() for s in initial_state.split(',')]
        if demo_order:
            config_obj['customDemo'] = [s.strip() for s in demo_order.split(',')]
        if enable_only is not None:
            config_obj['enableOnly'] = [s.strip() for s in enable_only.split(',') if s.strip()]
        config_obj['showScrollTo'] = show_scroll_to
        config_obj['demoRepeat']   = demo_repeat
        if viewer_image:
            config_obj['viewerImage'] = viewer_image

        config_json_escaped = html_module.escape(json.dumps(config_obj))

        html_content = html_content.replace(
            '<div class="wireframe-container">',
            f'<div class="wireframe-container" id="{unique_id}" '
            f'data-wireframe-config="{config_json_escaped}">'
        )

        complete_html = f'''
<style>
{css_content}
</style>

{html_content}

<script>
{js_content}
</script>
'''

        return [nodes.raw('', complete_html, format='html')]


def copy_wireframe_assets(app, exception):
    """Copy wireframe static files into the Sphinx ``_static`` output dir."""
    if exception is not None or app.builder.name != 'html':
        return

    import os
    assets_dir = app.config.wireframe_assets_dir

    static_dir = os.path.join(app.outdir, '_static')

    # api.svg is copied verbatim
    for filename in ['api.svg']:
        dst_bytes = _load_asset_bytes(filename, assets_dir)
        with open(os.path.join(static_dir, filename), 'wb') as f:
            f.write(dst_bytes)

    # wireframe-demo.css: copy from assets_dir (jdaviz override) or package default
    css_content = _load_asset('wireframe-demo.css', assets_dir)
    with open(os.path.join(static_dir, 'wireframe-demo.css'), 'w', encoding='utf-8') as f:
        f.write(css_content)

    # wireframe-base.html: copy with all wireframe_variables substituted so the
    # index page fetch gets fully-rendered HTML (no remaining {{ ... }} placeholders)
    base_html = _load_asset('wireframe-base.html', assets_dir)
    variables = app.config.wireframe_variables or {}
    base_html = _apply_variables(base_html, variables)
    with open(os.path.join(static_dir, 'wireframe-base.html'), 'w', encoding='utf-8') as f:
        f.write(base_html)

    # wireframe-engine.js: always from the package bundle (never overridden by jdaviz)
    engine_js = _load_engine_js()
    with open(os.path.join(static_dir, 'wireframe-engine.js'), 'w', encoding='utf-8') as f:
        f.write(engine_js)

