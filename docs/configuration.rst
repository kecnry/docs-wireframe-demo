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
     "noHighlight": false
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


Shorthand string format
^^^^^^^^^^^^^^^^^^^^^^^

::

   target@delay:action=value

Examples:

.. code-block:: text

   #btn@1500:click                    → click #btn, hold 1500ms
   #panel@1000:toggle-class=open      → toggle "open" class, hold 1000ms
   #btn@1500!:click                   → click (no highlight), hold 1500ms
   pause@3000                         → wait 3 seconds
   #el:highlight                      → highlight with default 2000ms delay
   #input@1000:set-value=Hello        → set input value to "Hello"


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
