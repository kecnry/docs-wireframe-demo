/**
 * WireframeDemo — Generic interactive demo engine.
 *
 * Fetches arbitrary HTML, injects it into a container, overlays play/pause/restart
 * controls (inside a Shadow DOM for style isolation), and steps through a
 * configurable sequence of actions that target elements by CSS selector.
 *
 * Supports multiple independent instances on the same page.
 *
 * Usage (declarative):
 *   <div data-wireframe-demo
 *        data-wireframe-config='{"htmlSrc":"app.html","steps":[...]}'>
 *   </div>
 *
 * Usage (programmatic):
 *   const demo = new WireframeDemo(element, { htmlSrc: 'app.html', steps: [...] });
 */
(function (root) {
    'use strict';

    // Guard: if already loaded, do not re-initialise.
    if (root.WireframeDemo) { return; }

    // ── Custom action registry (shared across all instances) ────────────
    // Stored on window so scripts that load before this one (or a second
    // load of this file) share the same registry.
    var _customActions = root.__wireframeDemoActions || {};
    root.__wireframeDemoActions = _customActions;

    // ── Step parser ─────────────────────────────────────────────────────

    /**
     * Parse a single shorthand string into a step object.
     *
     * Format:  target@delay:action=value|caption text
     *   - target  : CSS selector (e.g. "#btn", ".panel")
     *   - @delay  : optional integer milliseconds (default 2000)
     *               append "!" to suppress highlight (e.g. @1500!)
     *   - :action : action name
     *   - =value  : optional value for the action
     *   - |text   : optional caption text (append ^ or v prefix to
     *               force top or bottom positioning)
     *
     * Special: if target is "pause", no selector is needed.
     */
    function parseStepString(str) {
        var delay = 2000;
        var noHighlight = false;
        var caption = undefined;
        var captionOptions = undefined;
        var working = str;

        // Extract |caption (must be done first, before @/: parsing)
        var pipeIdx = working.indexOf('|');
        if (pipeIdx !== -1) {
            var captionPart = working.substring(pipeIdx + 1);
            working = working.substring(0, pipeIdx);
            if (captionPart.length > 0) {
                var firstChar = captionPart.charAt(0);
                if (firstChar === '^') {
                    caption = captionPart.substring(1);
                    captionOptions = { position: 'top' };
                } else if (firstChar === 'v') {
                    caption = captionPart.substring(1);
                    captionOptions = { position: 'bottom' };
                } else {
                    caption = captionPart;
                }
            }
        }

        // Extract @delay
        if (working.indexOf('@') !== -1) {
            var atIdx = working.indexOf('@');
            var before = working.substring(0, atIdx);
            var after = working.substring(atIdx + 1);
            var colonIdx = after.indexOf(':');
            var delayPart, rest;
            if (colonIdx !== -1) {
                delayPart = after.substring(0, colonIdx);
                rest = after.substring(colonIdx); // includes leading ":"
            } else {
                delayPart = after;
                rest = '';
            }
            if (delayPart.endsWith('!')) {
                noHighlight = true;
                delayPart = delayPart.slice(0, -1);
            }
            delay = parseInt(delayPart, 10) || 2000;
            working = before + rest;
        }

        // Extract :action=value
        var target = null;
        var action = 'highlight';
        var value = undefined;

        if (working.indexOf(':') !== -1) {
            var ci = working.indexOf(':');
            target = working.substring(0, ci) || null;
            var actionPart = working.substring(ci + 1);
            if (actionPart.indexOf('=') !== -1) {
                var ei = actionPart.indexOf('=');
                action = actionPart.substring(0, ei);
                value = actionPart.substring(ei + 1);
            } else {
                action = actionPart;
            }
        } else {
            target = working || null;
        }

        if (target === 'pause') {
            var pauseStep = { target: null, action: 'pause', delay: delay, noHighlight: noHighlight };
            if (caption !== undefined) pauseStep.caption = caption;
            if (captionOptions) pauseStep.captionOptions = captionOptions;
            return pauseStep;
        }

        var step = { target: target, action: action, delay: delay, noHighlight: noHighlight };
        if (value !== undefined) step.value = value;
        if (caption !== undefined) step.caption = caption;
        if (captionOptions) step.captionOptions = captionOptions;
        return step;
    }

    /**
     * Normalise a mixed array of step objects and shorthand strings into
     * a uniform array of step objects.
     */
    function parseSteps(raw) {
        if (!raw || !raw.length) return [];
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var item = raw[i];
            if (typeof item === 'string') {
                out.push(parseStepString(item));
            } else if (item.actions && Array.isArray(item.actions)) {
                // Multi-action step: each sub-action has its own target/action/value
                var multi = {
                    actions: [],
                    delay: typeof item.delay === 'number' ? item.delay : 2000,
                    noHighlight: !!item.noHighlight
                };
                for (var j = 0; j < item.actions.length; j++) {
                    var sub = item.actions[j];
                    var parsed = {
                        target: sub.target || null,
                        action: sub.action || 'highlight',
                        value: sub.value
                    };
                    if (typeof sub.delay === 'number') parsed.delay = sub.delay;
                    multi.actions.push(parsed);
                }
                if (item.caption !== undefined) multi.caption = item.caption;
                if (item.captionOptions) multi.captionOptions = item.captionOptions;
                out.push(multi);
            } else {
                // Already an object — apply defaults
                var obj = {
                    target: item.target || null,
                    action: item.action || 'highlight',
                    value: item.value,
                    delay: typeof item.delay === 'number' ? item.delay : 2000,
                    noHighlight: !!item.noHighlight
                };
                if (item.caption !== undefined) obj.caption = item.caption;
                if (item.captionOptions) obj.captionOptions = item.captionOptions;
                out.push(obj);
            }
        }
        return out;
    }

    // ── Controls template (injected into Shadow DOM) ────────────────────

    // CSS custom properties (pierce Shadow DOM) for downstream theming:
    //   --wfd-control-size          Button width & height (default: 44px)
    //   --wfd-control-radius        Border-radius (default: 8px)
    //   --wfd-control-bg            Background color (default: rgba(0,0,0,0.55))
    //   --wfd-control-bg-hover      Background on hover (default: rgba(0,0,0,0.75))
    //   --wfd-control-border        Border shorthand (default: none)
    //   --wfd-control-color         Icon fill color (default: #fff)
    //   --wfd-control-icon-size     SVG icon size (default: 22px)
    //   --wfd-control-bottom        Bottom offset (default: 12px)
    //   --wfd-control-right         Right offset (default: 12px)
    //   --wfd-control-tooltip-bg    Tooltip background (default: rgba(0,0,0,0.8))
    //   --wfd-control-tooltip-color Tooltip text color (default: #fff)

    var CONTROLS_CSS = [
        ':host {',
        '  display: flex; flex-direction: column; gap: 6px;',
        '  position: absolute;',
        '  bottom: var(--wfd-control-bottom, 12px);',
        '  right: var(--wfd-control-right, 12px);',
        '  z-index: 10000;',
        '  align-items: flex-end;',
        '}',
        '@keyframes wfd-btn-pulse {',
        '  0%   { transform: scale(1); opacity: 0.5; }',
        '  100% { transform: scale(2); opacity: 0; }',
        '}',
        '.wfd-control-btn {',
        '  width: var(--wfd-control-size, 44px);',
        '  height: var(--wfd-control-size, 44px);',
        '  border-radius: var(--wfd-control-radius, 8px);',
        '  border: var(--wfd-control-border, none);',
        '  padding: 0;',
        '  background: var(--wfd-control-bg, rgba(0,0,0,0.55));',
        '  color: var(--wfd-control-color, #fff);',
        '  cursor: pointer;',
        '  display: flex; align-items: center; justify-content: center;',
        '  transition: background 0.2s, transform 0.2s;',
        '  position: relative;',
        '}',
        '.wfd-control-btn::before {',
        '  content: ""; position: absolute; inset: 0;',
        '  border-radius: inherit;',
        '  background: var(--wfd-control-color, #fff);',
        '  opacity: 0; pointer-events: none;',
        '}',
        '.wfd-control-btn--pulse::before {',
        '  animation: wfd-btn-pulse 0.5s ease-out;',
        '}',
        '.wfd-control-btn:hover {',
        '  background: var(--wfd-control-bg-hover, rgba(0,0,0,0.75));',
        '  transform: scale(1.05);',
        '}',
        '.wfd-control-btn svg {',
        '  width: var(--wfd-control-icon-size, 22px);',
        '  height: var(--wfd-control-icon-size, 22px);',
        '  fill: currentColor;',
        '}',
        '.wfd-control-btn[hidden] { display: none; }',
        '.wfd-control-btn::after {',
        '  content: attr(data-tooltip);',
        '  position: absolute; right: 100%; top: 50%;',
        '  transform: translateY(-50%);',
        '  margin-right: 8px;',
        '  background: var(--wfd-control-tooltip-bg, rgba(0,0,0,0.8));',
        '  color: var(--wfd-control-tooltip-color, #fff);',
        '  padding: 4px 10px; border-radius: 4px; font-size: 12px;',
        '  font-weight: 600; white-space: nowrap; pointer-events: none;',
        '  opacity: 0; transition: opacity 0.2s;',
        '}',
        '.wfd-control-btn:hover::after { opacity: 1; }',
        /* Speed row — just the +/- buttons, fits in button width */
        '.wfd-speed-row {',
        '  display: flex; align-items: center; gap: 4px;',
        '  width: var(--wfd-control-size, 44px);',
        '  justify-content: center;',
        '  position: relative;',
        '  opacity: 0; pointer-events: none;',
        '  transition: opacity 0.2s;',
        '}',
        ':host(:hover) .wfd-speed-row, .wfd-speed-row--visible { opacity: 1; pointer-events: auto; }',
        '.wfd-control-btn--speed {',
        '  width: 20px; height: 20px;',
        '  border-radius: var(--wfd-control-radius, 8px);',
        '  flex-shrink: 0;',
        '  position: static;',
        '}',
        '.wfd-control-btn--speed svg {',
        '  width: 14px; height: 14px;',
        '}',
        '.wfd-speed-row > .wfd-control-btn--speed::after {',
        '  display: none;',
        '}',
        '.wfd-speed-tooltip {',
        '  position: absolute; right: 100%; top: 50%;',
        '  transform: translateY(-50%);',
        '  margin-right: 8px;',
        '  background: var(--wfd-control-tooltip-bg, rgba(0,0,0,0.8));',
        '  color: var(--wfd-control-tooltip-color, #fff);',
        '  padding: 4px 10px; border-radius: 4px; font-size: 12px;',
        '  font-weight: 600; white-space: nowrap; pointer-events: none;',
        '  opacity: 0; transition: opacity 0.2s;',
        '}',
        '.wfd-speed-tooltip--visible { opacity: 1; }',
        /* Speed label below play button */
        '.wfd-speed-label {',
        '  font-size: 11px; font-weight: 600;',
        '  width: var(--wfd-control-size, 44px);',
        '  height: 16px; line-height: 16px;',
        '  text-align: center; color: var(--wfd-control-color, #fff);',
        '  background: var(--wfd-timeline-bg, rgba(0,0,0,0.5));',
        '  border-radius: var(--wfd-control-radius, 8px);',
        '  user-select: none;',
        '  opacity: 0; pointer-events: none;',
        '  transition: opacity 0.2s;',
        '}',
        ':host(:hover) .wfd-speed-label, .wfd-speed-label--visible, .wfd-speed-label--nondefault { opacity: 1; }',
        /* Focus indicators */
        '.wfd-control-btn:focus-visible {',
        '  outline: 2px solid var(--wfd-control-color, #fff);',
        '  outline-offset: 2px;',
        '}',
        '.wfd-control-btn--speed:focus-visible {',
        '  outline: 2px solid var(--wfd-control-color, #fff);',
        '  outline-offset: 1px;',
        '}',
        /* Reduced motion inside Shadow DOM */
        '@media (prefers-reduced-motion: reduce) {',
        '  .wfd-control-btn { transition: none; }',
        '  .wfd-control-btn:hover { transform: none; }',
        '  .wfd-control-btn--pulse::before { animation: none; }',
        '}'
    ].join('\n');

    // SVG icons (Material Design style, white fill via currentColor)
    var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>';
    var ICON_RESTART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.3,16.7 8.9,17.1 9.6,17.4L9,19.4C8,19 7.1,18.4 6.3,17.6Z"/></svg>';
    var ICON_STEP_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z"/></svg>';
    var ICON_STEP_FORWARD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16,18H18V6H16M6,18L14.5,12L6,6V18Z"/></svg>';

    var ICON_SPEED_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,13H5V11H19V13Z"/></svg>';
    var ICON_SPEED_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>';

    function createControlsHost(instance) {
        var host = document.createElement('div');
        host.className = 'wfd-controls-host';
        var shadow = host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent = CONTROLS_CSS;
        shadow.appendChild(style);

        // Restart button (hidden while playing, shown when paused)
        var restartBtn = document.createElement('button');
        restartBtn.className = 'wfd-control-btn wfd-control-btn--restart';
        restartBtn.setAttribute('aria-label', 'Restart demo');
        restartBtn.setAttribute('data-tooltip', 'Restart');
        restartBtn.innerHTML = ICON_RESTART;
        restartBtn.hidden = true;
        shadow.appendChild(restartBtn);

        // Speed controls row (just +/- buttons, no label)
        var speedRow = document.createElement('div');
        speedRow.className = 'wfd-speed-row';

        var speedTooltip = document.createElement('span');
        speedTooltip.className = 'wfd-speed-tooltip';

        var slowBtn = document.createElement('button');
        slowBtn.className = 'wfd-control-btn wfd-control-btn--speed';
        slowBtn.setAttribute('aria-label', 'Slow down');
        slowBtn.innerHTML = ICON_SPEED_DOWN;

        var fastBtn = document.createElement('button');
        fastBtn.className = 'wfd-control-btn wfd-control-btn--speed';
        fastBtn.setAttribute('aria-label', 'Speed up');
        fastBtn.innerHTML = ICON_SPEED_UP;

        slowBtn.addEventListener('mouseenter', function () {
            speedTooltip.textContent = 'Slower';
            speedTooltip.classList.add('wfd-speed-tooltip--visible');
        });
        slowBtn.addEventListener('mouseleave', function () {
            speedTooltip.classList.remove('wfd-speed-tooltip--visible');
        });
        fastBtn.addEventListener('mouseenter', function () {
            speedTooltip.textContent = 'Faster';
            speedTooltip.classList.add('wfd-speed-tooltip--visible');
        });
        fastBtn.addEventListener('mouseleave', function () {
            speedTooltip.classList.remove('wfd-speed-tooltip--visible');
        });

        speedRow.appendChild(speedTooltip);
        speedRow.appendChild(slowBtn);
        speedRow.appendChild(fastBtn);
        shadow.appendChild(speedRow);

        // Primary button (pause while playing, play while paused)
        var primaryBtn = document.createElement('button');
        primaryBtn.className = 'wfd-control-btn';
        primaryBtn.setAttribute('aria-label', 'Pause demo');
        primaryBtn.setAttribute('data-tooltip', 'Pause');
        primaryBtn.innerHTML = ICON_PAUSE;
        shadow.appendChild(primaryBtn);

        // Speed label below play button
        var speedLabel = document.createElement('span');
        speedLabel.className = 'wfd-speed-label';
        speedLabel.textContent = '1\u00d7';
        shadow.appendChild(speedLabel);

        primaryBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (instance._playing) {
                instance.pause();
            } else {
                instance.play();
            }
        });

        restartBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            instance.restart();
        });

        var SPEED_STEPS = [0.25, 0.5, 1, 2, 4];

        slowBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var cur = instance._speedFactor;
            for (var i = SPEED_STEPS.length - 1; i >= 0; i--) {
                if (SPEED_STEPS[i] < cur) {
                    instance._speedFactor = SPEED_STEPS[i];
                    break;
                }
            }
            speedLabel.textContent = instance._speedFactor + '\u00d7';
            slowBtn.style.visibility = instance._speedFactor <= SPEED_STEPS[0] ? 'hidden' : '';
            fastBtn.style.visibility = '';
            speedLabel.classList.toggle('wfd-speed-label--nondefault', instance._speedFactor !== 1);
            instance._announce('Speed: ' + instance._speedFactor + 'x');
        });

        fastBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var cur = instance._speedFactor;
            for (var i = 0; i < SPEED_STEPS.length; i++) {
                if (SPEED_STEPS[i] > cur) {
                    instance._speedFactor = SPEED_STEPS[i];
                    break;
                }
            }
            speedLabel.textContent = instance._speedFactor + '\u00d7';
            fastBtn.style.visibility = instance._speedFactor >= SPEED_STEPS[SPEED_STEPS.length - 1] ? 'hidden' : '';
            slowBtn.style.visibility = '';
            speedLabel.classList.toggle('wfd-speed-label--nondefault', instance._speedFactor !== 1);
            instance._announce('Speed: ' + instance._speedFactor + 'x');
        });

        instance._controlBtn = primaryBtn;
        instance._restartBtn = restartBtn;
        instance._speedRow = speedRow;
        instance._speedLabel = speedLabel;
        return host;
    }

    // ── Highlight helper (outside Shadow DOM) ───────────────────────────

    // Inject highlight keyframe animation once into the document
    var _highlightInjected = false;
    function ensureHighlightStyle() {
        if (_highlightInjected) return;
        _highlightInjected = true;
        var s = document.createElement('style');
        s.textContent = [
            '@keyframes wfd-highlight-pulse {',
            '  0%   { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.6); }',
            '  70%  { box-shadow: 0 0 0 8px rgba(255, 152, 0, 0); }',
            '  100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }',
            '}',
            '.wfd-highlight {',
            '  animation: wfd-highlight-pulse 0.8s ease-out;',
            '  outline: 2px solid rgba(255, 152, 0, 0.7);',
            '  outline-offset: 2px;',
            '  border-radius: 2px;',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ── WireframeDemo class ─────────────────────────────────────────────

    function WireframeDemo(container, config) {
        if (!(this instanceof WireframeDemo)) {
            return new WireframeDemo(container, config);
        }

        this.container = container;
        this.config = Object.assign({
            htmlSrc: null,
            steps: [],
            repeat: true,
            autoStart: true,
            pauseOnInteraction: true,
            cursor: true,
            cursorSpeed: 300,
            timeline: true,
            reduceMotion: 'auto',
            onStepStart: null,
            onStepEnd: null,
            onComplete: null
        }, config || {});

        this._steps = [];
        this._stepIndex = 0;
        this._playing = false;
        this._started = false;
        this._timer = null;
        this._controlBtn = null;
        this._restartBtn = null;
        this._observer = null;
        this._highlightedEls = [];
        this._contentRoot = null; // the element holding fetched HTML
        this._cursorEl = null;
        this._cursorX = 0;
        this._cursorY = 0;
        this._captionEl = null;
        this._captionClass = null; // tracks custom className for removal
        this._speedFactor = 1;
        this._timelineEl = null;
        this._timelineDots = [];
        this._tooltipEl = null;
        this._tooltipBackBtn = null;
        this._tooltipPlayBtn = null;
        this._tooltipFwdBtn = null;
        this._tooltipDotIndex = -1;
        this._tooltipDotEl = null;
        this._tooltipActivated = false;
        this._tooltipHideTimer = null;
        this._htmlSnapshots = [];
        this._timelineHovering = false;
        this._timelineLeaveTimer = null;
        this._liveRegion = null;
        this._reduceMotion = false;
        this._userPaused = false;
        this._restartOverlay = null;

        this._init();
    }

    WireframeDemo.prototype._init = function () {
        var self = this;
        var container = this.container;

        // Mark initialised to prevent double-init
        container.setAttribute('data-wireframe-initialized', 'true');

        // ── Accessibility setup ─────────────────────────────────────────
        if (!container.getAttribute('tabindex')) {
            container.setAttribute('tabindex', '0');
        }
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Interactive wireframe demo');

        // Reduced motion preference
        this._reduceMotion = this._shouldReduceMotion();
        if (this._reduceMotion) {
            container.classList.add('wfd-reduce-motion');
        }
        if (typeof window.matchMedia === 'function') {
            var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (mql.addEventListener) {
                mql.addEventListener('change', function () {
                    self._reduceMotion = self._shouldReduceMotion();
                    if (self._reduceMotion) {
                        container.classList.add('wfd-reduce-motion');
                    } else {
                        container.classList.remove('wfd-reduce-motion');
                    }
                });
            }
        }

        // Screen reader live region
        this._createLiveRegion();

        // Keyboard navigation
        container.addEventListener('keydown', function (e) {
            self._handleKeydown(e);
        });

        // Ensure container is positioned so the controls overlay works
        var pos = window.getComputedStyle(container).position;
        if (pos === 'static') {
            container.style.position = 'relative';
        }

        // Parse steps
        this._steps = parseSteps(this.config.steps);
        this._initSteps = parseSteps(this.config.initSteps);

        // Inject highlight style
        ensureHighlightStyle();

        // Create content root (where fetched HTML goes)
        this._contentRoot = document.createElement('div');
        this._contentRoot.className = 'wfd-content';
        container.appendChild(this._contentRoot);

        // Create controls overlay (Shadow DOM)
        var controlsHost = createControlsHost(this);
        container.appendChild(controlsHost);

        // Create animated cursor if enabled
        if (this.config.cursor) {
            this._createCursor();
        }

        // Create caption overlay
        this._createCaption();

        // Create timeline overlay (after caption, before pauseOnInteraction)
        this._createTimeline();

        // Create restart indicator overlay
        this._createRestartOverlay();

        // Pause on user interaction
        if (this.config.pauseOnInteraction) {
            container.addEventListener('click', function (e) {
                if (!e.isTrusted) return;
                // Ignore clicks on the controls host, timeline, or tooltip
                if (e.target.closest && e.target.closest('.wfd-controls-host')) return;
                if (e.target.closest && e.target.closest('.wfd-timeline')) return;
                if (e.target.closest && e.target.closest('.wfd-timeline-tooltip')) return;
                if (self._playing) {
                    self._userPaused = true;
                    self._hideCursor();
                    self.pause();
                }
            }, true); // capture phase
        }

        // Load HTML then start
        if (this.config.htmlSrc) {
            this._loadHTML(this.config.htmlSrc, function () {
                self._onReady();
            });
        } else {
            // No htmlSrc — use existing container children as inline content.
            // Move any children that were in the container before _init into
            // _contentRoot so selectors, restart-reset, and controls all work.
            var existingNodes = [];
            while (container.firstChild && container.firstChild !== this._contentRoot) {
                existingNodes.push(container.removeChild(container.firstChild));
            }
            for (var i = 0; i < existingNodes.length; i++) {
                this._contentRoot.appendChild(existingNodes[i]);
            }
            // Save initial HTML for restart/repeat reset
            this._initialHTML = this._contentRoot.innerHTML;
            self._runInitSteps(function () {
                self._initialHTML = self._contentRoot.innerHTML;
                self._onReady();
            });
        }
    };

    WireframeDemo.prototype._loadHTML = function (src, callback) {
        var self = this;
        fetch(src)
            .then(function (resp) {
                if (!resp.ok) throw new Error('Failed to load ' + src + ': ' + resp.status);
                return resp.text();
            })
            .then(function (html) {
                self._contentRoot.innerHTML = html;
                // Dispatch event so external code can react (sets up toolbar handlers, etc.)
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: self.container, instance: self }
                }));
                // Run init steps silently, then snapshot the post-init state as the restart baseline
                self._runInitSteps(function () {
                    self._initialHTML = self._contentRoot.innerHTML;
                    if (callback) callback();
                });
            })
            .catch(function (err) {
                console.error('[WireframeDemo] ' + err.message);
                self._contentRoot.innerHTML =
                    '<p style="color:red;padding:16px;">Error loading demo HTML: ' + err.message + '</p>';
            });
    };

    /**
     * Run initSteps synchronously (no delay, no highlight, no caption).
     * Called after HTML loads and wireframe-demo-loaded has fired, before
     * _initialHTML is snapshotted and before _onReady()/autoStart.
     */
    WireframeDemo.prototype._runInitSteps = function (done) {
        var steps = this._initSteps || [];
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            // Force noHighlight so actions skip visual highlighting
            var initStep = {};
            for (var k in step) { if (Object.prototype.hasOwnProperty.call(step, k)) initStep[k] = step[k]; }
            initStep.noHighlight = true;
            initStep.delay = 0;
            var target = step.target || (step.actions && step.actions.length ? step.actions[0].target : null);
            var el = null;
            if (target) {
                el = this._contentRoot.querySelector(target) || this.container.querySelector(target);
            }
            // Pass null callback so _executeAction runs synchronously (no sub-action timeouts)
            this._executeAction(initStep, el, null);
        }
        if (done) done();
    };

    WireframeDemo.prototype._onReady = function () {
        if (!this.config.autoStart || !this._steps.length) return;
        this._waitForVisible();
    };

    // ── Viewport gating via IntersectionObserver ────────────────────────

    WireframeDemo.prototype._waitForVisible = function () {
        var self = this;
        if (typeof IntersectionObserver === 'undefined') {
            // Fallback: start immediately
            this.play();
            return;
        }
        this._observer = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.5) {
                    self._observer.disconnect();
                    self._observer = null;
                    self.play();
                    break;
                }
            }
        }, { threshold: [0.5] });
        this._observer.observe(this.container);
    };

    // ── Accessibility helpers ───────────────────────────────────────────

    WireframeDemo.prototype._shouldReduceMotion = function () {
        var cfg = this.config.reduceMotion;
        if (cfg === true) return true;
        if (cfg === false) return false;
        // 'auto' or undefined — honour OS preference
        if (typeof window.matchMedia === 'function') {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }
        return false;
    };

    WireframeDemo.prototype._createLiveRegion = function () {
        var el = document.createElement('div');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');
        el.className = 'wfd-sr-only';
        el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;'
            + 'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
        this.container.appendChild(el);
        this._liveRegion = el;
    };

    WireframeDemo.prototype._announce = function (message) {
        if (!this._liveRegion) return;
        var region = this._liveRegion;
        region.textContent = '';
        setTimeout(function () { region.textContent = message; }, 50);
    };

    WireframeDemo.prototype._handleKeydown = function (e) {
        // Don't intercept when focus is on form controls inside the demo
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
            return;
        }

        var handled = true;
        switch (e.key) {
            case ' ':
            case 'Enter':
                if (this._playing) { this.pause(); } else { this.play(); }
                break;
            case 'ArrowRight':
                if (this._stepIndex < this._steps.length - 1) {
                    this.jumpToStep(this._stepIndex + 1);
                    this._announce('Step ' + (this._stepIndex + 1) + ' of ' + this._steps.length);
                }
                break;
            case 'ArrowLeft':
                if (this._stepIndex > 0) {
                    this.jumpToStep(this._stepIndex - 1);
                    this._announce('Step ' + (this._stepIndex + 1) + ' of ' + this._steps.length);
                }
                break;
            case 'Home':
                this.jumpToStep(0);
                this._announce('Step 1 of ' + this._steps.length);
                break;
            case 'End':
                this.jumpToStep(this._steps.length - 1);
                this._announce('Step ' + this._steps.length + ' of ' + this._steps.length);
                break;
            case '+':
            case '=':
                this._adjustSpeed(1);
                break;
            case '-':
            case '_':
                this._adjustSpeed(-1);
                break;
            case 'r':
            case 'R':
                this.restart();
                break;
            default:
                handled = false;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    WireframeDemo.prototype._adjustSpeed = function (direction) {
        var SPEED_STEPS = [0.25, 0.5, 1, 2, 4];
        var cur = this._speedFactor;
        var newSpeed = cur;
        var i;
        if (direction > 0) {
            for (i = 0; i < SPEED_STEPS.length; i++) {
                if (SPEED_STEPS[i] > cur) { newSpeed = SPEED_STEPS[i]; break; }
            }
        } else {
            for (i = SPEED_STEPS.length - 1; i >= 0; i--) {
                if (SPEED_STEPS[i] < cur) { newSpeed = SPEED_STEPS[i]; break; }
            }
        }
        if (newSpeed !== cur) {
            this._speedFactor = newSpeed;
            if (this._speedLabel) {
                this._speedLabel.textContent = newSpeed + '\u00d7';
                this._speedLabel.classList.toggle('wfd-speed-label--nondefault', newSpeed !== 1);
            }
            this._announce('Speed: ' + newSpeed + 'x');
        }
    };

    // ── Playback controls ───────────────────────────────────────────────

    WireframeDemo.prototype.play = function () {
        if (this._playing) return;
        this._playing = true;
        this._started = true;
        this._userPaused = false;
        this._updateControlBtn();
        this._updateTooltip();
        this._announce('Playing');
        this._runStep();
    };

    WireframeDemo.prototype.pause = function () {
        if (!this._playing) return;
        this._playing = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._updateControlBtn(true);
        this._updateTooltip();
        this._announce('Paused at step ' + (this._stepIndex + 1) + ' of ' + this._steps.length);
    };

    WireframeDemo.prototype.restart = function () {
        this._userPaused = false;
        this.pause();
        this._showRestartOverlay();
        this._clearHighlights();
        this._hideCaption();
        this._resetCursor();
        this._stepIndex = 0;
        this._htmlSnapshots = [];

        // Restore the content DOM to its initial state so the demo
        // starts fresh (removes dynamically added viewers, sidebars, etc.)
        if (this._initialHTML !== undefined) {
            this._contentRoot.innerHTML = this._initialHTML;
            // Re-dispatch so external code (e.g. jdaviz-wireframe-actions)
            // can re-wire toolbar clicks, icons, etc.
            document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                detail: { container: this.container, instance: this }
            }));
        }

        this._updateTimelineDots();
        this.play();
    };

    WireframeDemo.prototype._updateControlBtn = function (pulse) {
        var btn = this._controlBtn;
        var restartBtn = this._restartBtn;
        if (!btn) return;
        if (this._playing) {
            btn.innerHTML = ICON_PAUSE;
            btn.setAttribute('aria-label', 'Pause demo');
            btn.setAttribute('data-tooltip', 'Pause');
            btn.classList.remove('wfd-control-btn--pulse');
            if (restartBtn) restartBtn.hidden = true;
            if (this._speedRow) this._speedRow.classList.remove('wfd-speed-row--visible');
            if (this._speedLabel) this._speedLabel.classList.remove('wfd-speed-label--visible');
        } else {
            btn.innerHTML = ICON_PLAY;
            btn.setAttribute('aria-label', 'Play demo');
            btn.setAttribute('data-tooltip', 'Play');
            if (restartBtn) restartBtn.hidden = false;
            if (this._speedRow) this._speedRow.classList.add('wfd-speed-row--visible');
            if (this._speedLabel) this._speedLabel.classList.add('wfd-speed-label--visible');
            if (pulse) {
                btn.classList.remove('wfd-control-btn--pulse');
                void btn.offsetWidth;
                btn.classList.add('wfd-control-btn--pulse');
            }
        }
    };

    // ── Animated cursor ─────────────────────────────────────────────────

    var CURSOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">'
        + '<path d="M5 3l14 8-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>'
        + '</svg>';

    WireframeDemo.prototype._createCursor = function () {
        var el = document.createElement('div');
        el.className = 'wfd-cursor';
        el.innerHTML = CURSOR_SVG;
        el.style.cssText = 'position:absolute;z-index:9999;pointer-events:none;'
            + 'top:0;left:0;width:20px;height:20px;opacity:0;'
            + 'transition:opacity 150ms ease;';
        this.container.appendChild(el);
        this._cursorEl = el;
        this._cursorAnim = null; // rAF id for in-flight animation
        var rect = this.container.getBoundingClientRect();
        this._cursorX = rect.width / 2;
        this._cursorY = rect.height / 2;
        el.style.transform = 'translate(' + this._cursorX + 'px,' + this._cursorY + 'px)';
    };

    // Ease-out cubic: fast departure, gentle arrival (like a real hand)
    function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    WireframeDemo.prototype._moveCursorTo = function (el, callback) {
        if (!this._cursorEl || !el) {
            if (callback) callback();
            return;
        }
        // Cancel any in-flight animation
        if (this._cursorAnim) {
            cancelAnimationFrame(this._cursorAnim);
            this._cursorAnim = null;
        }

        var containerRect = this.container.getBoundingClientRect();
        var elRect = el.getBoundingClientRect();
        var endX = (elRect.left - containerRect.left) + elRect.width / 2;
        var endY = (elRect.top - containerRect.top) + elRect.height / 2;

        // Reduced motion: teleport cursor without animation
        if (this._reduceMotion) {
            this._cursorX = endX;
            this._cursorY = endY;
            this._cursorEl.style.transform = 'translate(' + endX + 'px,' + endY + 'px)';
            this._cursorEl.style.opacity = '1';
            if (callback) callback();
            return;
        }

        var startX = this._cursorX;
        var startY = this._cursorY;

        // Quadratic bezier control point: offset perpendicular to the
        // direct line, creating a slight arc like a natural hand movement.
        var dx = endX - startX;
        var dy = endY - startY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        // Arc intensity scales with distance (capped), direction alternates
        var arcAmount = Math.min(dist * 0.15, 40);
        // Perpendicular direction (rotate 90°); alternate sign each step
        // so consecutive moves curve in different directions.
        this._cursorArcSign = -(this._cursorArcSign || 1);
        var perpX = -dy / (dist || 1) * arcAmount * this._cursorArcSign;
        var perpY =  dx / (dist || 1) * arcAmount * this._cursorArcSign;
        var cpX = (startX + endX) / 2 + perpX;
        var cpY = (startY + endY) / 2 + perpY;

        this._cursorEl.style.opacity = '1';

        var cursorEl = this._cursorEl;
        var self = this;
        var duration = this.config.cursorSpeed / this._speedFactor;
        var startTime = null;

        function tick(now) {
            if (!startTime) startTime = now;
            var elapsed = now - startTime;
            var t = Math.min(elapsed / duration, 1);
            var e = _easeOutCubic(t);

            // Quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·CP + t²·P1
            var inv = 1 - e;
            var x = inv * inv * startX + 2 * inv * e * cpX + e * e * endX;
            var y = inv * inv * startY + 2 * inv * e * cpY + e * e * endY;

            cursorEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';

            if (t < 1) {
                self._cursorAnim = requestAnimationFrame(tick);
            } else {
                self._cursorAnim = null;
                self._cursorX = endX;
                self._cursorY = endY;
                if (callback) callback();
            }
        }

        this._cursorAnim = requestAnimationFrame(tick);
    };

    WireframeDemo.prototype._hideCursor = function () {
        if (this._cursorEl) {
            this._cursorEl.style.opacity = '0';
        }
    };

    WireframeDemo.prototype._resetCursor = function () {
        if (!this._cursorEl) return;
        if (this._cursorAnim) {
            cancelAnimationFrame(this._cursorAnim);
            this._cursorAnim = null;
        }
        var rect = this.container.getBoundingClientRect();
        this._cursorX = rect.width / 2;
        this._cursorY = rect.height / 2;
        this._cursorEl.style.transform = 'translate(' + this._cursorX + 'px,' + this._cursorY + 'px)';
        this._cursorEl.style.opacity = '0';
    };

    // ── Restart overlay ──────────────────────────────────────────────────────

    WireframeDemo.prototype._createRestartOverlay = function () {
        var el = document.createElement('div');
        el.className = 'wfd-restart-overlay';
        var iconWrap = document.createElement('div');
        iconWrap.className = 'wfd-restart-overlay__icon';
        iconWrap.innerHTML = ICON_RESTART;
        el.appendChild(iconWrap);
        this.container.appendChild(el);
        this._restartOverlay = el;
    };

    WireframeDemo.prototype._showRestartOverlay = function () {
        if (!this._restartOverlay || this._reduceMotion) return;
        var overlay = this._restartOverlay;
        overlay.classList.remove('wfd-restart-overlay--active');
        void overlay.offsetWidth;
        overlay.classList.add('wfd-restart-overlay--active');
    };

    // ── Caption overlay ───────────────────────────────────────────────────────

    WireframeDemo.prototype._createCaption = function () {
        var el = document.createElement('div');
        el.className = 'wfd-caption';
        this.container.appendChild(el);
        this._captionEl = el;
    };

    WireframeDemo.prototype._showCaption = function (step, el) {
        var captionEl = this._captionEl;
        if (!captionEl) return;

        // Don't override caption while user is hovering a timeline dot
        if (this._timelineHovering) return;

        // Remove previous custom class
        if (this._captionClass) {
            captionEl.classList.remove(this._captionClass);
            this._captionClass = null;
        }

        // If no caption on this step, hide and return
        if (!step.caption) {
            this._hideCaption();
            return;
        }

        // Determine position: explicit override or auto
        var opts = step.captionOptions || {};
        var position = opts.position || 'auto';

        if (position === 'auto') {
            if (el) {
                var containerRect = this.container.getBoundingClientRect();
                var elRect = el.getBoundingClientRect();
                var elMidY = (elRect.top + elRect.height / 2) - containerRect.top;
                var containerH = containerRect.height;
                // Target in top half → caption at bottom; target in bottom half → caption at top
                position = (elMidY < containerH / 2) ? 'bottom' : 'top';
            } else {
                position = 'bottom';
            }
        }

        // Apply position class
        captionEl.classList.remove('wfd-caption--top', 'wfd-caption--bottom');
        captionEl.classList.add(position === 'top' ? 'wfd-caption--top' : 'wfd-caption--bottom');

        // Apply optional custom class
        if (opts.className) {
            captionEl.classList.add(opts.className);
            this._captionClass = opts.className;
        }

        // Set text (textContent for XSS safety)
        captionEl.textContent = step.caption;

        // Show
        captionEl.classList.add('wfd-caption--visible');

        // Announce for screen readers
        this._announce(step.caption);
    };

    WireframeDemo.prototype._hideCaption = function () {
        if (!this._captionEl) return;
        this._captionEl.classList.remove('wfd-caption--visible');
    };

    WireframeDemo.prototype._showCaptionForStep = function (stepIndex) {
        if (!this._captionEl) return;
        var step = this._steps[stepIndex];
        if (step && step.caption) {
            this._captionEl.classList.remove('wfd-caption--top', 'wfd-caption--bottom');
            this._captionEl.classList.add('wfd-caption--bottom');
            this._captionEl.textContent = step.caption;
            this._captionEl.classList.add('wfd-caption--visible');
        } else {
            this._hideCaption();
        }
    };

    // ── Timeline overlay ────────────────────────────────────────────────

    WireframeDemo.prototype._createTimeline = function () {
        if (this.config.timeline === false) return;
        if (this._steps.length <= 1) return;

        var self = this;
        var el = document.createElement('div');
        el.className = 'wfd-timeline';
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Demo steps');
        this._timelineDots = [];

        for (var i = 0; i < this._steps.length; i++) {
            var dot = document.createElement('button');
            dot.className = 'wfd-timeline__dot';
            dot.setAttribute('data-step-index', String(i));
            if (this._steps[i].caption) {
                dot.setAttribute('data-caption', this._steps[i].caption);
            }
            dot.setAttribute('aria-label', this._steps[i].caption || ('Step ' + (i + 1)));
            this._timelineDots.push(dot);
            el.appendChild(dot);
        }

        // ── Dot hover tooltip with mini playback controls ───────────
        var tooltip = document.createElement('div');
        tooltip.className = 'wfd-timeline-tooltip';

        var ttBack = document.createElement('button');
        ttBack.className = 'wfd-timeline-tooltip__btn';
        ttBack.setAttribute('aria-label', 'Step back');
        ttBack.innerHTML = ICON_STEP_BACK;

        var ttPlay = document.createElement('button');
        ttPlay.className = 'wfd-timeline-tooltip__btn wfd-timeline-tooltip__btn--play';
        ttPlay.setAttribute('aria-label', 'Play from here');
        ttPlay.innerHTML = ICON_PLAY;

        var ttForward = document.createElement('button');
        ttForward.className = 'wfd-timeline-tooltip__btn';
        ttForward.setAttribute('aria-label', 'Step forward');
        ttForward.innerHTML = ICON_STEP_FORWARD;

        tooltip.appendChild(ttBack);
        tooltip.appendChild(ttPlay);
        tooltip.appendChild(ttForward);
        this.container.appendChild(tooltip);
        this._tooltipEl = tooltip;
        this._tooltipBackBtn = ttBack;
        this._tooltipPlayBtn = ttPlay;
        this._tooltipFwdBtn = ttForward;

        // ── Tooltip button handlers ─────────────────────────────────
        // After any click, the tooltip becomes "activated" and all
        // subsequent actions track _stepIndex (the real playback
        // position) instead of the originally-hovered dot.

        ttBack.addEventListener('click', function (e) {
            e.stopPropagation();
            var refIdx = self._tooltipActivated ? self._stepIndex : self._tooltipDotIndex;
            self._tooltipActivated = true;
            if (refIdx > 0) {
                self.jumpToStep(refIdx - 1);
            }
            self._showCaptionForStep(self._stepIndex);
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        ttPlay.addEventListener('click', function (e) {
            e.stopPropagation();
            var wasActivated = self._tooltipActivated;
            self._tooltipActivated = true;
            if (self._playing) {
                // First pause click from a hovered dot: jump there first
                if (!wasActivated && self._tooltipDotIndex >= 0 &&
                    self._tooltipDotIndex !== self._stepIndex) {
                    self.jumpToStep(self._tooltipDotIndex);
                }
                self.pause();
            } else {
                // First play click from a hovered dot: jump there first
                if (!wasActivated && self._tooltipDotIndex >= 0 &&
                    self._tooltipDotIndex !== self._stepIndex) {
                    self.jumpToStep(self._tooltipDotIndex);
                }
                self.play();
            }
            self._showCaptionForStep(self._stepIndex);
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        ttForward.addEventListener('click', function (e) {
            e.stopPropagation();
            var refIdx = self._tooltipActivated ? self._stepIndex : self._tooltipDotIndex;
            self._tooltipActivated = true;
            if (refIdx < self._steps.length - 1) {
                self.jumpToStep(refIdx + 1);
            }
            self._showCaptionForStep(self._stepIndex);
            // Update buttons in place — do NOT reposition
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        // Prevent tooltip clicks from bubbling to pauseOnInteraction
        tooltip.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        // Click-to-jump (event delegation on dots)
        el.addEventListener('click', function (e) {
            e.stopPropagation(); // prevent pauseOnInteraction
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            var idx = parseInt(dotEl.getAttribute('data-step-index'), 10);
            if (isNaN(idx)) return;
            self.jumpToStep(idx);
            self._tooltipActivated = true;
            self._showCaptionForStep(self._stepIndex);
            self._updateTooltipButtons();
            self._repositionTooltip();
        });

        // Dot hover → show tooltip + caption preview
        el.addEventListener('mouseenter', function (e) {
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            self._cancelTooltipHide();
            self._timelineHovering = true;
            var idx = parseInt(dotEl.getAttribute('data-step-index'), 10);
            if (!isNaN(idx)) {
                // Fresh hover: reset activated state
                self._tooltipActivated = false;
                self._showTooltipAtDot(dotEl, idx);
            }
            var captionText = dotEl.getAttribute('data-caption');
            if (captionText && self._captionEl) {
                self._captionEl.classList.remove('wfd-caption--top', 'wfd-caption--bottom');
                self._captionEl.classList.add('wfd-caption--bottom');
                self._captionEl.textContent = captionText;
                self._captionEl.classList.add('wfd-caption--visible');
            } else {
                self._hideCaption();
            }
        }, true);

        el.addEventListener('mouseleave', function (e) {
            var dotEl = e.target.closest ? e.target.closest('.wfd-timeline__dot') : null;
            if (!dotEl) return;
            self._scheduleTooltipHide();
        }, true);

        // Keep tooltip open while mouse is over it
        tooltip.addEventListener('mouseenter', function () {
            self._cancelTooltipHide();
        });

        // Hide tooltip when mouse leaves it
        tooltip.addEventListener('mouseleave', function (e) {
            var related = e.relatedTarget;
            if (related && related.closest && related.closest('.wfd-timeline__dot')) {
                return;
            }
            self._scheduleTooltipHide();
        });

        // Container hover → show/hide timeline
        this.container.addEventListener('mouseenter', function () {
            if (self._timelineLeaveTimer) {
                clearTimeout(self._timelineLeaveTimer);
                self._timelineLeaveTimer = null;
            }
            if (self._userPaused) return;
            if (self._timelineEl) {
                self._timelineEl.classList.add('wfd-timeline--visible');
            }
            if (self._captionEl) {
                self._captionEl.classList.add('wfd-caption--timeline-visible');
            }
        });

        this.container.addEventListener('mouseleave', function () {
            self._timelineLeaveTimer = setTimeout(function () {
                self._timelineLeaveTimer = null;
                if (self._timelineEl) {
                    self._timelineEl.classList.remove('wfd-timeline--visible');
                }
                if (self._captionEl) {
                    self._captionEl.classList.remove('wfd-caption--timeline-visible');
                }
                self._timelineHovering = false;
                self._hideTooltip();
            }, 150);
        });

        this.container.appendChild(el);
        this._timelineEl = el;
        this._updateTimelineDots();
    };

    // ── Tooltip helpers ────────────────────────────────────────────────

    /**
     * Show the tooltip centered above a specific dot.
     * Called on fresh dot hover (before any button click).
     */
    WireframeDemo.prototype._showTooltipAtDot = function (dotEl, stepIndex) {
        var tooltip = this._tooltipEl;
        if (!tooltip) return;
        this._tooltipDotIndex = stepIndex;
        this._tooltipDotEl = dotEl;

        this._updateTooltipButtons();
        tooltip.classList.add('wfd-timeline-tooltip--visible');
        this._repositionTooltip();
    };

    /**
     * After a button click, re-anchor the tooltip to the current step.
     */
    WireframeDemo.prototype._anchorTooltipToCurrentStep = function () {
        var idx = this._stepIndex;
        var dotEl = this._timelineDots[idx];
        if (dotEl) {
            this._tooltipDotIndex = idx;
            this._tooltipDotEl = dotEl;
        }
        this._updateTooltipButtons();
        this._repositionTooltip();
    };

    WireframeDemo.prototype._updateTooltipButtons = function () {
        if (!this._tooltipPlayBtn) return;

        // Play/pause icon
        if (this._playing) {
            this._tooltipPlayBtn.innerHTML = ICON_PAUSE;
            this._tooltipPlayBtn.setAttribute('aria-label', 'Pause');
        } else {
            this._tooltipPlayBtn.innerHTML = ICON_PLAY;
            this._tooltipPlayBtn.setAttribute('aria-label', 'Play');
        }

        // Step buttons: visible only when paused
        var showStepBtns = !this._playing;
        // When activated (user has clicked), use _stepIndex for bounds;
        // otherwise use the hovered dot index
        var refIdx = this._tooltipActivated ? this._stepIndex : this._tooltipDotIndex;

        if (this._tooltipBackBtn) {
            this._tooltipBackBtn.hidden = !showStepBtns;
            // Keep spacer so tooltip width stays constant
            this._tooltipBackBtn.style.visibility = (showStepBtns && refIdx <= 0) ? 'hidden' : '';
        }
        if (this._tooltipFwdBtn) {
            this._tooltipFwdBtn.hidden = !showStepBtns;
            this._tooltipFwdBtn.style.visibility = (showStepBtns && refIdx >= this._steps.length - 1) ? 'hidden' : '';
        }
    };

    WireframeDemo.prototype._repositionTooltip = function () {
        var tooltip = this._tooltipEl;
        var dotEl = this._tooltipDotEl;
        if (!tooltip || !dotEl) return;

        var containerRect = this.container.getBoundingClientRect();
        var dotRect = dotEl.getBoundingClientRect();
        var tooltipWidth = tooltip.offsetWidth;
        var left = (dotRect.left - containerRect.left) + (dotRect.width / 2) - (tooltipWidth / 2);
        var bottom = containerRect.bottom - dotRect.top + 2;

        left = Math.max(4, Math.min(left, containerRect.width - tooltipWidth - 4));

        tooltip.style.left = left + 'px';
        tooltip.style.bottom = bottom + 'px';
    };

    /**
     * Called from play()/pause() to keep tooltip in sync with playback state.
     * Updates button icons/visibility in place without moving the tooltip.
     */
    WireframeDemo.prototype._updateTooltip = function () {
        if (!this._tooltipEl || this._tooltipDotIndex < 0) return;
        this._updateTooltipButtons();
        this._repositionTooltip(); // re-measure in case button count changed tooltip width
    };

    WireframeDemo.prototype._hideTooltip = function () {
        if (!this._tooltipEl) return;
        this._tooltipEl.classList.remove('wfd-timeline-tooltip--visible');
        this._tooltipDotIndex = -1;
        this._tooltipDotEl = null;
        this._tooltipActivated = false;
    };

    WireframeDemo.prototype._scheduleTooltipHide = function () {
        var self = this;
        this._cancelTooltipHide();
        this._tooltipHideTimer = setTimeout(function () {
            self._tooltipHideTimer = null;
            self._timelineHovering = false;
            self._hideTooltip();
            // Restore the current step's caption
            if (self._playing && self._stepIndex < self._steps.length) {
                var currentStep = self._steps[self._stepIndex];
                if (currentStep.caption) {
                    self._showCaption(currentStep, null);
                } else {
                    self._hideCaption();
                }
            } else {
                self._hideCaption();
            }
        }, 120);
    };

    WireframeDemo.prototype._cancelTooltipHide = function () {
        if (this._tooltipHideTimer) {
            clearTimeout(this._tooltipHideTimer);
            this._tooltipHideTimer = null;
        }
    };

    WireframeDemo.prototype._updateTimelineDots = function () {
        if (!this._timelineDots.length) return;
        for (var i = 0; i < this._timelineDots.length; i++) {
            var dot = this._timelineDots[i];
            if (i <= this._stepIndex) {
                dot.classList.add('wfd-timeline__dot--filled');
            } else {
                dot.classList.remove('wfd-timeline__dot--filled');
            }
            if (i === this._stepIndex) {
                dot.classList.add('wfd-timeline__dot--current');
                dot.setAttribute('aria-current', 'step');
            } else {
                dot.classList.remove('wfd-timeline__dot--current');
                dot.removeAttribute('aria-current');
            }
        }
    };

    // ── Jump to step (for timeline click navigation) ────────────────────

    /**
     * Restore the DOM to the state just before `targetIndex`, set
     * _stepIndex there, then visually play that step (cursor, caption,
     * highlight) so the user sees what that step does.
     */
    WireframeDemo.prototype.jumpToStep = function (targetIndex) {
        if (targetIndex < 0 || targetIndex >= this._steps.length) return;
        if (targetIndex === this._stepIndex && !this._playing) return;

        // Stop current timer/animation
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        if (this._cursorAnim) {
            cancelAnimationFrame(this._cursorAnim);
            this._cursorAnim = null;
        }
        this._playing = false;

        this._clearHighlights();
        this._hideCaption();
        if (this._cursorEl) this._hideCursor();

        // ── Restore DOM to the state *before* targetIndex ───────────
        this._restoreDOMBeforeStep(targetIndex);
        this._stepIndex = targetIndex;

        this._updateTimelineDots();

        // ── Now play the target step visually ───────────────────────
        var self = this;
        this._playing = true;
        this._updateControlBtn();

        var step = this._steps[targetIndex];

        // Snapshot HTML state before this step (for future jumps)
        if (this.config.timeline !== false && !this._htmlSnapshots[targetIndex]) {
            this._htmlSnapshots[targetIndex] = this._contentRoot.innerHTML;
        }

        // Resolve target element
        var el = null;
        var stepTarget = step.target || (step.actions && step.actions.length > 0 ? step.actions[0].target : null);
        if (stepTarget) {
            el = this._contentRoot.querySelector(stepTarget) ||
                 this.container.querySelector(stepTarget);
        }

        // Show caption
        this._showCaption(step, el);

        var baseDelay = typeof step.delay === 'number' ? step.delay : 2000;
        var delay = baseDelay / this._speedFactor;

        var afterAction = function (cursorOverhead) {
            cursorOverhead = cursorOverhead || 0;
            if (!self._playing) return;
            if (self.config.onStepEnd) {
                self.config.onStepEnd(self._stepIndex, step);
            }
            self._stepIndex++;
            // Pause after the step plays (don't auto-advance)
            self._playing = false;
            self._updateControlBtn(true);
            self._updateTooltip();
        };

        // Animate cursor, then execute action
        if (this.config.cursor && el) {
            var cursorSpeed = this.config.cursorSpeed / this._speedFactor;
            this._moveCursorTo(el, function () {
                if (!self._playing) return;
                self._executeAction(step, el, function () {
                    afterAction(cursorSpeed);
                });
            });
        } else {
            if (this.config.cursor && !step.actions && step.action === 'pause') {
                this._hideCursor();
            }
            this._executeAction(step, el, function () {
                afterAction(0);
            });
        }
    };

    /**
     * Restore the content DOM to the state just before the given step
     * index by using cached snapshots or replaying from initial HTML.
     */
    WireframeDemo.prototype._restoreDOMBeforeStep = function (targetIndex) {
        if (this._htmlSnapshots[targetIndex]) {
            // Direct snapshot exists for this step — use it
            this._contentRoot.innerHTML = this._htmlSnapshots[targetIndex];
            document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                detail: { container: this.container, instance: this }
            }));
        } else {
            // Find the latest snapshot at or before targetIndex
            var restoreFrom = -1;
            for (var k = targetIndex - 1; k >= 0; k--) {
                if (this._htmlSnapshots[k]) {
                    restoreFrom = k;
                    break;
                }
            }
            if (restoreFrom >= 0) {
                this._contentRoot.innerHTML = this._htmlSnapshots[restoreFrom];
            } else if (this._initialHTML !== undefined) {
                this._contentRoot.innerHTML = this._initialHTML;
            }
            document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                detail: { container: this.container, instance: this }
            }));
            // Replay steps from restoreFrom (or 0) up to targetIndex-1
            // Skip highlight-only steps since they don't change DOM state
            var start = restoreFrom >= 0 ? restoreFrom : 0;
            for (var j = start; j < targetIndex; j++) {
                var s = this._steps[j];
                // Skip pure highlight steps during fast-forward replay
                var skipStep = false;
                if (s.actions && Array.isArray(s.actions)) {
                    skipStep = s.actions.every(function (sub) {
                        return sub.action === 'highlight';
                    });
                } else {
                    skipStep = (!s.action || s.action === 'highlight' || s.action === 'pause');
                }
                if (skipStep) continue;
                if (this.config.timeline !== false && !this._htmlSnapshots[j]) {
                    this._htmlSnapshots[j] = this._contentRoot.innerHTML;
                }
                var e = null;
                if (s.target) {
                    e = this._contentRoot.querySelector(s.target) ||
                        this.container.querySelector(s.target);
                }
                this._executeAction(s, e);
            }
        }
    };

    // ── Step execution engine ───────────────────────────────────────────

    WireframeDemo.prototype._runStep = function () {
        if (!this._playing) return;
        if (this._stepIndex >= this._steps.length) {
            this._onSequenceEnd();
            return;
        }

        var self = this;
        var step = this._steps[this._stepIndex];
        var baseDelay = typeof step.delay === 'number' ? step.delay : 2000;
        var delay = baseDelay / this._speedFactor;

        // Snapshot HTML state before this step executes (for backward jumps)
        if (this.config.timeline !== false && !this._htmlSnapshots[this._stepIndex]) {
            this._htmlSnapshots[this._stepIndex] = this._contentRoot.innerHTML;
        }

        // Update timeline dots
        this._updateTimelineDots();

        // If tooltip is activated and visible, keep it anchored to current step
        if (this._tooltipActivated && this._tooltipDotIndex >= 0) {
            this._anchorTooltipToCurrentStep();
        }
        if (this.config.onStepStart) {
            this.config.onStepStart(this._stepIndex, step);
        }

        // Clear previous highlights
        this._clearHighlights();

        // Resolve target element (for multi-action steps, use the first sub-action's target)
        var el = null;
        var stepTarget = step.target || (step.actions && step.actions.length > 0 ? step.actions[0].target : null);
        if (stepTarget) {
            el = this._contentRoot.querySelector(stepTarget);
            if (!el) {
                el = this.container.querySelector(stepTarget);
            }
        }

        // Show caption at the start of the step (while cursor moves)
        this._showCaption(step, el);

        // Callback invoked after the action (and any sub-action delays) finish
        var afterAction = function (cursorOverhead) {
            cursorOverhead = cursorOverhead || 0;
            if (!self._playing) return;
            if (self.config.onStepEnd) {
                self.config.onStepEnd(self._stepIndex, step);
            }
            self._stepIndex++;
            var remaining = cursorOverhead > 0 ? Math.max(delay - cursorOverhead, 100) : delay;
            self._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, remaining);
        };

        // Animate cursor to target, then execute action
        if (this.config.cursor && el) {
            var cursorSpeed = this.config.cursorSpeed / this._speedFactor;
            this._moveCursorTo(el, function () {
                if (!self._playing) return;
                self._executeAction(step, el, function () {
                    afterAction(cursorSpeed);
                });
            });
        } else {
            if (this.config.cursor && !step.actions && step.action === 'pause') {
                this._hideCursor();
            }
            this._executeAction(step, el, function () {
                afterAction(0);
            });
        }
    };

    WireframeDemo.prototype._onSequenceEnd = function () {
        this._clearHighlights();
        this._hideCaption();
        if (this.config.onComplete) {
            this.config.onComplete();
        }
        if (this.config.repeat) {
            var self = this;
            this._stepIndex = 0;
            this._htmlSnapshots = [];

            // Restore the content DOM to its initial state before replaying
            if (this._initialHTML !== undefined) {
                this._contentRoot.innerHTML = this._initialHTML;
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: this.container, instance: this }
                }));
            }

            this._resetCursor();
            this._updateTimelineDots();
            this._showRestartOverlay();

            this._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, 1000 / self._speedFactor);
        } else {
            this._playing = false;
            this._updateControlBtn();
        }
    };

    WireframeDemo.prototype._executeAction = function (step, el, callback) {
        // Multi-action step: execute sub-actions, optionally with delays between them
        if (step.actions && Array.isArray(step.actions)) {
            var self = this;
            var subs = step.actions;

            var executeSub = function (index) {
                if (index >= subs.length) {
                    if (callback) callback();
                    return;
                }
                var sub = subs[index];
                var subEl = null;
                if (sub.target) {
                    subEl = self._contentRoot.querySelector(sub.target) ||
                            self.container.querySelector(sub.target);
                }
                // Build a synthetic step so custom actions see the sub-action's
                // value/action/target while still inheriting parent metadata.
                var syntheticStep = {
                    action: sub.action,
                    value: sub.value,
                    target: sub.target || null,
                    delay: step.delay,
                    noHighlight: step.noHighlight,
                    caption: step.caption,
                    captionOptions: step.captionOptions
                };
                self._executeSingleAction(sub.action, sub.value, subEl, syntheticStep, function () {
                // If this sub-action has a delay and there is a callback
                // (i.e. we are in live playback, not a jump/replay), schedule
                // the next sub-action after the delay.
                var subDelay = typeof sub.delay === 'number' ? sub.delay / self._speedFactor : 0;
                if (subDelay > 0 && callback) {
                    self._timer = setTimeout(function () {
                        self._timer = null;
                        if (!self._playing) return;
                        executeSub(index + 1);
                    }, subDelay);
                } else {
                    executeSub(index + 1);
                }
                });
            };

            executeSub(0);
            return;
        }

        this._executeSingleAction(step.action, step.value, el, step, callback);
    };

    WireframeDemo.prototype._executeSingleAction = function (action, value, el, step, callback) {

        // Check custom actions first
        if (_customActions[action]) {
            _customActions[action].call(this, step, el, this._contentRoot);
            if (callback) callback();
            return;
        }

        switch (action) {
            case 'pause':
                // Do nothing — the delay handles the wait
                break;

            case 'click':
                if (el) {
                    el.click();
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'add-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.add(c); });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'remove-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.remove(c); });
                }
                break;

            case 'toggle-class':
                if (el && value) {
                    value.split(/\s+/).forEach(function (c) { el.classList.toggle(c); });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-attribute':
                if (el && value) {
                    var sep = value.indexOf(':');
                    if (sep !== -1) {
                        el.setAttribute(value.substring(0, sep), value.substring(sep + 1));
                    }
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'remove-attribute':
                if (el && value) {
                    el.removeAttribute(value);
                }
                break;

            case 'set-value':
                if (el && value !== undefined) {
                    el.value = value;
                    // Dispatch input event so frameworks pick up the change
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-text':
                if (el && value !== undefined) {
                    el.textContent = value;
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'set-html':
                if (el && value !== undefined) {
                    el.innerHTML = value;
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'scroll-into-view':
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'dispatch-event':
                if (el && value) {
                    var evtSep = value.indexOf(':');
                    var evtName, evtDetail;
                    if (evtSep !== -1) {
                        evtName = value.substring(0, evtSep);
                        try { evtDetail = JSON.parse(value.substring(evtSep + 1)); }
                        catch (_e) { evtDetail = value.substring(evtSep + 1); }
                    } else {
                        evtName = value;
                        evtDetail = null;
                    }
                    el.dispatchEvent(new CustomEvent(evtName, {
                        bubbles: true, detail: evtDetail
                    }));
                    if (!step.noHighlight) this._highlight(el, step.delay);
                }
                break;

            case 'highlight':
                if (el) {
                    this._highlight(el, step.delay);
                }
                break;

            case 'type-text':
                if (el && value !== undefined) {
                    this._typeText(el, value, step, callback);
                    return; // callback is called by _typeText when done
                }
                break;

            default:
                console.warn('[WireframeDemo] Unknown action: ' + action);
        }
        if (callback) callback();
    };

    // ── Highlight helpers ───────────────────────────────────────────────

    WireframeDemo.prototype._highlight = function (el, duration) {
        var self = this;
        el.classList.add('wfd-highlight');
        this._highlightedEls.push(el);
        var dur = Math.max(duration - 200, 400);
        setTimeout(function () {
            el.classList.remove('wfd-highlight');
            var idx = self._highlightedEls.indexOf(el);
            if (idx !== -1) self._highlightedEls.splice(idx, 1);
        }, dur);
    };

    WireframeDemo.prototype._clearHighlights = function () {
        for (var i = 0; i < this._highlightedEls.length; i++) {
            this._highlightedEls[i].classList.remove('wfd-highlight');
        }
        this._highlightedEls = [];
    };

    // ── Type-text action ────────────────────────────────────────────────

    /**
     * Animate typing text into an element over the step's delay.
     *
     * Automatically chooses letter-at-a-time or word-at-a-time based on
     * what yields a comfortable interval (>= 40ms per chunk).  For very
     * short text or very long delays, letter mode is used; for long text
     * with tight timing, word mode keeps it readable.
     *
     * Sets .value for input/textarea elements, .textContent otherwise.
     * Dispatches "input" events on each keystroke for inputs.
     */
    WireframeDemo.prototype._typeText = function (el, text, step, callback) {
        var self = this;
        var isInput = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
        var baseDelay = typeof step.delay === 'number' ? step.delay : 2000;
        var totalTime = baseDelay / this._speedFactor;

        // Reserve 20% of the delay for the post-typing pause
        var typingTime = totalTime * 0.8;

        // Decide granularity: split into letters, check if interval is comfortable
        var letters = text.split('');
        var letterInterval = letters.length > 0 ? typingTime / letters.length : typingTime;
        var MIN_INTERVAL = 40; // ms — minimum time per chunk

        var chunks, mode;
        if (letterInterval >= MIN_INTERVAL) {
            // Letter-at-a-time
            chunks = letters;
            mode = 'letter';
        } else {
            // Word-at-a-time: split on spaces, preserving spacing
            chunks = text.match(/\S+\s*/g) || [text];
            var wordInterval = chunks.length > 0 ? typingTime / chunks.length : typingTime;
            if (wordInterval < MIN_INTERVAL && chunks.length > 1) {
                // Even words are too fast — group into larger chunks
                var targetChunks = Math.max(1, Math.floor(typingTime / MIN_INTERVAL));
                var charsPerChunk = Math.ceil(text.length / targetChunks);
                chunks = [];
                for (var c = 0; c < text.length; c += charsPerChunk) {
                    chunks.push(text.substring(c, c + charsPerChunk));
                }
            }
            mode = 'word';
        }

        var interval = chunks.length > 0 ? typingTime / chunks.length : 0;
        var currentText = '';
        var chunkIndex = 0;

        if (!step.noHighlight) this._highlight(el, baseDelay);

        // For non-live playback (jumpToStep replay), set instantly
        if (!callback) {
            if (isInput) {
                el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                el.textContent = text;
            }
            return;
        }

        function typeNextChunk() {
            if (!self._playing || chunkIndex >= chunks.length) {
                // Finished typing — set final value to be safe
                if (isInput) {
                    el.value = text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    el.textContent = text;
                }
                if (callback) callback();
                return;
            }

            currentText += chunks[chunkIndex];
            chunkIndex++;

            if (isInput) {
                el.value = currentText;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                el.textContent = currentText;
            }

            self._timer = setTimeout(typeNextChunk, interval);
        }

        typeNextChunk();
    };

    // ── Cleanup ─────────────────────────────────────────────────────────

    WireframeDemo.prototype.destroy = function () {
        this.pause();
        this._clearHighlights();
        this._hideCaption();
        if (this._liveRegion && this._liveRegion.parentNode) {
            this._liveRegion.parentNode.removeChild(this._liveRegion);
            this._liveRegion = null;
        }
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        if (this._timelineEl && this._timelineEl.parentNode) {
            this._timelineEl.parentNode.removeChild(this._timelineEl);
            this._timelineEl = null;
            this._timelineDots = [];
        }
        if (this._tooltipEl && this._tooltipEl.parentNode) {
            this._tooltipEl.parentNode.removeChild(this._tooltipEl);
            this._tooltipEl = null;
        }
        this._cancelTooltipHide();
        if (this._timelineLeaveTimer) {
            clearTimeout(this._timelineLeaveTimer);
            this._timelineLeaveTimer = null;
        }
        if (this._restartOverlay && this._restartOverlay.parentNode) {
            this._restartOverlay.parentNode.removeChild(this._restartOverlay);
            this._restartOverlay = null;
        }
        this._htmlSnapshots = [];
        this.container.removeAttribute('data-wireframe-initialized');
    };

    // ── Static: register custom action ──────────────────────────────────

    /**
     * Register a custom action handler.
     *
     * @param {string}   name    Action name (e.g. "select-tab")
     * @param {Function} handler Called as handler.call(instance, step, el, contentRoot)
     */
    WireframeDemo.registerAction = function (name, handler) {
        _customActions[name] = handler;
    };

    // ── Export ───────────────────────────────────────────────────────────

    root.WireframeDemo = WireframeDemo;

    // Signal that WireframeDemo is available for action registration.
    // Scripts loaded before the controller (e.g. directive :js: files) can
    // listen for this event to register custom actions before auto-discover.
    document.dispatchEvent(new CustomEvent('wireframe-demo-ready'));

    // ── Auto-discovery ──────────────────────────────────────────────────

    function autoDiscover() {
        var containers = document.querySelectorAll(
            '[data-wireframe-demo]:not([data-wireframe-initialized])'
        );
        for (var i = 0; i < containers.length; i++) {
            var el = containers[i];
            var configAttr = el.getAttribute('data-wireframe-config');
            var config = {};
            if (configAttr) {
                try { config = JSON.parse(configAttr); }
                catch (e) { console.error('[WireframeDemo] Bad config JSON:', e); }
            }
            new WireframeDemo(el, config);
        }
    }

    // Run auto-discovery on DOMContentLoaded and on the custom event
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoDiscover);
    } else {
        autoDiscover();
    }
    document.addEventListener('wireframe-demo-loaded', autoDiscover);

})(typeof window !== 'undefined' ? window : this);
