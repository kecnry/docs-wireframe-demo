docs-wireframe-demo
====================

A reusable infrastructure for embedding interactive wireframe demos
in Sphinx documentation and standalone HTML pages.

.. wireframe-demo:: _static/example-wireframe.html
   :steps: #demo-btn-1@1500:click|Click the first button, #demo-panel@1000:toggle-class=open|^Toggle the panel open, #demo-btn-2@1500:add-class=active|Activate the second button, #demo-input@1500:type-text=Hello World|Type into the input, #demo-btn-2@1500:remove-class=active, #demo-panel@1000:toggle-class=open|vClose the panel
   :height: 300px
   :repeat: true

Any package can provide its own HTML wireframe and a list of demo steps.
This package handles:

* Fetching and injecting the HTML into a container
* Overlaying play / pause / restart controls (Shadow DOM isolated)
* Stepping through actions (click, toggle-class, type-text, …) on a timer
* Pausing automatically when the user interacts with the demo
* Supporting multiple independent instances on the same page

.. toctree::
   :maxdepth: 2
   :caption: Contents

   quickstart
   configuration
   sphinx-directive
   styling
   accessibility
   standalone
   embedding
   ci-integration
