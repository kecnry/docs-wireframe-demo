Accessibility
=============

docs-wireframe-demo includes built-in support for keyboard navigation,
screen readers, and reduced-motion preferences to meet WCAG 2.1 and
Section 508 requirements.


Keyboard navigation
--------------------

When the demo container has focus, the following keyboard shortcuts are
available:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Key
     - Action
   * - :kbd:`Space` / :kbd:`Enter`
     - Toggle play / pause.
   * - :kbd:`→` (Right Arrow)
     - Step forward one step.
   * - :kbd:`←` (Left Arrow)
     - Step backward one step.
   * - :kbd:`Home`
     - Jump to the first step.
   * - :kbd:`End`
     - Jump to the last step.
   * - :kbd:`+` / :kbd:`=`
     - Increase playback speed.
   * - :kbd:`-`
     - Decrease playback speed.
   * - :kbd:`R`
     - Restart the demo from the beginning.

The container element receives ``tabindex="0"`` automatically so it is
reachable via the :kbd:`Tab` key. Keyboard input inside form controls
(``<input>``, ``<textarea>``, ``<select>``) embedded in the wireframe is
not intercepted.


Focus indicators
-----------------

All interactive controls display a visible focus ring when navigated with
the keyboard (using the ``:focus-visible`` pseudo-class). This includes:

* The play / pause / restart / speed buttons (inside the Shadow DOM)
* Timeline step dots
* Timeline tooltip buttons (step back, play, step forward)

Focus rings use the ``--wfd-control-color`` custom property (default
white) to stay consistent with the control theme.


Screen reader support
----------------------

The demo container is marked with ``role="region"`` and
``aria-label="Interactive wireframe demo"`` so that screen readers can
identify it as a landmark.

A visually-hidden ``aria-live="polite"`` region announces state changes
including:

* **Playback state**: "Playing" / "Paused at step 3 of 10"
* **Step navigation**: "Step 5 of 10" when using arrow keys or timeline
* **Speed changes**: "Speed: 2x"
* **Captions**: The full caption text of each step is announced

Timeline dots carry ``aria-label`` attributes (caption text or
"Step *N*") and the active dot receives ``aria-current="step"``.  The
timeline itself is marked as ``role="group"`` with
``aria-label="Demo steps"``.

All SVG icons inside buttons are marked ``aria-hidden="true"`` — the
containing ``<button>`` elements carry descriptive ``aria-label``
attributes instead.


Reduced motion
---------------

Animated elements respect the user's operating system preference via the
``prefers-reduced-motion: reduce`` media query. When reduced motion is
active:

* The highlight pulse animation is disabled (the outline still appears)
* Caption fade transitions are removed
* Timeline dot hover / active scaling is suppressed
* Shadow DOM button hover scaling and pulse animations are disabled
* The animated cursor **teleports** to its target instead of following a
  bezier path

You can also control this behaviour programmatically with the
``reduceMotion`` configuration option:

.. code-block:: javascript

   new WireframeDemo(container, {
       htmlSrc: 'my-wireframe.html',
       steps: [...],
       reduceMotion: 'auto'   // 'auto' | true | false
   });

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Value
     - Behaviour
   * - ``'auto'``
     - (Default) Follow the operating system's ``prefers-reduced-motion``
       setting. Responds dynamically if the user changes the preference
       while the page is open.
   * - ``true``
     - Always suppress animations, regardless of OS preference.
   * - ``false``
     - Always allow animations, regardless of OS preference.

When reduced motion is active (either via OS preference or ``true``), the
container receives the CSS class ``wfd-reduce-motion``, which you can also
target in your own stylesheets.


WCAG 2.1 conformance summary
------------------------------

.. list-table::
   :header-rows: 1
   :widths: 15 30 15 40

   * - Level
     - Criterion
     - Status
     - Notes
   * - A
     - 2.1.1 Keyboard
     - Pass
     - All controls operable via keyboard.
   * - A
     - 1.3.1 Info and Relationships
     - Pass
     - Roles, landmarks, and ARIA attributes convey structure.
   * - A
     - 4.1.2 Name, Role, Value
     - Pass
     - All buttons labelled; SVGs decorative; live region for state.
   * - AA
     - 2.4.7 Focus Visible
     - Pass
     - ``:focus-visible`` outlines on all controls.
   * - AA
     - 1.4.3 Contrast (Minimum)
     - Pass
     - Control text and icons are white on dark semi-transparent
       backgrounds; highlight outline is opaque.
   * - AAA
     - 2.3.3 Animation from Interactions
     - Pass
     - ``prefers-reduced-motion`` respected; config override available.
