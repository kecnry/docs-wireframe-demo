Standalone HTML
===============

You can use docs-wireframe-demo in any HTML page without Sphinx.
Just include the two asset files and set up your containers.


Include the assets
------------------

Copy (or serve) these two files from the package's ``static/`` directory:

* ``wireframe-demo-controller.js``
* ``wireframe-demo-controls.css``

.. code-block:: html

   <link rel="stylesheet" href="wireframe-demo-controls.css">
   <script src="wireframe-demo-controller.js"></script>


Declarative usage
-----------------

Add a ``data-wireframe-demo`` attribute and a ``data-wireframe-config``
JSON attribute to any element:

.. code-block:: html

   <div data-wireframe-demo
        data-wireframe-config='{
     "htmlSrc": "my-wireframe.html",
     "steps": [
       {"target": "#btn", "action": "click", "delay": 1500},
       {"target": "#panel", "action": "toggle-class", "value": "open", "delay": 1000}
     ],
     "repeat": true
   }'></div>

The controller auto-discovers these elements on ``DOMContentLoaded``.


Programmatic usage
------------------

.. code-block:: html

   <div id="my-demo"></div>

   <script>
   var demo = new WireframeDemo(document.getElementById('my-demo'), {
       htmlSrc: 'my-wireframe.html',
       steps: [
           { target: '#btn', action: 'click', delay: 1500 },
           { target: '#panel', action: 'toggle-class', value: 'open', delay: 1000 }
       ],
       repeat: true,
       onStepStart: function(index, step) {
           console.log('Step', index, step.action);
       }
   });

   // Control programmatically:
   // demo.pause();
   // demo.play();
   // demo.restart();
   // demo.destroy();
   </script>


Dynamically loaded HTML
-----------------------

If your wireframe HTML is loaded after the page (e.g. via a framework
router), dispatch the ``wireframe-demo-loaded`` event to trigger
auto-discovery of any new containers:

.. code-block:: javascript

   // After injecting new wireframe-demo containers into the DOM:
   document.dispatchEvent(new CustomEvent('wireframe-demo-loaded'));


Full standalone example
-----------------------

.. code-block:: html

   <!DOCTYPE html>
   <html lang="en">
   <head>
       <meta charset="UTF-8">
       <title>Wireframe Demo — Standalone</title>
       <link rel="stylesheet" href="wireframe-demo-controls.css">
       <style>
           body { font-family: sans-serif; max-width: 800px; margin: 40px auto; }
           #demo-container { border: 1px solid #ccc; border-radius: 8px; }
       </style>
   </head>
   <body>
       <h1>My Application Demo</h1>
       <div id="demo-container"
            data-wireframe-demo
            data-wireframe-config='{
              "htmlSrc": "my-app-wireframe.html",
              "steps": [
                "#start-btn@2000:click",
                "#sidebar@1000:add-class=open",
                "#search@1500:type-text=example query",
                "#search-btn@1500:click",
                "#sidebar@1000:remove-class=open",
                "pause@2000"
              ]
            }'>
       </div>
       <script src="wireframe-demo-controller.js"></script>
   </body>
   </html>
