Quick Start
===========

Installation
------------

Install from source (or from PyPI once published):

.. code-block:: bash

   pip install docs-wireframe-demo

For building documentation locally you will also need the theme:

.. code-block:: bash

   pip install docs-wireframe-demo[docs]


Minimal Sphinx example
----------------------

1. Add the extension to your Sphinx ``conf.py``:

   .. code-block:: python

      extensions = [
          'docs_wireframe_demo',
      ]

2. Place your wireframe HTML in ``docs/_static/my-app.html``.

3. Use the directive in any RST file:

   .. code-block:: rst

      .. wireframe-demo:: _static/my-app.html
         :steps: #start-btn@1500:click, #panel@1000:toggle-class=open, #save-btn@2000:click
         :height: 400px

   This will:

   * Fetch ``my-app.html`` at page load
   * Inject it into a container with play/pause/restart controls
   * Step through the actions, highlighting each target element
   * Pause if the user clicks anywhere inside the demo


Live example
------------

.. wireframe-demo:: _static/example-wireframe.html
   :steps: #demo-btn-1@1500:click, #demo-panel@1000:toggle-class=open, #demo-btn-2@1500:add-class=active, #demo-input@1500:set-value=Hello World, #demo-btn-2@1500:remove-class=active, #demo-panel@1000:toggle-class=open
   :height: 300px
   :repeat: true


Minimal standalone HTML example
-------------------------------

No Sphinx needed — just include the JS and CSS files directly:

.. code-block:: html

   <!DOCTYPE html>
   <html>
   <head>
       <link rel="stylesheet" href="wireframe-demo-controls.css">
   </head>
   <body>
       <div data-wireframe-demo
            data-wireframe-config='{
              "htmlSrc": "my-app.html",
              "steps": [
                {"target": "#btn", "action": "click", "delay": 1500},
                {"target": "#panel", "action": "toggle-class", "value": "open", "delay": 1000}
              ]
            }'>
       </div>
       <script src="wireframe-demo-controller.js"></script>
   </body>
   </html>
