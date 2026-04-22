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
     * Format:  target@delay:action=value
     *   - target  : CSS selector (e.g. "#btn", ".panel")
     *   - @delay  : optional integer milliseconds (default 2000)
     *               append "!" to suppress highlight (e.g. @1500!)
     *   - :action : action name
     *   - =value  : optional value for the action
     *
     * Special: if target is "pause", no selector is needed.
     */
    function parseStepString(str) {
        var delay = 2000;
        var noHighlight = false;
        var working = str;

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
            return { target: null, action: 'pause', delay: delay, noHighlight: noHighlight };
        }

        var step = { target: target, action: action, delay: delay, noHighlight: noHighlight };
        if (value !== undefined) step.value = value;
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
            } else {
                // Already an object — apply defaults
                out.push({
                    target: item.target || null,
                    action: item.action || 'highlight',
                    value: item.value,
                    delay: typeof item.delay === 'number' ? item.delay : 2000,
                    noHighlight: !!item.noHighlight
                });
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
        '  display: block; position: absolute;',
        '  bottom: var(--wfd-control-bottom, 12px);',
        '  right: var(--wfd-control-right, 12px);',
        '  z-index: 10000;',
        '}',
        '.wfd-control-btn {',
        '  width: var(--wfd-control-size, 44px);',
        '  height: var(--wfd-control-size, 44px);',
        '  border-radius: var(--wfd-control-radius, 8px);',
        '  border: var(--wfd-control-border, none);',
        '  padding: 0;',
        '  background: var(--wfd-control-bg, rgba(0,0,0,0.55));',
        '  color: var(--wfd-control-color, #fff);',
        '  display: flex; align-items: center; justify-content: center;',
        '  transition: background 0.2s, transform 0.2s;',
        '  position: relative;',
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
        '.wfd-control-btn:hover::after { opacity: 1; }'
    ].join('\n');

    // SVG icons (Material Design style, white fill via currentColor)
    var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>';
    var ICON_RESTART = '<svg viewBox="0 0 24 24"><path d="M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.3,16.7 8.9,17.1 9.6,17.4L9,19.4C8,19 7.1,18.4 6.3,17.6Z"/></svg>';

    function createControlsHost(instance) {
        var host = document.createElement('div');
        host.className = 'wfd-controls-host';
        var shadow = host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent = CONTROLS_CSS;
        shadow.appendChild(style);

        var btn = document.createElement('button');
        btn.className = 'wfd-control-btn';
        btn.setAttribute('aria-label', 'Pause demo');
        btn.setAttribute('data-tooltip', 'Pause');
        btn.innerHTML = ICON_PAUSE;
        shadow.appendChild(btn);

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (instance._playing) {
                instance.pause();
                btn.innerHTML = ICON_RESTART;
                btn.setAttribute('aria-label', 'Restart demo');
                btn.setAttribute('data-tooltip', 'Restart');
            } else {
                instance.restart();
                btn.innerHTML = ICON_PAUSE;
                btn.setAttribute('aria-label', 'Pause demo');
                btn.setAttribute('data-tooltip', 'Pause');
            }
        });

        instance._controlBtn = btn;
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
            cursor: false,
            cursorSpeed: 300,
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
        this._observer = null;
        this._highlightedEls = [];
        this._contentRoot = null; // the element holding fetched HTML
        this._cursorEl = null;
        this._cursorX = 0;
        this._cursorY = 0;

        this._init();
    }

    WireframeDemo.prototype._init = function () {
        var self = this;
        var container = this.container;

        // Mark initialised to prevent double-init
        container.setAttribute('data-wireframe-initialized', 'true');

        // Ensure container is positioned so the controls overlay works
        var pos = window.getComputedStyle(container).position;
        if (pos === 'static') {
            container.style.position = 'relative';
        }

        // Parse steps
        this._steps = parseSteps(this.config.steps);

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

        // Pause on user interaction
        if (this.config.pauseOnInteraction) {
            container.addEventListener('click', function (e) {
                if (!e.isTrusted) return;
                // Ignore clicks on the controls host itself
                if (e.target.closest && e.target.closest('.wfd-controls-host')) return;
                if (self._playing) {
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
            self._onReady();
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
                // Save the initial HTML for restart resets
                self._initialHTML = html;
                // Dispatch event so external code can react
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: self.container, instance: self }
                }));
                if (callback) callback();
            })
            .catch(function (err) {
                console.error('[WireframeDemo] ' + err.message);
                self._contentRoot.innerHTML =
                    '<p style="color:red;padding:16px;">Error loading demo HTML: ' + err.message + '</p>';
            });
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

    // ── Playback controls ───────────────────────────────────────────────

    WireframeDemo.prototype.play = function () {
        if (this._playing) return;
        this._playing = true;
        this._started = true;
        this._updateControlBtn();
        this._runStep();
    };

    WireframeDemo.prototype.pause = function () {
        if (!this._playing) return;
        this._playing = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._updateControlBtn();
    };

    WireframeDemo.prototype.restart = function () {
        this.pause();
        this._clearHighlights();
        this._resetCursor();
        this._stepIndex = 0;

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

        this.play();
    };

    WireframeDemo.prototype._updateControlBtn = function () {
        var btn = this._controlBtn;
        if (!btn) return;
        if (this._playing) {
            btn.innerHTML = ICON_PAUSE;
            btn.setAttribute('aria-label', 'Pause demo');
            btn.setAttribute('data-tooltip', 'pause demo');
        } else {
            btn.innerHTML = ICON_RESTART;
            btn.setAttribute('aria-label', 'Restart demo');
            btn.setAttribute('data-tooltip', 'restart demo');
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
        var duration = this.config.cursorSpeed;
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

    // ── Step execution engine ───────────────────────────────────────────

    WireframeDemo.prototype._runStep = function () {
        if (!this._playing) return;
        if (this._stepIndex >= this._steps.length) {
            this._onSequenceEnd();
            return;
        }

        var self = this;
        var step = this._steps[this._stepIndex];
        var delay = typeof step.delay === 'number' ? step.delay : 2000;

        // Callback
        if (this.config.onStepStart) {
            this.config.onStepStart(this._stepIndex, step);
        }

        // Clear previous highlights
        this._clearHighlights();

        // Resolve target element
        var el = null;
        if (step.target) {
            el = this._contentRoot.querySelector(step.target);
            if (!el) {
                // Also try the container itself (for elements outside _contentRoot)
                el = this.container.querySelector(step.target);
            }
        }

        // Animate cursor to target, then execute action
        if (this.config.cursor && el) {
            var cursorSpeed = this.config.cursorSpeed;
            this._moveCursorTo(el, function () {
                if (!self._playing) return;
                self._executeAction(step, el);
                if (self.config.onStepEnd) {
                    self.config.onStepEnd(self._stepIndex, step);
                }
                self._stepIndex++;
                var remaining = Math.max(delay - cursorSpeed, 100);
                self._timer = setTimeout(function () {
                    self._timer = null;
                    self._runStep();
                }, remaining);
            });
        } else {
            if (this.config.cursor && step.action === 'pause') {
                this._hideCursor();
            }
            this._executeAction(step, el);
            if (this.config.onStepEnd) {
                this.config.onStepEnd(this._stepIndex, step);
            }
            this._stepIndex++;
            this._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, delay);
        }
    };

    WireframeDemo.prototype._onSequenceEnd = function () {
        this._clearHighlights();
        if (this.config.onComplete) {
            this.config.onComplete();
        }
        if (this.config.repeat) {
            var self = this;
            this._stepIndex = 0;

            // Restore the content DOM to its initial state before replaying
            if (this._initialHTML !== undefined) {
                this._contentRoot.innerHTML = this._initialHTML;
                document.dispatchEvent(new CustomEvent('wireframe-demo-loaded', {
                    detail: { container: this.container, instance: this }
                }));
            }

            this._resetCursor();

            this._timer = setTimeout(function () {
                self._timer = null;
                self._runStep();
            }, 1000);
        } else {
            this._playing = false;
            this._updateControlBtn();
        }
    };

    WireframeDemo.prototype._executeAction = function (step, el) {
        var action = step.action;
        var value = step.value;

        // Check custom actions first
        if (_customActions[action]) {
            _customActions[action].call(this, step, el, this._contentRoot);
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

            default:
                console.warn('[WireframeDemo] Unknown action: ' + action);
        }
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

    // ── Cleanup ─────────────────────────────────────────────────────────

    WireframeDemo.prototype.destroy = function () {
        this.pause();
        this._clearHighlights();
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
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
