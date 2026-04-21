"""
Sphinx extension entry point for docs-wireframe-demo.

Register the ``.. wireframe-demo::`` directive and ensure the
JavaScript / CSS assets are included in every built page.
"""

import os

from .directive import WireframeDemoDirective

_STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')


def setup(app):
    # Register the directive
    app.add_directive('wireframe-demo', WireframeDemoDirective)

    # Add the package's static directory so Sphinx copies it to _static/
    app.connect('builder-inited', _add_static_path)

    # Include JS and CSS on every page that might contain a wireframe-demo
    app.add_js_file('wireframe-demo-controller.js')
    app.add_css_file('wireframe-demo-controls.css')

    return {
        'version': '0.1.0',
        'parallel_read_safe': True,
        'parallel_write_safe': True,
    }


def _add_static_path(app):
    app.config.html_static_path.append(_STATIC_DIR)
