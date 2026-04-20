def generate_form_html(form_elements):
    """Generate HTML for a list of form elements."""
    html_parts = []

    for element in form_elements:
        if element['type'] == 'select':
            options_html = ''.join(f"<option>{opt}</option>" for opt in element['options'])
            select_id = element['label'].lower().replace(' ', '-') + '-select'
            html_parts.append(
                f'<div class="wireframe-form-group">'
                f'<label class="wireframe-form-label">{element["label"]}</label>'
                f'<select id="{select_id}" class="wireframe-select">{options_html}</select>'
                f'</div>'
            )
        elif element['type'] == 'input':
            placeholder = element.get('placeholder', '')
            html_parts.append(
                f'<div class="wireframe-form-group">'
                f'<label class="wireframe-form-label">{element["label"]}</label>'
                f'<input type="text" class="wireframe-input" placeholder="{placeholder}" />'
                f'</div>'
            )
        elif element['type'] == 'checkbox':
            html_parts.append(
                f'<div class="wireframe-form-group">'
                f'<label class="wireframe-checkbox-label">'
                f'<input type="checkbox" class="wireframe-checkbox" /> {element["label"]}'
                f'</label></div>'
            )
        elif element['type'] == 'button':
            html_parts.append(
                f'<button class="wireframe-button">{element["label"]}</button>'
            )

    return ''.join(html_parts)


def generate_content_for_sidebar(registry, sidebar_type, plugin_name=None):
    """Generate content for any sidebar/tab/plugin combination.

    Parameters
    ----------
    registry : dict
        The wireframe content registry (e.g. ``wireframe_content_registry`` from Sphinx config).
    sidebar_type : str
        The sidebar key to look up in the registry.
    plugin_name : str, optional
        For the ``plugins`` sidebar, the name of the specific plugin to render.
    """
    if sidebar_type not in registry:
        return None

    registry_entry = registry[sidebar_type]

    # Handle plugins sidebar with specific plugin
    if sidebar_type == 'plugins' and plugin_name:
        if plugin_name in registry_entry:
            plugin_def = registry_entry[plugin_name]
            if 'form_elements' in plugin_def:
                return {'main': generate_form_html(plugin_def['form_elements'])}
            elif 'text' in plugin_def:
                return {'main': plugin_def['text']}

    # Handle sidebars with tabs
    if 'tabs' in registry_entry and 'tab_content' in registry_entry:
        tab_content_map = {}
        for tab_name, tab_def in registry_entry['tab_content'].items():
            if 'form_elements' in tab_def:
                tab_content_map[tab_name] = generate_form_html(tab_def['form_elements'])
            elif 'text' in tab_def:
                tab_content_map[tab_name] = tab_def['text']
        return tab_content_map

    # Handle simple sidebar with form elements
    if 'form_elements' in registry_entry:
        return {'main': generate_form_html(registry_entry['form_elements'])}

    return None
