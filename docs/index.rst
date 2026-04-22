docs-wireframe-demo
====================

A reusable infrastructure for embedding interactive wireframe demos
in Sphinx documentation and standalone HTML pages.

Any package can provide its own HTML wireframe and a list of demo steps.
This package handles:

* Fetching and injecting the HTML into a container
* Overlaying play / pause / restart controls (Shadow DOM isolated)
* Stepping through actions (click, toggle-class, set-value, …) on a timer
* Pausing automatically when the user interacts with the demo
* Supporting multiple independent instances on the same page

.. toctree::
   :maxdepth: 2
   :caption: Contents

   quickstart
   configuration
   sphinx-directive
   styling
   standalone
   embedding
