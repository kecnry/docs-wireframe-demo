Embedding in Confluence
=======================

Wireframe demos can be embedded in Confluence pages using the
**built-in iframe macro** — no third-party apps or admin approval
required.

The approach works by building self-contained demo pages (wireframe
HTML + controller JS + CSS + step config all inlined into a single file)
and hosting them on GitHub Pages.  Confluence embeds each page via
iframe.


How it works
------------

1. **Wireframes** are authored once in ``examples/wireframes/`` —
   these are the layout and styling for your demo UI.

2. **Demo configs** live in ``examples/demos/`` as JSON files.  Each
   config references a wireframe and defines the step sequence:

   .. code-block:: json

      {
        "wireframe": "kitchen-sink.html",
        "title": "Kitchen Sink — All Built-in Actions",
        "steps": [
          "#btn-sidebar@1800:click",
          "#sidebar@800:toggle-class=open",
          "#input-search@1500:set-value=pipeline"
        ],
        "repeat": true,
        "height": "420px"
      }

   Multiple configs can reference the **same wireframe** with different
   step sequences.

3. **A build script** (``examples/build.py``) combines each config with
   its wireframe and inlines the controller JS and CSS into a single
   self-contained HTML page.  The output has no external dependencies
   and no ``fetch()`` calls — it works in any iframe sandbox.

4. **GitHub Actions** runs the build on push and deploys the output to
   GitHub Pages.


Setting up your project
-----------------------

1. Add your wireframe HTML files to ``examples/wireframes/``.

2. Create a JSON config in ``examples/demos/`` for each demo variant.
   See ``examples/demos/kitchen-sink-full.json`` for a complete
   example.

3. Test locally:

   .. code-block:: bash

      python examples/build.py
      # Open _site/kitchen-sink-full.html in a browser

4. Push to ``main``.  The ``pages.yml`` workflow builds and deploys the
   pages to GitHub Pages automatically.


Embedding in Confluence
-----------------------

Use Confluence's built-in **iframe macro** (or the "Widget Connector"
macro on Confluence Cloud):

1. Get your demo page URL from GitHub Pages::

      https://<org>.github.io/<repo>/kitchen-sink-full.html

2. In Confluence, insert an iframe / Widget Connector macro.

3. Paste the URL and set the height (e.g. ``420px``).

That's it.  The demo page is fully self-contained — no ``fetch()``
calls, no CORS issues, no sandbox restrictions.


Reusing wireframes with different steps
---------------------------------------

The same wireframe can power multiple demos.  For example:

.. code-block:: text

   examples/
     wireframes/
       kitchen-sink.html          ← one wireframe
     demos/
       kitchen-sink-full.json     ← long demo (all actions)
       kitchen-sink-short.json    ← short demo (highlights only)

Both JSON configs reference ``"wireframe": "kitchen-sink.html"`` but
define different step sequences.  The build script produces a separate
self-contained page for each.


Demo config reference
---------------------

.. list-table::
   :widths: 20 15 65
   :header-rows: 1

   * - Key
     - Default
     - Description
   * - ``wireframe``
     - (required)
     - Filename of the wireframe HTML in ``examples/wireframes/``
   * - ``title``
     - ``"Wireframe Demo"``
     - Page ``<title>``
   * - ``steps``
     - ``[]``
     - Array of step shorthand strings or step objects
   * - ``repeat``
     - ``true``
     - Loop the demo on completion
   * - ``autoStart``
     - ``true``
     - Start automatically when visible
   * - ``height``
     - ``"100vh"``
     - Container height in the built page
   * - ``pauseOnInteraction``
     - ``true``
     - Pause on user clicks inside the demo
   * - ``initialClass``
     - ``""``
     - CSS class(es) applied to the content root on load

See :doc:`configuration` for full details on step syntax and options.


Troubleshooting
---------------

**Demo does not appear in Confluence iframe**
   Verify the GitHub Pages URL loads correctly in a new browser tab.
   Check that GitHub Pages is enabled in the repo settings (Settings →
   Pages → Source: GitHub Actions).

**Demo controls are cut off**
   Increase the iframe height in the Confluence macro settings.  The
   play/pause/restart button is positioned 12 px from the bottom-right
   corner of the container.

**Wireframe styles look wrong**
   The built pages are fully self-contained with inlined styles.
   Confluence CSS cannot leak into the iframe.  If styles look wrong,
   check the wireframe HTML itself.

**Changes aren't reflected**
   GitHub Pages has a CDN cache.  After pushing changes, wait a few
   minutes or append a cache-busting query string to the URL
   (e.g. ``?v=2``).
