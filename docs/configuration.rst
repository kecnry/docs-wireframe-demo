Configuration Reference
=======================

Config object
-------------

When creating a ``WireframeDemo`` programmatically or via the
``data-wireframe-config`` attribute, the following properties are supported:

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Property
     - Type
     - Default
     - Description
   * - ``htmlSrc``
     - string
     - ``null``
     - URL of the HTML file to fetch and inject into the container.
   * - ``steps``
     - array
     - ``[]``
     - Array of step objects or shorthand strings (see below).
   * - ``repeat``
     - bool
     - ``true``
     - Whether to loop the demo when it reaches the end.
   * - ``autoStart``
     - bool
     - ``true``
     - Start automatically when the container is visible in the viewport.
   * - ``pauseOnInteraction``
     - bool
     - ``true``
     - Pause the demo when the user clicks inside the container.
   * - ``cursor``
     - bool
     - ``true``
     - Show an animated cursor that moves to each target element before the
       action executes. Set to ``false`` to disable.
   * - ``cursorSpeed``
     - number
     - ``300``
     - Duration in milliseconds for the cursor movement animation.
   * - ``timeline``
     - bool
     - ``true``
     - Show an interactive progress timeline at the bottom of the container
       on hover. Each step is represented as a dot; filled dots indicate
       completed steps. Click a dot to jump to that step. Set to ``false``
       to disable (also skips HTML snapshot caching used for backward
       navigation).
   * - ``onStepStart``
     - function
     - ``null``
     - Callback ``(stepIndex, step)`` called before each step executes.
   * - ``onStepEnd``
     - function
     - ``null``
     - Callback ``(stepIndex, step)`` called after each step executes.
   * - ``onComplete``
     - function
     - ``null``
     - Callback called when the sequence finishes (before repeat loop).


Step format
-----------

Steps can be provided as **JSON objects** or **shorthand strings**.


JSON object format
^^^^^^^^^^^^^^^^^^

.. code-block:: json

   {
     "target": "#my-element",
     "action": "click",
     "delay": 1500,
     "value": null,
     "noHighlight": false,
     "caption": "Click the element",
     "captionOptions": { "position": "bottom" }
   }

.. list-table::
   :header-rows: 1
   :widths: 15 15 70

   * - Field
     - Required
     - Description
   * - ``target``
     - no
     - CSS selector for the target element (inside the injected HTML).
       Omit for ``pause`` actions.
   * - ``action``
     - yes
     - Action name (see table below).
   * - ``delay``
     - no
     - Milliseconds to hold on this step before advancing (default ``2000``).
   * - ``value``
     - no
     - Action-specific value (e.g. class name for ``toggle-class``).
   * - ``noHighlight``
     - no
     - If ``true``, skip the highlight animation on this step.
   * - ``caption``
     - no
     - Text to display as a semi-transparent caption overlay during this step.
   * - ``captionOptions``
     - no
     - Object with optional keys: ``position`` (``"top"``, ``"bottom"``, or
       ``"auto"``; default ``"auto"``) and ``className`` (extra CSS class to
       apply to the caption element for this step).


Multi-action steps
^^^^^^^^^^^^^^^^^^

A step can execute **multiple actions at once** by providing an ``actions``
array instead of a single ``action`` field. By default sub-actions run
synchronously (no delay between them), and the step's ``delay`` applies
after all actions have executed.

This is useful when several DOM changes should appear simultaneously —
for example, updating an image and its legend in the same visual beat,
or toggling a class while also setting text.

.. code-block:: json

   {
     "actions": [
       { "target": "#sidebar", "action": "toggle-class", "value": "open" },
       { "target": "#status", "action": "set-text", "value": "Ready" }
     ],
     "delay": 1500,
     "caption": "Open sidebar and update status"
   }

Individual sub-actions can include an optional ``delay`` (in ms) to pause
before the next sub-action executes. This is useful for showing cause and
effect within a single step — for example, clicking a button and then
revealing the result after a short pause:

.. code-block:: json

   {
     "actions": [
       { "action": "click-button", "value": "Load", "delay": 500 },
       { "action": "viewer-add", "value": "horiz:Image" },
       { "action": "viewer-image", "value": "Image:photo.png" }
     ],
     "delay": 3000,
     "caption": "Load the data"
   }

Sub-action delays do not create individual timeline dots, captions, or
steppable positions — they are purely visual timing within one step.
The delay on the last sub-action is also respected before the step's
top-level ``delay`` begins.

Each object in the ``actions`` array supports:

.. list-table::
   :header-rows: 1
   :widths: 15 15 70

   * - Field
     - Required
     - Description
   * - ``target``
     - no
     - CSS selector for the sub-action's target element.
   * - ``action``
     - yes
     - Action name (same set as single-action steps).
   * - ``value``
     - no
     - Action-specific value.
   * - ``delay``
     - no
     - Milliseconds to wait after this sub-action before executing the next
       one. Defaults to ``0`` (immediate). Respects the current playback
       speed.

The top-level ``delay``, ``caption``, ``captionOptions``, and
``noHighlight`` fields work the same as on a single-action step. The
cursor (if enabled) moves to the first sub-action's target element.


