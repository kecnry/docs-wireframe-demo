project = 'docs-wireframe-demo'
copyright = '2026, docs-wireframe-demo contributors'
author = 'docs-wireframe-demo contributors'
release = '0.1.0'

extensions = [
    'docs_wireframe_demo',
]

html_theme = 'pydata_sphinx_theme'
html_static_path = ['_static']

html_theme_options = {
    'github_url': 'https://github.com/your-org/docs-wireframe-demo',
}

# Suppress "toctree contains reference to nonexisting document" for demo pages
suppress_warnings = ['toc.excluded']
