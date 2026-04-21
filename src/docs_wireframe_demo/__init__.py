"""
docs-wireframe-demo: Reusable wireframe demo infrastructure for Sphinx and standalone HTML.
"""

__version__ = "0.1.0"


def setup(app):
    """Sphinx extension entry point."""
    from .extension import setup as _setup
    return _setup(app)
