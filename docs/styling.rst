Styling & Theming
=================

The play/pause/restart control button lives inside a **Shadow DOM** for
style isolation — it won't be affected by your page's stylesheets and
won't leak styles into your content.

To let downstream projects theme the button without breaking
encapsulation, all visual properties are exposed as **CSS custom
properties** (also known as CSS variables). Because custom properties
inherit through Shadow DOM boundaries, you can set them on the
``[data-wireframe-demo]`` container or any ancestor element.


Control button custom properties
---------------------------------

.. list-table::
   :header-rows: 1
   :widths: 30 40 30

   * - Property
     - What it controls
     - Default
   * - ``--wfd-control-size``
     - Button width and height
     - ``44px``
   * - ``--wfd-control-radius``
     - Border-radius
     - ``8px``
   * - ``--wfd-control-bg``
     - Background color
     - ``rgba(0,0,0,0.55)``
   * - ``--wfd-control-bg-hover``
     - Background color on hover
     - ``rgba(0,0,0,0.75)``
   * - ``--wfd-control-border``
     - Border shorthand
     - ``none``
   * - ``--wfd-control-color``
     - Icon / text color
     - ``#fff``
   * - ``--wfd-control-icon-size``
     - SVG icon width and height
     - ``22px``
   * - ``--wfd-control-bottom``
     - Bottom offset from the container
     - ``12px``
   * - ``--wfd-control-right``
     - Right offset from the container
     - ``12px``
   * - ``--wfd-control-tooltip-bg``
     - Tooltip background color
     - ``rgba(0,0,0,0.8)``
   * - ``--wfd-control-tooltip-color``
     - Tooltip text color
     - ``#fff``


Basic example
-------------

Set any combination of properties on the demo container:

.. code-block:: css

   [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 59, 77, 0.9);
       --wfd-control-bg-hover: rgba(0, 125, 164, 0.9);
       --wfd-control-border: 2px solid rgba(255, 255, 255, 0.2);
       --wfd-control-radius: 8px;
       --wfd-control-size: 44px;
   }


Scoping to light / dark themes
-------------------------------

If your Sphinx theme supports light and dark modes (e.g. ``pydata-sphinx-theme``),
scope overrides to the appropriate ``data-theme`` attribute:

.. code-block:: css

   /* Dark mode (default look) */
   [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 59, 77, 0.9);
       --wfd-control-bg-hover: rgba(0, 125, 164, 0.9);
   }

   /* Light mode — more contrast */
   html[data-theme="light"] [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 0, 0, 0.6);
       --wfd-control-bg-hover: rgba(0, 0, 0, 0.8);
   }


Repositioning the button
-------------------------

The button's position is controlled by ``--wfd-control-bottom`` and
``--wfd-control-right``. To move it to a different corner:

.. code-block:: css

   /* Bottom-left instead of bottom-right */
   [data-wireframe-demo] {
       --wfd-control-right: auto;
   }

   .wfd-controls-host {
       right: auto;
       left: 12px;
   }

.. note::

   The ``.wfd-controls-host`` element is in the light DOM (outside the
   Shadow DOM), so you can target it directly for positioning changes that
   go beyond what the custom properties support.


Making it circular
------------------

.. code-block:: css

   [data-wireframe-demo] {
       --wfd-control-size: 36px;
       --wfd-control-radius: 50%;
       --wfd-control-icon-size: 18px;
   }


Customizing the highlight
--------------------------

The element highlight (orange pulse ring) is injected into the main
document, not the Shadow DOM. You can override it with normal CSS:

.. code-block:: css

   /* Blue highlight instead of orange */
   .wfd-highlight {
       outline-color: rgba(0, 120, 255, 0.7);
   }

   /* Disable the pulse animation */
   .wfd-highlight {
       animation: none;
   }


Customizing the caption overlay
--------------------------------

Captions (the semi-transparent text overlay shown when steps include a
``caption`` field) can be themed via CSS custom properties:

.. list-table::
   :header-rows: 1
   :widths: 30 40 30

   * - Property
     - What it controls
     - Default
   * - ``--wfd-caption-bg``
     - Background color
     - ``rgba(0,0,0,0.72)``
   * - ``--wfd-caption-color``
     - Text color
     - ``#fff``
   * - ``--wfd-caption-font-size``
     - Font size
     - ``14px``
   * - ``--wfd-caption-padding``
     - Padding
     - ``10px 16px``
   * - ``--wfd-caption-inset``
     - Left & right inset — centres the caption and keeps it clear of the
       control button
     - ``68px``

.. code-block:: css

   [data-wireframe-demo] {
       --wfd-caption-bg: rgba(0, 0, 80, 0.85);
       --wfd-caption-font-size: 16px;
   }

You can also apply a custom CSS class to individual captions using the
``captionOptions.className`` field in JSON step objects, or target the
``.wfd-caption`` element directly:

.. code-block:: css

   /* Subtle border on all captions */
   .wfd-caption {
       border-top: 1px solid rgba(255, 255, 255, 0.15);
   }

   /* Change outline width and offset */
   .wfd-highlight {
       outline-width: 3px;
       outline-offset: 4px;
   }


Full theming example
---------------------

Here is a complete example of a downstream project (like jdaviz) applying
custom branding to the demo controls in its own CSS file:

.. code-block:: css

   /*
    * my-project-wireframe.css
    * Custom theming for the wireframe demo control button.
    */

   /* Brand the control button */
   [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 59, 77, 0.9);
       --wfd-control-bg-hover: rgba(0, 125, 164, 0.9);
       --wfd-control-border: 2px solid rgba(255, 255, 255, 0.2);
       --wfd-control-radius: 8px;
       --wfd-control-size: 44px;
       --wfd-control-icon-size: 24px;
   }

   /* Adjust for light mode */
   html[data-theme="light"] [data-wireframe-demo] {
       --wfd-control-bg: rgba(0, 0, 0, 0.65);
       --wfd-control-bg-hover: rgba(0, 0, 0, 0.85);
       --wfd-control-border: 2px solid rgba(0, 0, 0, 0.15);
   }

   /* Tint the highlight to match brand */
   .wfd-highlight {
       outline-color: rgba(0, 125, 164, 0.7);
   }

Load this CSS file in your Sphinx ``conf.py``:

.. code-block:: python

   html_css_files = ['my-project-wireframe.css']

Or include it via the directive's ``:css:`` option:

.. code-block:: rst

   .. wireframe-demo:: _static/my-wireframe.html
      :css: _static/my-project-wireframe.css
      :steps: #btn@1500:click
