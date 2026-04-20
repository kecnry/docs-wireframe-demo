import html as html_module
import importlib.resources
import json
import shutil
import time

from docutils import nodes
from sphinx.util.docutils import SphinxDirective
from sphinx.util import logging

from .content import generate_content_for_sidebar
from .validator import validate_wireframe_sequence


def _load_asset(filename):
    """Read a bundled static asset as text."""
    pkg_files = importlib.resources.files('docs_wireframe_demo')
    return (pkg_files / '_static' / filename).read_text(encoding='utf-8')


def _load_asset_bytes(filename):
    """Read a bundled static asset as bytes."""
    pkg_files = importlib.resources.files('docs_wireframe_demo')
    return (pkg_files / '_static' / filename).read_bytes()


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

    This directive loads the wireframe HTML, CSS, and JavaScript from the
    ``docs_wireframe_demo`` package and injects them into the documentation page.

    Usage::

        .. wireframe-demo::
           :initial: loaders,loaders:select-tab=Data
           :demo: plugins
           :enable-only: plugins
           :plugin-name: Aperture Photometry
           :plugin-panel-opened: false
           :custom-content: plugins=<html content>

    Options
    -------
    initial
        Initial state applied before demo starts, when repeating, or on restart.
        Uses same syntax as demo. Applied quickly without delays.
    demo
        Custom demo sidebar order (comma-separated list) or demo sequence.
        Default: ``loaders,save,settings,info,plugins,subsets``
        Can also specify actions like: ``plugins:open-panel,plugins:select-data=Image 2``
        Can specify timing with @: ``plugins@1000:open-panel`` (1000ms delay)
    enable-only
        Only enable clicking on these sidebars (comma-separated).
        Others will be disabled. If not specified, all are enabled.
    show-scroll-to
        Whether to show "Learn more" scroll-to buttons. Default: false
    demo-repeat
        Whether demo should loop continuously. Default: true
    plugin-name
        Name of the plugin expansion panel. Default: ``Data Analysis Plugin``
    plugin-panel-opened
        Whether plugin panel is open by default. Default: true
    custom-content
        Custom HTML content for sidebars.
        Format: ``sidebar=content`` or ``sidebar:tab=content``
        Replaces the default description content.
    viewer-image
        Path to an image (relative to _static) to display in the viewer area.
        The image will fill the viewer area with overflow hidden.
    """

    option_spec = {
        'initial': str,
        'demo': str,
        'enable-only': str,
        'show-scroll-to': str,
        'demo-repeat': str,
        'plugin-name': str,
        'plugin-panel-opened': str,
        'custom-content': str,
        'viewer-image': str,
    }

    def run(self):
        try:
            html_content = _load_asset('wireframe-base.html')
            css_content = _load_asset('wireframe-demo.css')
            js_content = _load_asset('wireframe-controller.js')
        except Exception as e:
            error_node = nodes.error()
            error_node += nodes.paragraph(
                text=f'Error loading wireframe components: {e}'
            )
            return [error_node]

        # Fix relative paths in CSS for inline embedding.
        # When CSS is embedded in a page (e.g. /plugins/foo.html), url('api.svg')
        # needs to become a relative path to _static/api.svg.
        docname = self.env.docname  # e.g. 'plugins/aperture_photometry'
        depth = docname.count('/')
        static_prefix = ('../' * depth + '_static/') if depth > 0 else '_static/'
        css_content = css_content.replace("url('api.svg')", f"url('{static_prefix}api.svg')")

        # Apply wireframe_variables substitutions
        variables = self.env.app.config.wireframe_variables
        html_content = _apply_variables(html_content, variables)
        js_content = _apply_variables(js_content, variables)

        # Add modifier class for docs pages (to distinguish from landing page)
        html_content = html_content.replace(
            '<div class="wireframe-section">',
            '<div class="wireframe-section wireframe-docs">'
        )

        # Process directive options
        initial_state = self.options.get('initial', None)
        demo_order = self.options.get('demo', None)
        enable_only = self.options.get('enable-only', None)
        show_scroll_to = self.options.get('show-scroll-to', 'false').lower() == 'true'
        demo_repeat = self.options.get('demo-repeat', 'true').lower() == 'true'
        plugin_name = self.options.get('plugin-name', None)
        plugin_panel_opened = self.options.get('plugin-panel-opened', 'true').lower() == 'true'
        custom_content = self.options.get('custom-content', None)
        viewer_image = self.options.get('viewer-image', None)

        # Validate directive sequences at build time
        logger = logging.getLogger(__name__)
        lineno = self.lineno

        if initial_state:
            validate_wireframe_sequence(initial_state, 'initial', docname, lineno, logger)
        if demo_order:
            validate_wireframe_sequence(demo_order, 'demo', docname, lineno, logger)

        # Generate unique ID for this wireframe instance
        unique_id = f"wireframe-{int(time.time() * 1000000) % 1000000}"

        # Build custom content map - first from explicit custom-content option
        custom_content_map = {}
        if custom_content:
            for item in custom_content.split('|'):
                if '=' in item:
                    sidebar, content = item.split('=', 1)
                    custom_content_map[sidebar.strip()] = {'main': content.strip()}

        # Auto-generate missing content from registry for common sidebars
        registry = self.env.app.config.wireframe_content_registry
        for sidebar_type in ['loaders', 'save', 'settings', 'info', 'subsets']:
            if sidebar_type not in custom_content_map:
                generated = generate_content_for_sidebar(registry, sidebar_type)
                if generated:
                    custom_content_map[sidebar_type] = generated

        # Special handling for plugins - auto-generate if plugin_name provided
        if plugin_name and 'plugins' not in custom_content_map:
            generated = generate_content_for_sidebar(registry, 'plugins', plugin_name=plugin_name)
            if generated:
                custom_content_map['plugins'] = generated

        # Build config object and inject as data attribute on the container
        config_obj = {}
        if initial_state:
            config_obj['initialState'] = [s.strip() for s in initial_state.split(',')]
        if demo_order:
            config_obj['customDemo'] = [s.strip() for s in demo_order.split(',')]
        if enable_only is not None:
            config_obj['enableOnly'] = [s.strip() for s in enable_only.split(',') if s.strip()]
        config_obj['showScrollTo'] = show_scroll_to
        config_obj['demoRepeat'] = demo_repeat
        if plugin_name:
            config_obj['pluginName'] = plugin_name
        config_obj['pluginPanelOpened'] = plugin_panel_opened
        if custom_content_map:
            config_obj['customContentMap'] = json.dumps(custom_content_map)
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
    """Copy wireframe files from the package into the Sphinx ``_static`` output dir."""
    if exception is not None or app.builder.name != 'html':
        return

    import os
    static_dir = os.path.join(app.outdir, '_static')
    variables = app.config.wireframe_variables

    # Files copied verbatim
    simple_files = ['wireframe-demo.css', 'api.svg']

    # Files that need variable substitution
    template_files = ['wireframe-base.html', 'wireframe-controller.js']

    for filename in simple_files:
        dst = os.path.join(static_dir, filename)
        dst_bytes = _load_asset_bytes(filename)
        with open(dst, 'wb') as f:
            f.write(dst_bytes)

    for filename in template_files:
        dst = os.path.join(static_dir, filename)
        content = _load_asset(filename)
        content = _apply_variables(content, variables)
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(content)
