from .directive import WireframeDemoDirective, copy_wireframe_assets

__all__ = ['WireframeDemoDirective', 'copy_wireframe_assets', 'setup']


def setup(app):
    app.add_config_value('wireframe_content_registry', {}, 'html')
    app.add_config_value('wireframe_variables', {}, 'html')
    app.add_directive('wireframe-demo', WireframeDemoDirective)
    app.connect('build-finished', copy_wireframe_assets)
    return {'version': '0.1.0', 'parallel_read_safe': True}