Shorthand string format
^^^^^^^^^^^^^^^^^^^^^^^

::

   target@delay:action=value|caption text

Examples:

.. code-block:: text

   #btn@1500:click                    → click #btn, hold 1500ms
   #panel@1000:toggle-class=open      → toggle “open” class, hold 1000ms
   #btn@1500!:click                   → click (no highlight), hold 1500ms
   pause@3000                         → wait 3 seconds
   #el:highlight                      → highlight with default 2000ms delay
   #input@1000:set-value=Hello        → set input value to “Hello”
   #btn@1500:click|Click me           → click with auto-positioned caption
   #btn@1500:click|^Click me          → click with caption forced to top
   #btn@1500:click|vClick me          → click with caption forced to bottom

Caption text follows the ``|`` pipe character at the end of the string.
Prefix the caption with ``^`` to force it to the **top** of the container,
or ``v`` to force it to the **bottom**. Without a prefix, the position is
chosen automatically (opposite the target element’s vertical position).


Supported actions
-----------------

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Action
     - Value
     - Description
   * - ``click``
     - —
     - Simulate a click on the target element.
   * - ``add-class``
     - class name(s)
     - Add one or more CSS classes (space-separated).
   * - ``remove-class``
     - class name(s)
     - Remove one or more CSS classes.
   * - ``toggle-class``
     - class name(s)
     - Toggle one or more CSS classes.
   * - ``set-attribute``
     - ``name:value``
     - Set an HTML attribute. Use colon to separate name and value.
   * - ``remove-attribute``
     - attr name
     - Remove an HTML attribute.
   * - ``set-value``
     - value
     - Set ``.value`` on an input/select and dispatch ``input``/``change`` events.
   * - ``set-text``
     - text
     - Set ``.textContent`` of the target.
   * - ``set-html``
     - html
     - Set ``.innerHTML`` of the target. Use with caution.
   * - ``scroll-into-view``
     - —
     - Smoothly scroll the target into view.
   * - ``dispatch-event``
     - ``eventName`` or ``eventName:detailJSON``
     - Dispatch a ``CustomEvent`` on the target.
   * - ``highlight``
     - —
     - Temporarily highlight the target (default action when no action is specified).
   * - ``pause``
     - —
     - Wait for the step's delay without performing any action.


Custom actions
--------------

Packages can register their own domain-specific actions:

.. code-block:: javascript

   WireframeDemo.registerAction('select-tab', function(step, el, contentRoot) {
       // "this" is the WireframeDemo instance
       var tabs = contentRoot.querySelectorAll('.tab');
       tabs.forEach(function(tab) {
           tab.classList.remove('active');
           if (tab.textContent.trim() === step.value) {
               tab.classList.add('active');
           }
       });
   });

The handler receives:

- ``step`` — the full step object
- ``el`` — the resolved target element (may be ``null``)
- ``contentRoot`` — the container element holding the injected HTML
- ``this`` — the ``WireframeDemo`` instance (access ``this.pause()``, ``this.play()``, etc.)


Captions (transcript overlay)
------------------------------

Each step can optionally display a **caption** — a semi-transparent text
overlay that appears at the top or bottom of the demo container, similar to
closed captions on a video. Captions are useful for narrating a demo
walkthrough.


Adding captions
^^^^^^^^^^^^^^^

**Shorthand syntax** — append ``|text`` to any step string:

.. code-block:: text

   #btn-sidebar@1800:click|Open the sidebar
   pause@2000|Wait for the animation to finish

To force the caption position, prefix the text with ``^`` (top) or ``v``
(bottom):

.. code-block:: text

   #btn-sidebar@1800:click|^This caption appears at the top
   #status-bar@1000:highlight|vThis caption appears at the bottom

**JSON object syntax** — use the ``caption`` and ``captionOptions`` fields:

.. code-block:: json

   {
     "target": "#input-search",
     "action": "set-value",
     "value": "pipeline",
     "delay": 1500,
     "caption": "Search for a pipeline",
     "captionOptions": {
       "position": "top",
       "className": "my-custom-caption"
     }
   }

``captionOptions`` fields:

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Key
     - Description
   * - ``position``
     - ``"top"``, ``"bottom"``, or ``"auto"`` (default). When ``"auto"``,
       the caption is placed opposite the target element — if the target
       is in the top half of the container the caption appears at the
       bottom, and vice versa. Steps without a target (e.g. ``pause``)
       default to the bottom.
   * - ``className``
     - An extra CSS class applied to the caption element for this step,
       allowing per-step styling.

Steps without a ``caption`` (or with an empty string) will hide any
previously visible caption.


Styling captions
^^^^^^^^^^^^^^^^

Caption appearance is controlled via CSS custom properties set on the
``[data-wireframe-demo]`` container:

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

Example:

.. code-block:: css

   [data-wireframe-demo] {
       --wfd-caption-bg: rgba(0, 0, 80, 0.85);
       --wfd-caption-font-size: 16px;
       --wfd-caption-padding: 12px 20px;
   }
