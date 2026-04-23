Sphinx Directive
================

The ``.. wireframe-demo::`` directive embeds an interactive wireframe demo
into any Sphinx-built documentation page.

Basic syntax
------------

.. code-block:: rst

   .. wireframe-demo:: _static/my-wireframe.html
      :steps: #btn@1500:click, #panel@1000:toggle-class=open
      :height: 400px

The first (required) argument is the path to the HTML file.  It will be
fetched at page load time via ``fetch()``, so the file must be accessible
from the browser.  Typically this means placing it in your ``_static/``
directory.


Directive options
-----------------

.. list-table::
   :header-rows: 1
   :widths: 25 10 65

   * - Option
     - Default
     - Description
   * - ``:steps:``
     - —
     - Comma-separated shorthand step strings.
   * - ``:steps-json:``
     - —
     - Inline JSON array of step objects (alternative to ``:steps:``).
   * - ``:repeat:``
     - ``true``
     - Loop the demo (``true`` / ``false``).
   * - ``:auto-start:``
     - ``true``
     - Auto-start when visible (``true`` / ``false``).
   * - ``:pause-on-interaction:``
     - ``true``
     - Pause on user click (``true`` / ``false``).
   * - ``:css:``
     - —
     - Path to an additional CSS file to include.
   * - ``:js:``
     - —
     - Path to an additional JS file to include.
   * - ``:id:``
     - auto
     - Explicit container ``id`` attribute.
   * - ``:height:``
     - —
     - Container height (e.g. ``400px``, ``50vh``).
   * - ``:reduce-motion:``
     - ``auto``
     - Reduced-motion behaviour (``auto`` / ``true`` / ``false``). See
       :doc:`accessibility`.


Using from an external package
------------------------------

Suppose your package **mypackage** ships its own wireframe HTML and wants
to embed demos in its Sphinx documentation.

1. Add ``docs-wireframe-demo`` as a docs dependency:

   .. code-block:: toml

      # pyproject.toml
      [project.optional-dependencies]
      docs = ["docs-wireframe-demo"]

2. Enable the extension in ``conf.py``:

   .. code-block:: python

      extensions = [
          'docs_wireframe_demo',
          # ... your other extensions
      ]

3. Place your wireframe HTML in ``docs/_static/mypackage-wireframe.html``.

4. Use the directive anywhere in your RST:

   .. code-block:: rst

      .. wireframe-demo:: _static/mypackage-wireframe.html
         :steps: #load-btn@1500:click, #sidebar@1000:add-class=visible
         :height: 500px

5. If your wireframe needs domain-specific actions, register them in an
   additional JS file:

   .. code-block:: javascript

      // docs/_static/mypackage-demo-actions.js
      WireframeDemo.registerAction('open-sidebar', function(step, el, root) {
          root.querySelector('.sidebar').classList.add('visible');
      });

   Then include it via the ``:js:`` option:

   .. code-block:: rst

      .. wireframe-demo:: _static/mypackage-wireframe.html
         :js: _static/mypackage-demo-actions.js
         :steps: #toolbar@1500:open-sidebar


Multiple instances
------------------

You can place multiple ``.. wireframe-demo::`` directives on the same page.
Each gets its own independent container, playback state, and controls:

.. code-block:: rst

   First demo
   ----------

   .. wireframe-demo:: _static/demo-a.html
      :steps: #a1@1500:click, #a2@1000:toggle-class=on
      :height: 300px

   Second demo
   -----------

   .. wireframe-demo:: _static/demo-b.html
      :steps: #b1@1500:click
      :height: 300px

They will not interfere with each other — each instance manages its own
step index, timers, and pause state.


Adding captions
---------------

Steps can include transcript-style captions that appear as a semi-transparent
overlay at the top or bottom of the demo container.

**Using the shorthand** ``:steps:`` **syntax**, append ``|caption text`` to any
step string.  Use ``^`` or ``v`` to force top or bottom positioning:

.. code-block:: rst

   .. wireframe-demo:: _static/my-wireframe.html
      :steps: #btn@1500:click|Click the button, #panel@1000:toggle-class=open|^Panel opens, pause@2000|vDone!
      :height: 400px

**Using** ``:steps-json:`` **for full control**, include ``caption`` and
optionally ``captionOptions`` on each step object:

.. code-block:: rst

   .. wireframe-demo:: _static/my-wireframe.html
      :steps-json: [
         {"target": "#btn", "action": "click", "delay": 1500,
          "caption": "Click the button"},
         {"target": "#panel", "action": "toggle-class", "value": "open",
          "delay": 1000, "caption": "Panel opens",
          "captionOptions": {"position": "top"}},
         {"action": "pause", "delay": 2000,
          "caption": "All done!", "captionOptions": {"position": "bottom"}}
         ]
      :height: 400px

Steps without a ``caption`` will hide any previously visible caption.
See :doc:`configuration` for the full list of ``captionOptions`` fields
and CSS custom properties for styling.
