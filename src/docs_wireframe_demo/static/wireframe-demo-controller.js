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

    var CONTROLS_CSS = [
        ':host { display: block; position: absolute; bottom: 8px; right: 8px; z-index: 10000; }',
        '.wfd-control-btn {',
        '  width: 32px; height: 32px; border-radius: 50%;',
        '  border: none; cursor: pointer; padding: 0;',
        '  background: rgba(0,0,0,0.55); color: #fff;',
        '  display: flex; align-items: center; justify-content: center;',
        '  transition: background 0.2s;',
        '  position: relative;',
        '}',
        '.wfd-control-btn:hover { background: rgba(0,0,0,0.8); }',
        '.wfd-control-btn svg { width: 16px; height: 16px; fill: currentColor; }',
        '.wfd-control-btn[hidden] { display: none; }',
        '.wfd-control-btn::after {',
        '  content: attr(data-tooltip);',
        '  position: absolute; bottom: 110%; right: 0;',
        '  background: rgba(0,0,0,0.8); color: #fff;',
        '  padding: 3px 8px; border-radius: 4px; font-size: 11px;',
        '  white-space: nowrap; pointer-events: none;',
        '  opacity: 0; transition: opacity 0.15s;',
        '}',
        '.wfd-control-btn:hover::after { opacity: 1; }'
    ].join('\n');

    // SVG icons
    var ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
    var ICON_RESTART = '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>';

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
        btn.setAttribute('data-tooltip', 'pause demo');
        btn.innerHTML = ICON_PAUSE;
        shadow.appendChild(btn);

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (instance._playing) {
                instance.pause();
                btn.innerHTML = ICON_RESTART;
                btn.setAttribute('aria-label', 'Restart demo');
                btn.setAttribute('data-tooltip', 'restart demo');
            } else {
                instance.restart();
                btn.innerHTML = ICON_PAUSE;
                btn.setAttribute('aria-label', 'Pause demo');
                btn.setAttribute('data-tooltip', 'pause demo');
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
            // No HTML to fetch — content already in container or will be added later
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
        this._stepIndex = 0;
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

        // Execute action
        this._executeAction(step, el);

        // Callback
        if (this.config.onStepEnd) {
            this.config.onStepEnd(this._stepIndex, step);
        }

        // Schedule next step
        this._stepIndex++;
        this._timer = setTimeout(function () {
            self._timer = null;
            self._runStep();
        }, delay);
    };

    WireframeDemo.prototype._onSequenceEnd = function () {
        this._clearHighlights();
        if (this.config.onComplete) {
            this.config.onComplete();
        }
        if (this.config.repeat) {
            var self = this;
            this._stepIndex = 0;
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
