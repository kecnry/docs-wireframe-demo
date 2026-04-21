// wireframe-engine.js - Generic wireframe demo engine
// Works with pre-rendered sidebar panels in HTML; controlled via CSS-selector-based demo sequences.
// Supports both sidebar-name shorthand ("plugins", "loaders", …) and CSS selector steps
// ("#format-select:select=2D Spectrum", ".expansion-panel:open-panel", …) for backward compatibility
// and new fine-grained control.

function initializeWireframeEngine(container) {
    // No container: initialise every uninitialised container on the page
    if (!container) {
        document.querySelectorAll('.wireframe-container:not([data-initialized])').forEach(function(c) {
            initializeWireframeEngine(c);
        });
        return;
    }
    if (container.dataset.initialized) return;
    container.dataset.initialized = 'true';

    // ── Config ────────────────────────────────────────────────────────────────
    var config = {};
    var configAttr = container.dataset.wireframeConfig;
    if (configAttr) {
        try { config = JSON.parse(configAttr); }
        catch (e) { config = window.wireframeConfig || {}; }
    } else {
        config = window.wireframeConfig || {};
    }

    var initialState = config.initialState  || null;
    var customDemo   = config.customDemo    || null;
    var enableOnly   = config.enableOnly    || null;
    var showScrollTo = config.showScrollTo  !== undefined ? config.showScrollTo  : true;
    var demoRepeat   = config.demoRepeat    !== undefined ? config.demoRepeat    : true;

    // Propagate showScrollTo as CSS class so footer buttons can be shown/hidden via CSS
    if (showScrollTo) container.classList.add('wireframe-show-scroll-to');

    // ── Toolbar SVG icon map ──────────────────────────────────────────────────
    var iconSvgs = {
        'play':            "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M8,5.14V19.14L19,12.14L8,5.14Z\" /></svg>')",
        'pause':           "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M14,19H18V5H14M6,19H10V5H6V19Z\" /></svg>')",
        'restart':         "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M12,4C14.1,4 16.1,4.8 17.6,6.3C20.7,9.4 20.7,14.5 17.6,17.6C15.8,19.5 13.3,20.2 10.9,19.9L11.4,17.9C13.1,18.1 14.9,17.5 16.2,16.2C18.5,13.9 18.5,10.1 16.2,7.7C15.1,6.6 13.5,6 12,6V10.6L7,5.6L12,0.6V4M6.3,17.6C3.7,15 3.3,11 5.1,7.9L6.6,9.4C5.5,11.6 5.9,14.4 7.8,16.2C8.3,16.7 8.9,17.1 9.6,17.4L9,19.4C8,19 7.1,18.4 6.3,17.6Z\" /></svg>')",
        'database-import': "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M19,19V5H5V19H19M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5C3,3.89 3.9,3 5,3H19M11,7H13V11H17V13H13V17H11V13H7V11H11V7Z\" /></svg>')",
        'download':        "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z\" /></svg>')",
        'tune':            "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z\" /></svg>')",
        'information':     "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z\" /></svg>')",
        'wrench':          "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M8 13C6.14 13 4.59 14.28 4.14 16H2V18H4.14C4.59 19.72 6.14 21 8 21S11.41 19.72 11.86 18H22V16H11.86C11.41 14.28 9.86 13 8 13M8 19C6.9 19 6 18.1 6 17C6 15.9 6.9 15 8 15S10 15.9 10 17C10 18.1 9.1 19 8 19M19.86 6C19.41 4.28 17.86 3 16 3S12.59 4.28 12.14 6H2V8H12.14C12.59 9.72 14.14 11 16 11S19.41 9.72 19.86 8H22V6H19.86M16 9C14.9 9 14 8.1 14 7C14 5.9 14.9 5 16 5S18 5.9 18 7C18 8.1 17.1 9 16 9Z\" /></svg>')",
        'selection':       "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M2 2H8V4H4V8H2V2M2 16H4V20H8V22H2V16M16 2H22V8H20V4H16V2M20 16H22V22H16V20H20V16Z\" /></svg>')",
        'help-circle':     "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z\" /></svg>')",
        'auto-fix':        "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path fill=\"white\" d=\"M7.5,5.6L5,7L6.4,4.5L5,2L7.5,3.4L10,2L8.6,4.5L10,7L7.5,5.6M19.5,15.4L22,14L20.6,16.5L22,19L19.5,17.6L17,19L18.4,16.5L17,14L19.5,15.4M22,2L20.6,4.5L22,7L19.5,5.6L17,7L18.4,4.5L17,2L19.5,3.4L22,2M13.34,12.78L15.78,10.34L13.66,8.22L11.22,10.66L13.34,12.78M14.37,7.29L16.71,9.63C17.1,10 17.1,10.65 16.71,11.04L5.04,22.71C4.65,23.1 4,23.1 3.63,22.71L1.29,20.37C0.9,20 0.9,19.35 1.29,18.96L12.96,7.29C13.35,6.9 14,6.9 14.37,7.29Z\" /></svg>')"
    };

    // Apply icon SVGs to toolbar icons
    var wireframeIcons = container.querySelectorAll('.wireframe-toolbar-icon, .api-button');
    wireframeIcons.forEach(function(icon) {
        var name = icon.dataset.icon;
        if (name && iconSvgs[name] && !icon.classList.contains('api-button')) {
            icon.style.backgroundImage = iconSvgs[name];
        }
    });

    // Cycle-control icons
    var cycleIconPause   = container.querySelector('.cycle-icon-pause');
    var cycleIconRestart = container.querySelector('.cycle-icon-restart');
    if (cycleIconPause)   cycleIconPause.style.backgroundImage   = iconSvgs['pause'];
    if (cycleIconRestart) cycleIconRestart.style.backgroundImage = iconSvgs['restart'];

    // ── Viewer toolbar icon data URIs ─────────────────────────────────────────
    var VIEWER_TOOLBAR_ICONS = {
        home:    'bqplot:home',
        panZoom: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI3LjUuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAyMi45IDIzIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAyMi45IDIzOyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+CjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+Cgkuc3Qwe2ZpbGw6IzAxMDEwMTt9Cjwvc3R5bGU+Cjxwb2x5Z29uIGNsYXNzPSJzdDAiIHBvaW50cz0iMjAuMSwxMy4xIDIxLDEzLjEgMjEsMS45IDkuOSwxLjkgOS45LDMuMyA3LjksMy4zIDcuOSwwIDIyLjksMCAyMi45LDE1LjEgMjAuMSwxNS4xICIvPgo8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMCwyMS4xTDEuOSwyM2w1LjgtNS43di0wLjZsMC44LTAuOGMxLjIsMC45LDIuNiwxLjMsNCwxLjNjMy43LDAsNi43LTMsNi43LTYuN3MtMy02LjctNi43LTYuN3MtNi43LDMtNi43LDYuNwoJYzAsMS40LDAuNSwyLjgsMS4zLDRsLTAuOCwwLjhINS44TDAsMjEuMXogTTEyLjQsMTUuMmMtMi42LDAtNC43LTIuMS00LjctNC43bDAsMGMwLTIuNiwyLjEtNC43LDQuNy00LjdjMi42LDAsNC43LDIuMSw0LjcsNC43CglTMTUsMTUuMiwxMi40LDE1LjJDMTIuNCwxNS4yLDEyLjQsMTUuMiwxMi40LDE1LjJ6Ii8+Cjwvc3ZnPgo=',
        rectROI: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNS40NiAyNS40NiI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMwMTAxMDE7fTwvc3R5bGU+PC9kZWZzPjx0aXRsZT52aXogbG9nb3MgW1JlY292ZXJlZF08L3RpdGxlPjxwb2x5bGluZSBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTEuNjcgMTMuNzMgMTEuNjcgMjEuNjMgMTAuMTMgMjAuMDkgOC43MiAyMS41MSAxMi42NyAyNS40NiAxNi42MiAyMS41MSAxNS4yMSAyMC4wOSAxMy42NyAyMS42MyAxMy42NyAxMy43MyIvPjxwb2x5bGluZSBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTMuNjcgMTMuNzMgMTMuNjcgMy44MyAxNS4yMSA1LjM2IDE2LjYyIDMuOTUgMTIuNjcgMCA4LjcyIDMuOTUgMTAuMTMgNS4zNiAxMS42NyAzLjgzIDExLjY3IDEzLjczIi8+PC9zdmc+',
        circROI: 'data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMi43NiAyNCI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMyMzFmMjA7fTwvc3R5bGU+PC9kZWZzPjxyZWN0IGNsYXNzPSJjbHMtMSIgeD0iMS45NiIgeT0iMTYuMTUiIHdpZHRoPSIyLjk2IiBoZWlnaHQ9IjIuOTYiIHJ4PSIxLjQ4Ii8+PHJlY3QgY2xhc3M9ImNscy0xIiB4PSIxOCIgeT0iMTEuNzciIHdpZHRoPSIyLjk2IiBoZWlnaHQ9IjIuOTYiIHJ4PSIxLjQ4Ii8+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNy4zMywwVjI0aDguMzNWMFptNC4yMiwxMGgwYTEuNDgsMS40OCwwLDAsMS0xLjQ4LTEuNDhoMEExLjQ4LDEuNDgsMCwwLDEsMTEuNTUsN2gwQTEuNDgsMS40OCwwLDAsMSwxMyw4LjUyaDBBMS40OCwxLjQ4LDAsMCwxLDExLjU1LDEwWiIvPjwvc3ZnPg=='
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var wireframeSidebar = container.querySelector('.wireframe-sidebar');

    // ── State ─────────────────────────────────────────────────────────────────
    var autoCycling = true;
    var cycleInterval = null;
    var currentCycleIndex = 0;
    var currentHighlightedElements = [];
    var currentSidebar = null;
    var hasStartedCycling = false;

    // ── Sequence parser ───────────────────────────────────────────────────────
    // Supported step formats:
    //   sidebar[@delay[!]]                    show sidebar (shorthand)
    //   sidebar[@delay[!]]:action[=value]     sidebar-scoped action
    //   #id[@delay[!]]:action[=value]         CSS selector step
    //   .class[@delay[!]]:action[=value]      CSS selector step
    //   [attr=x][@delay[!]]:action[=value]    CSS selector step
    //   viewer-ACTION[@delay[!]]:params       viewer action
    //   pause[@delay]                         wait only
    function parseSequence(sequenceArray) {
        var sequence = [];
        if (!sequenceArray) return sequence;
        sequenceArray.forEach(function(item) {
            var delay = 2000;
            var noHighlight = false;
            var workingItem = item;

            // Extract @delay[!] timing suffix
            var atIdx = item.indexOf('@');
            if (atIdx !== -1) {
                var beforeAt = item.substring(0, atIdx);
                var afterAt  = item.substring(atIdx + 1);
                var colonAfterAt = afterAt.indexOf(':');
                if (colonAfterAt !== -1) {
                    var delayPart = afterAt.substring(0, colonAfterAt);
                    if (delayPart.charAt(delayPart.length - 1) === '!') { noHighlight = true; delayPart = delayPart.slice(0, -1); }
                    delay = parseInt(delayPart, 10);
                    workingItem = beforeAt + afterAt.substring(colonAfterAt);
                } else {
                    var delayPart = afterAt;
                    if (delayPart.charAt(delayPart.length - 1) === '!') { noHighlight = true; delayPart = delayPart.slice(0, -1); }
                    delay = parseInt(delayPart, 10);
                    workingItem = beforeAt;
                }
            }

            var firstChar = workingItem.charAt(0);
            var isCssSelector = firstChar === '#' || firstChar === '.' || firstChar === '[';

            if (workingItem.indexOf(':') !== -1) {
                var colonIdx = workingItem.indexOf(':');
                var target     = workingItem.substring(0, colonIdx);
                var actionPart = workingItem.substring(colonIdx + 1);

                if (target.indexOf('viewer-') === 0) {
                    // viewer-ACTION:params
                    sequence.push({ selector: null, sidebar: target, action: null, value: actionPart, delay: delay, noHighlight: noHighlight, isCssSelector: false });
                } else if (isCssSelector) {
                    // CSS selector step
                    var eqIdx = actionPart.indexOf('=');
                    if (eqIdx !== -1) {
                        sequence.push({ selector: target, sidebar: null, action: actionPart.substring(0, eqIdx), value: actionPart.substring(eqIdx + 1), delay: delay, noHighlight: noHighlight, isCssSelector: true });
                    } else {
                        sequence.push({ selector: target, sidebar: null, action: actionPart, value: null, delay: delay, noHighlight: noHighlight, isCssSelector: true });
                    }
                } else {
                    // sidebar:action[=value]
                    var eqIdx = actionPart.indexOf('=');
                    if (eqIdx !== -1) {
                        sequence.push({ selector: null, sidebar: target, action: actionPart.substring(0, eqIdx), value: actionPart.substring(eqIdx + 1), delay: delay, noHighlight: noHighlight, isCssSelector: false });
                    } else {
                        sequence.push({ selector: null, sidebar: target, action: actionPart, value: null, delay: delay, noHighlight: noHighlight, isCssSelector: false });
                    }
                }
            } else {
                // No colon
                if (isCssSelector) {
                    sequence.push({ selector: workingItem, sidebar: null, action: 'click', value: null, delay: delay, noHighlight: noHighlight, isCssSelector: true });
                } else {
                    sequence.push({ selector: null, sidebar: workingItem, action: 'show', value: null, delay: delay, noHighlight: noHighlight, isCssSelector: false });
                }
            }
        });
        return sequence;
    }

    var demoSequence    = parseSequence(customDemo);
    var initialSequence = parseSequence(initialState);
    var sidebarOrder    = (demoSequence.length > 0)
        ? demoSequence.map(function(s) { return s.sidebar; }).filter(Boolean)
        : Array.from(container.querySelectorAll('[data-sidebar-panel]')).map(function(p) { return p.dataset.sidebarPanel; });

    // ── Helpers ───────────────────────────────────────────────────────────────
    function briefHighlight(element, stepDelay) {
        if (!element) return;
        var dur = Math.min(1000, (stepDelay || 2000) / 2);
        element.classList.add('highlighted');
        currentHighlightedElements.push(element);
        setTimeout(function() { element.classList.remove('highlighted'); }, dur);
    }

    function stopAutoCycle() {
        if (autoCycling) {
            autoCycling = false;
            if (cycleInterval) { clearInterval(cycleInterval); cycleInterval = null; }
            updateCycleControlButton();
        }
    }

    function updateCycleControlButton() {
        var p = container.querySelector('.cycle-icon-pause');
        var r = container.querySelector('.cycle-icon-restart');
        if (autoCycling) {
            if (p) p.classList.remove('hidden');
            if (r) r.classList.add('hidden');
        } else {
            if (r) r.classList.remove('hidden');
            if (p) p.classList.add('hidden');
        }
    }

    // ── Sidebar panel management ──────────────────────────────────────────────
    // Expects panels as: <div class="wireframe-sidebar-panel" data-sidebar-panel="NAME">
    // Tabs as:           <button class="wireframe-sidebar-tab"> within the panel
    // Tab content as:    <div class="wireframe-tab-panel"> (one per tab, in order)

    function activateSidebar(sidebarType, tabNameOrIndex) {
        if (!wireframeSidebar) return;

        // Deactivate all toolbar icons
        wireframeIcons.forEach(function(i) {
            if (!i.classList.contains('api-button')) i.classList.remove('active');
        });

        // Hide all sidebar panels
        wireframeSidebar.querySelectorAll('.wireframe-sidebar-panel').forEach(function(p) {
            p.classList.remove('active');
        });

        // Show target panel
        var panel = wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebarType + '"]');
        if (panel) {
            panel.classList.add('active');
            // Activate the requested tab, or ensure the first tab is active
            if (tabNameOrIndex !== undefined && tabNameOrIndex !== null) {
                _activateTab(panel, tabNameOrIndex);
            } else if (!panel.querySelector('.wireframe-sidebar-tab.active')) {
                _activateTab(panel, 0);
            }
            _bindExpansionPanels(panel);
            _bindScrollLinks(panel);
        }

        var icon = container.querySelector('.wireframe-toolbar-icon[data-sidebar="' + sidebarType + '"]');
        if (icon) icon.classList.add('active');
        wireframeSidebar.classList.add('visible');
        currentSidebar = sidebarType;
    }

    function _activateTab(panel, tabNameOrIndex) {
        var tabs      = panel.querySelectorAll('.wireframe-sidebar-tab');
        var tabPanels = panel.querySelectorAll('.wireframe-tab-panel');
        if (!tabs.length) return;

        var idx = -1;
        if (typeof tabNameOrIndex === 'number') {
            idx = tabNameOrIndex;
        } else {
            tabs.forEach(function(t, i) { if (t.textContent.trim() === tabNameOrIndex) idx = i; });
        }
        if (idx === -1) idx = 0;

        tabs.forEach(function(t, i)  { t.classList.toggle('active', i === idx); });
        tabPanels.forEach(function(p, i) { p.classList.toggle('active', i === idx); });

        // Bind click handlers (idempotent via flag)
        tabs.forEach(function(tab, i) {
            if (tab.dataset.engineTabBound) return;
            tab.dataset.engineTabBound = 'true';
            tab.addEventListener('click', function(e) {
                if (e.isTrusted) stopAutoCycle();
                _activateTab(panel, i);
            });
        });
    }

    function _bindExpansionPanels(scope) {
        var panels = scope.querySelectorAll('.expansion-panel:not(.disabled)');
        panels.forEach(function(ep) {
            if (ep.dataset.engineBound) return;
            ep.dataset.engineBound = 'true';
            var header  = ep.querySelector('.expansion-panel-header');
            var content = ep.querySelector('.expansion-panel-content');
            if (!header || !content) return;
            header.addEventListener('click', function() {
                stopAutoCycle();
                var expanded = ep.classList.contains('expanded');
                if (expanded) {
                    ep.classList.remove('expanded');
                    content.classList.remove('expanded');
                } else {
                    // Accordion: close siblings
                    panels.forEach(function(p) {
                        p.classList.remove('expanded');
                        var c = p.querySelector('.expansion-panel-content');
                        if (c) c.classList.remove('expanded');
                    });
                    ep.classList.add('expanded');
                    content.classList.add('expanded');
                }
            });
        });
    }

    function _bindScrollLinks(scope) {
        scope.querySelectorAll('[data-scroll-target]').forEach(function(link) {
            if (link.dataset.engineScrollBound) return;
            link.dataset.engineScrollBound = 'true';
            link.addEventListener('click', function() {
                stopAutoCycle();
                var targetId = link.getAttribute('data-scroll-target');
                var targetEl = document.querySelector('[data-grid-id="' + targetId + '"]');
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTimeout(function() {
                        document.querySelectorAll('.grid-item.highlighted').forEach(function(el) { el.classList.remove('highlighted'); });
                        targetEl.classList.add('highlighted');
                        setTimeout(function() { targetEl.classList.remove('highlighted'); }, 3000);
                    }, 500);
                }
            });
        });
    }

    // ── CSS selector action executor ──────────────────────────────────────────
    // Supported actions: click, show, select, open-panel, close-panel, select-tab, highlight
    function executeSelectorAction(selector, action, value, stepDelay, noHighlight) {
        var el = container.querySelector(selector);
        if (!el) return null;

        switch (action) {
            case 'click':
            case 'show':
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return noHighlight ? null : el;

            case 'select':
                if (el.tagName === 'SELECT' && value) {
                    var lc = value.toLowerCase();
                    for (var i = 0; i < el.options.length; i++) {
                        if (el.options[i].text.trim().toLowerCase() === lc ||
                            (el.options[i].value || '').trim().toLowerCase() === lc) {
                            el.selectedIndex = i;
                            el.style.background = 'rgba(199, 93, 44, 0.3)';
                            (function(e) { setTimeout(function() { e.style.background = ''; }, 800); }(el));
                            break;
                        }
                    }
                }
                return noHighlight ? null : el;

            case 'open-panel': {
                var ep = el.classList.contains('expansion-panel') ? el : el.querySelector('.expansion-panel');
                if (ep) {
                    ep.classList.add('expanded');
                    var c = ep.querySelector('.expansion-panel-content');
                    if (c) c.classList.add('expanded');
                    return noHighlight ? null : ep;
                }
                return noHighlight ? null : el;
            }

            case 'close-panel': {
                var ep = el.classList.contains('expansion-panel') ? el : el.querySelector('.expansion-panel');
                if (ep) {
                    ep.classList.remove('expanded');
                    var c = ep.querySelector('.expansion-panel-content');
                    if (c) c.classList.remove('expanded');
                }
                return noHighlight ? null : el;
            }

            case 'select-tab':
                if (value) {
                    var sidebarPanel = el.closest('.wireframe-sidebar-panel') || wireframeSidebar;
                    if (sidebarPanel) _activateTab(sidebarPanel, value);
                }
                return noHighlight ? null : el;

            case 'highlight':
                if (!noHighlight) {
                    el.classList.add('highlighted');
                    currentHighlightedElements.push(el);
                }
                return el;

            case 'toggle-class':
                if (value) {
                    el.classList.toggle(value);
                }
                return noHighlight ? null : el;

            default:
                return el;
        }
    }

    // ── Viewer management (unchanged from original controller) ─────────────────
    function createLegendItem(layerName, index, total) {
        var letter = String.fromCharCode(65 + ((total - 1 - index) % 26));
        var div = document.createElement('div');
        div.className = 'legend-item data-menu-trigger';
        div.innerHTML = '<span class="legend-letter">' + letter + '</span><div class="legend-text">' + layerName + '</div>';
        return div;
    }

    function createViewerElement(viewerId) {
        var v = document.createElement('div');
        v.className = 'wireframe-viewer viewer-adding';
        v.dataset.viewerId = viewerId;
        v.innerHTML =
            '<div class="viewer-toolbar">' +
            '<div class="viewer-toolbar-spacer"></div>' +
            '<div class="viewer-toolbar-icon" data-icon="' + VIEWER_TOOLBAR_ICONS.home    + '" title="Home"></div>' +
            '<div class="viewer-toolbar-icon" data-icon="' + VIEWER_TOOLBAR_ICONS.panZoom + '" title="Pan/Zoom"></div>' +
            '<div class="viewer-toolbar-icon" data-icon="' + VIEWER_TOOLBAR_ICONS.rectROI + '" title="Rectangular ROI"></div>' +
            '<div class="viewer-toolbar-icon" data-icon="' + VIEWER_TOOLBAR_ICONS.circROI + '" title="Circular ROI"></div>' +
            '</div>' +
            '<div class="viewer-content">' +
            '<div class="viewer-image-container"></div>' +
            '<span class="viewer-area-text">' + viewerId + '</span>' +
            '<div class="data-menu-legend"></div>' +
            '</div>';
        setTimeout(function() { v.classList.remove('viewer-adding'); }, 300);
        return v;
    }

    function executeViewerAdd(direction, newId, parentId) {
        var viewerArea = container.querySelector('.wireframe-viewer-area');
        if (!viewerArea) return;
        var targetViewer;
        if (parentId) {
            targetViewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + parentId + '"]');
        } else {
            var viewers = container.querySelectorAll('.wireframe-viewer');
            targetViewer = viewers.length > 0 ? viewers[viewers.length - 1] : null;
        }
        if (!targetViewer) { viewerArea.appendChild(createViewerElement(newId)); return; }
        var parent = targetViewer.parentNode;
        var split = document.createElement('div');
        split.className = 'wireframe-viewer-split ' +
            (['horiz','h','horiz-before','hb'].indexOf(direction) !== -1 ? 'horizontal' : 'vertical');
        parent.insertBefore(split, targetViewer);
        split.appendChild(targetViewer);
        var nv = createViewerElement(newId);
        if (['horiz-before','hb','vert-before','vb'].indexOf(direction) !== -1) {
            split.insertBefore(nv, targetViewer);
        } else {
            split.appendChild(nv);
        }
    }

    function executeViewerImage(viewerId, imagePath) {
        var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]');
        if (!viewer) return;
        var content = viewer.querySelector('.viewer-content');
        var img     = viewer.querySelector('.viewer-image-container');
        if (content && img) {
            if (imagePath) { content.classList.add('has-image'); img.style.backgroundImage = 'url(' + imagePath + ')'; }
            else           { content.classList.remove('has-image'); img.style.backgroundImage = ''; }
        }
    }

    function executeViewerLegend(viewerId, layersString) {
        var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]');
        if (!viewer) return;
        var legend = viewer.querySelector('.data-menu-legend');
        if (!legend) return;
        legend.innerHTML = '';
        var layers = layersString.split('|');
        var total  = layers.filter(function(l) { return l.trim(); }).length;
        layers.forEach(function(layer, index) {
            var t = layer.trim();
            if (t) legend.appendChild(createLegendItem(t, index, total));
        });
    }

    function executeViewerFocus(viewerId) {
        container.querySelectorAll('.wireframe-viewer').forEach(function(v) { v.classList.remove('focused'); });
        if (viewerId) {
            var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]');
            if (viewer) viewer.classList.add('focused');
        }
    }

    function executeViewerRemove(viewerId) {
        var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]');
        if (!viewer) return;
        var parent = viewer.parentNode;
        parent.removeChild(viewer);
        if (parent.classList.contains('wireframe-viewer-split') && parent.children.length === 1) {
            var gp = parent.parentNode;
            gp.insertBefore(parent.children[0], parent);
            gp.removeChild(parent);
        }
    }

    function executeViewerOpenDataMenu(viewerId) {
        var trigger = null;
        if (viewerId) {
            var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]');
            if (viewer) trigger = viewer.querySelector('.data-menu-trigger');
        }
        if (!trigger) trigger = container.querySelector('.data-menu-trigger');
        if (trigger) trigger.click();
    }

    function executeViewerToolToggle(viewerId, toolName) {
        var toolMap = {
            'home':      VIEWER_TOOLBAR_ICONS.home,
            'panzoom':   VIEWER_TOOLBAR_ICONS.panZoom, 'pan-zoom': VIEWER_TOOLBAR_ICONS.panZoom, 'pan_zoom': VIEWER_TOOLBAR_ICONS.panZoom,
            'rectangle': VIEWER_TOOLBAR_ICONS.rectROI,
            'circle':    VIEWER_TOOLBAR_ICONS.circROI
        };
        var viewer = container.querySelector('.wireframe-viewer[data-viewer-id="' + viewerId + '"]')
                  || container.querySelector('.wireframe-viewer');
        if (!viewer) return null;
        var iconValue = toolMap[toolName.toLowerCase()];
        if (!iconValue) return null;
        var toolIcon = viewer.querySelector('.viewer-toolbar-icon[data-icon="' + iconValue + '"]');
        if (toolIcon) {
            if (toolIcon.classList.contains('active')) {
                toolIcon.classList.remove('active');
            } else {
                viewer.querySelectorAll('.viewer-toolbar-icon').forEach(function(i) { i.classList.remove('active'); });
                toolIcon.classList.add('active');
            }
        }
        return toolIcon;
    }

    // ── Viewer action dispatcher ──────────────────────────────────────────────
    function dispatchViewerAction(sidebar, value) {
        var params = value ? value.split(':') : [];
        if      (sidebar === 'viewer-add')            executeViewerAdd(params[0] || 'horiz', params[1] || ('viewer-' + Date.now()), params[2] || null);
        else if (sidebar === 'viewer-image')          executeViewerImage(params[0] || 'default', params.slice(1).join(':'));
        else if (sidebar === 'viewer-legend')         executeViewerLegend(params[0] || 'default', params.slice(1).join(':'));
        else if (sidebar === 'viewer-focus')          executeViewerFocus(params[0] || null);
        else if (sidebar === 'viewer-remove')         { if (params[0]) executeViewerRemove(params[0]); }
        else if (sidebar === 'viewer-open-data-menu') executeViewerOpenDataMenu(params[0] || null);
        else if (sidebar === 'viewer-tool-toggle')    { if (params[0] && params[1]) executeViewerToolToggle(params[0], params[1]); }
    }

    // ── Demo state reset ──────────────────────────────────────────────────────
    function resetDemoState() {
        currentHighlightedElements.forEach(function(el) { el.classList.remove('highlighted'); });
        currentHighlightedElements = [];

        var viewerArea = container.querySelector('.wireframe-viewer-area');
        if (viewerArea) {
            viewerArea.querySelectorAll('.wireframe-viewer-split').forEach(function(s) { s.remove(); });
            viewerArea.querySelectorAll('.wireframe-viewer').forEach(function(v) { v.remove(); });
        }

        var popup = container.querySelector('#data-menu-popup');
        if (popup) popup.classList.remove('visible');

        if (currentSidebar && wireframeSidebar) {
            wireframeSidebar.classList.remove('visible');
            wireframeIcons.forEach(function(i) { if (!i.classList.contains('api-button')) i.classList.remove('active'); });
            currentSidebar = null;
        }

        container.querySelectorAll('.wireframe-input').forEach(function(i) { i.value = ''; });
        container.querySelectorAll('.wireframe-checkbox').forEach(function(c) { c.checked = false; });
        container.querySelectorAll('.wireframe-select').forEach(function(s) { s.selectedIndex = 0; });
        container.querySelectorAll('.expansion-panel').forEach(function(ep) {
            ep.classList.remove('expanded');
            var c = ep.querySelector('.expansion-panel-content');
            if (c) c.classList.remove('expanded');
        });

        currentCycleIndex = 0;
    }

    // ── Initial state application ─────────────────────────────────────────────
    function applyInitialState() {
        if (!initialSequence || !initialSequence.length) return;
        initialSequence.forEach(function(step) { _executeStep(step); });
    }

    // Execute a single step (used both for initial state and in auto-cycle)
    function _executeStep(step) {
        if (step.isCssSelector && step.selector) {
            executeSelectorAction(step.selector, step.action, step.value, step.delay, step.noHighlight);
            return;
        }
        var sidebar = step.sidebar;
        var action  = step.action;
        var value   = step.value;

        if (sidebar && sidebar.indexOf('viewer-') === 0) {
            dispatchViewerAction(sidebar, value);
            return;
        }
        if (sidebar === 'pause') return;

        // Sidebar shorthand actions
        if (action === 'show' || !action)          { activateSidebar(sidebar); }
        else if (action === 'select-tab')          { activateSidebar(sidebar, value); }
        else if (action === 'open-panel')          {
            if (currentSidebar !== sidebar) activateSidebar(sidebar);
            var panel = wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]');
            if (panel) {
                var ep = panel.querySelector('.expansion-panel:not(.disabled)');
                if (ep) { ep.classList.add('expanded'); var c = ep.querySelector('.expansion-panel-content'); if (c) c.classList.add('expanded'); }
            }
        }
        else if (action === 'select-dropdown')     { _sidebarSelectDropdown(sidebar, value); }
        else if (action === 'click-button')        { _sidebarClickButton(sidebar, value); }
        else if (action === 'highlight')           { _sidebarHighlight(sidebar, value); }
        else if (action === 'open-data-menu')      { executeViewerOpenDataMenu(null); }
    }

    // Sidebar-scoped dropdown selection helper
    function _sidebarSelectDropdown(sidebar, value) {
        if (!value || value.indexOf(':') === -1) return;
        var parts = value.split(':');
        var targetLabel = parts[0].trim().toLowerCase();
        var targetValue = parts.slice(1).join(':').trim().toLowerCase();
        var panel = wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]');
        if (!panel) return;
        panel.querySelectorAll('select').forEach(function(dropdown) {
            var label = dropdown.previousElementSibling;
            if (label && label.textContent.trim().toLowerCase().indexOf(targetLabel) !== -1) {
                for (var i = 0; i < dropdown.options.length; i++) {
                    if (dropdown.options[i].text.trim().toLowerCase() === targetValue ||
                        (dropdown.options[i].value || '').trim().toLowerCase() === targetValue) {
                        dropdown.selectedIndex = i;
                        dropdown.style.background = 'rgba(199, 93, 44, 0.3)';
                        (function(d) { setTimeout(function() { d.style.background = ''; }, 800); }(dropdown));
                        break;
                    }
                }
            }
        });
    }

    function _sidebarClickButton(sidebar, value) {
        var panel = wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]');
        if (!panel || !value) return;
        panel.querySelectorAll('button.wireframe-button').forEach(function(btn) {
            if (btn.textContent.trim().toLowerCase() === value.toLowerCase()) {
                btn.style.background = 'rgba(199, 93, 44, 0.8)';
                (function(b) { setTimeout(function() { b.style.background = ''; }, 400); }(btn));
            }
        });
    }

    function _sidebarHighlight(sidebar, value) {
        if (!value) return;
        var panel = (wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]')) || container;
        panel.querySelectorAll(value).forEach(function(el) {
            el.classList.add('highlighted');
            currentHighlightedElements.push(el);
        });
    }

    // ── Auto-cycle engine ──────────────────────────────────────────────────────
    function autoCycleSidebars() {
        if (!autoCycling) return;

        if (demoSequence.length > 0 && currentCycleIndex < demoSequence.length) {
            var step    = demoSequence[currentCycleIndex];
            var sidebar = step.sidebar;
            var action  = step.action;
            var value   = step.value;

            function moveToNextStep() {
                var d = (typeof step.delay === 'number') ? step.delay : 2000;
                currentCycleIndex++;
                if (currentCycleIndex < demoSequence.length) {
                    setTimeout(autoCycleSidebars, d);
                } else if (demoRepeat) {
                    setTimeout(function() {
                        resetDemoState();
                        if (initialSequence && initialSequence.length) applyInitialState();
                        autoCycleSidebars();
                    }, d + 1000);
                } else {
                    autoCycling = false;
                    updateCycleControlButton();
                }
            }

            // viewer-* and pause: execute immediately and advance
            if (sidebar === 'pause') { moveToNextStep(); return; }
            if (sidebar && sidebar.indexOf('viewer-') === 0) {
                dispatchViewerAction(sidebar, value);
                // For tool-toggle, also highlight the icon
                if (sidebar === 'viewer-tool-toggle' && !step.noHighlight) {
                    var params = value ? value.split(':') : [];
                    if (params[0] && params[1]) {
                        var toolIcon = executeViewerToolToggle(params[0], params[1]);
                        if (toolIcon) briefHighlight(toolIcon, step.delay);
                    }
                }
                moveToNextStep();
                return;
            }

            // CSS selector steps: execute immediately and advance
            if (step.isCssSelector && step.selector) {
                // Clear previous highlights
                currentHighlightedElements.forEach(function(el) { el.classList.remove('highlighted'); });
                currentHighlightedElements = [];
                var el = executeSelectorAction(step.selector, action, value, step.delay, step.noHighlight);
                if (el && !step.noHighlight) briefHighlight(el, step.delay);
                moveToNextStep();
                return;
            }

            // Sidebar shorthand steps
            // Clear highlights at start of new step
            currentHighlightedElements.forEach(function(el) { el.classList.remove('highlighted'); });
            currentHighlightedElements = [];

            // Determine whether we need to open or switch the sidebar
            var standaloneActions = ['open-data-menu', 'highlight'];
            var isStandalone = standaloneActions.indexOf(action) !== -1;
            var needsSidebarChange = !isStandalone && (action === 'show' || !action || currentSidebar !== sidebar);

            if (needsSidebarChange) {
                if (action === 'select-tab') {
                    activateSidebar(sidebar, value);
                } else {
                    activateSidebar(sidebar);
                }
            }

            var actionDelay = needsSidebarChange ? 350 : 0;
            setTimeout(function() {
                if (!autoCycling) return;
                currentHighlightedElements.forEach(function(el) { el.classList.remove('highlighted'); });
                currentHighlightedElements = [];

                if (action === 'open-panel') {
                    var panel = wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]');
                    if (panel) {
                        var ep = panel.querySelector('.expansion-panel:not(.disabled)');
                        if (ep) {
                            ep.classList.add('expanded');
                            var c = ep.querySelector('.expansion-panel-content');
                            if (c) c.classList.add('expanded');
                            if (!step.noHighlight) briefHighlight(ep, step.delay);
                        }
                    }
                } else if (action === 'select-dropdown') {
                    _sidebarSelectDropdown(sidebar, value);
                    var panel = wireframeSidebar && wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebar + '"]');
                    if (panel && !step.noHighlight) {
                        var activeSelect = panel.querySelector('select');
                        if (activeSelect) briefHighlight(activeSelect, step.delay);
                    }
                } else if (action === 'click-button') {
                    _sidebarClickButton(sidebar, value);
                } else if (action === 'open-data-menu') {
                    executeViewerOpenDataMenu(null);
                } else if (action === 'highlight' && value) {
                    container.querySelectorAll(value).forEach(function(el) {
                        el.classList.add('highlighted');
                        currentHighlightedElements.push(el);
                    });
                }

                moveToNextStep();
            }, actionDelay);
            return;
        }

        // Fallback simple sidebar order cycling (no custom demo sequence)
        if (!autoCycling) return;
        var sidebarType = sidebarOrder[currentCycleIndex % sidebarOrder.length];
        if (!sidebarType || !wireframeSidebar) return;

        var panel = wireframeSidebar.querySelector('[data-sidebar-panel="' + sidebarType + '"]');
        var tabs  = panel ? panel.querySelectorAll('.wireframe-sidebar-tab') : [];

        if (tabs.length > 1) {
            var numTabs = tabs.length;
            var tabIdx  = 0;
            activateSidebar(sidebarType, 0);
            var tabCycleInterval = setInterval(function() {
                if (!autoCycling) { clearInterval(tabCycleInterval); return; }
                tabIdx++;
                if (tabIdx < numTabs) {
                    activateSidebar(sidebarType, tabIdx);
                } else {
                    clearInterval(tabCycleInterval);
                    currentCycleIndex = (currentCycleIndex + 1) % sidebarOrder.length;
                    setTimeout(autoCycleSidebars, 2000);
                }
            }, 2000);
        } else {
            activateSidebar(sidebarType);
            currentCycleIndex = (currentCycleIndex + 1) % sidebarOrder.length;
            setTimeout(autoCycleSidebars, 3000);
        }
    }

    function restartAutoCycle() {
        if (cycleInterval) { clearInterval(cycleInterval); cycleInterval = null; }
        resetDemoState();
        if (initialSequence && initialSequence.length) {
            applyInitialState();
            setTimeout(function() {
                autoCycling = true; currentCycleIndex = 0; hasStartedCycling = true;
                updateCycleControlButton(); autoCycleSidebars();
            }, 1000);
        } else {
            autoCycling = true; currentCycleIndex = 0; hasStartedCycling = true;
            updateCycleControlButton(); autoCycleSidebars();
        }
    }

    // ── Visibility-based auto-start ────────────────────────────────────────────
    function checkWireframeInView() {
        if (!autoCycling || hasStartedCycling) return;
        var rect = container.getBoundingClientRect();
        var wh   = window.innerHeight || document.documentElement.clientHeight;
        if (rect.top >= 0 && rect.bottom <= wh) {
            hasStartedCycling = true;
            if (initialSequence && initialSequence.length) applyInitialState();
            autoCycleSidebars();
        }
    }
    window.addEventListener('scroll', checkWireframeInView);
    window.addEventListener('resize', checkWireframeInView);
    setTimeout(checkWireframeInView, 1000);

    // ── Toolbar icon click handlers ────────────────────────────────────────────
    if (enableOnly) {
        wireframeIcons.forEach(function(icon) {
            var st = icon.dataset.sidebar;
            if (st && enableOnly.indexOf(st) === -1) {
                icon.style.opacity = '0.3';
                icon.style.cursor = 'not-allowed';
                icon.style.pointerEvents = 'none';
            }
        });
    }

    wireframeIcons.forEach(function(icon) {
        if (!showScrollTo && icon.classList.contains('mouseover-button')) {
            icon.style.opacity = '0.3'; icon.style.cursor = 'not-allowed';
            icon.style.pointerEvents = 'none'; icon.classList.add('disabled');
        }
        icon.addEventListener('click', function(e) {
            if (e.isTrusted) stopAutoCycle();

            if (icon.classList.contains('api-button')) {
                icon.classList.toggle('active');
                return;
            }

            if (icon.classList.contains('mouseover-button')) {
                var scrollTarget = icon.dataset.scrollTarget;
                var targetEl = scrollTarget ? document.querySelector('[data-grid-id="' + scrollTarget + '"]') : null;
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTimeout(function() {
                        document.querySelectorAll('.grid-item.highlighted').forEach(function(el) { el.classList.remove('highlighted'); });
                        targetEl.classList.add('highlighted');
                        setTimeout(function() { targetEl.classList.remove('highlighted'); }, 3000);
                    }, 500);
                }
                return;
            }

            var sidebarType = icon.dataset.sidebar;
            if (!sidebarType) return;
            if (currentSidebar === sidebarType) {
                if (wireframeSidebar) wireframeSidebar.classList.remove('visible');
                icon.classList.remove('active');
                currentSidebar = null;
            } else {
                activateSidebar(sidebarType);
            }
        });
    });

    // ── Cycle control button ──────────────────────────────────────────────────
    var cycleControlButton = container.querySelector('.wireframe-cycle-control');
    if (cycleControlButton) {
        cycleControlButton.addEventListener('mouseenter', function() {
            cycleControlButton.setAttribute('data-flyout-text', autoCycling ? 'pause demo' : 'restart demo');
        });
        cycleControlButton.addEventListener('click', function() {
            if (autoCycling) { stopAutoCycle(); cycleControlButton.setAttribute('data-flyout-text', 'restart demo'); }
            else             { restartAutoCycle(); cycleControlButton.setAttribute('data-flyout-text', 'pause demo'); }
        });
    }

    container.addEventListener('click', function(e) {
        if (e.isTrusted && e.target.closest('.wireframe-toolbar-icon, .wireframe-sidebar-tab, .wireframe-sidebar-link')) {
            stopAutoCycle();
        }
    });

    // ── Data menu popup ───────────────────────────────────────────────────────
    var dataMenuPopup = container.querySelector('#data-menu-popup');
    var dataMenuClose = container.querySelector('#data-menu-close');

    function positionDataMenuPopup(triggerEl) {
        if (!dataMenuPopup) return;
        var viewerArea = container.querySelector('.wireframe-viewer-area');
        if (!viewerArea) return;
        var vaRect = viewerArea.getBoundingClientRect();
        var pw = dataMenuPopup.offsetWidth  || 350;
        var ph = dataMenuPopup.offsetHeight || 300;
        var top, left;
        if (triggerEl) {
            var tr = triggerEl.getBoundingClientRect();
            top  = tr.top  - vaRect.top;
            left = tr.left - vaRect.left - pw - 8;
        } else {
            top  = (vaRect.height - ph) / 2;
            left = (vaRect.width  - pw) / 2;
        }
        if (top < 8) top = 8;
        if (top + ph > vaRect.height - 8) { top = vaRect.height - ph - 8; if (top < 8) top = 8; }
        if (left < 8) {
            if (triggerEl) { var tr2 = triggerEl.getBoundingClientRect(); left = tr2.right - vaRect.left + 8; }
            else left = 8;
        }
        dataMenuPopup.style.top  = top  + 'px';
        dataMenuPopup.style.left = left + 'px';
    }

    if (dataMenuPopup && dataMenuClose) {
        container.addEventListener('click', function(e) {
            var trigger = e.target.closest('.data-menu-trigger');
            if (trigger && container.contains(trigger)) {
                e.stopPropagation();
                if (e.isTrusted) stopAutoCycle();
                if (dataMenuPopup.classList.contains('visible')) {
                    dataMenuPopup.classList.remove('visible');
                } else {
                    positionDataMenuPopup(trigger);
                    dataMenuPopup.classList.add('visible');
                }
            }
        });
        dataMenuClose.addEventListener('click', function() { dataMenuPopup.classList.remove('visible'); });
        if (!showScrollTo) {
            dataMenuPopup.querySelectorAll('[data-scroll-target]').forEach(function(link) { link.style.display = 'none'; });
        }
        _bindScrollLinks(dataMenuPopup);
        document.addEventListener('click', function(e) {
            if (!dataMenuPopup.contains(e.target) && !e.target.closest('.data-menu-trigger')) {
                dataMenuPopup.classList.remove('visible');
            }
        });
    }

    // ── Search bar ─────────────────────────────────────────────────────────────
    var searchInput = container.querySelector('#wireframe-search-input');
    if (searchInput) {
        searchInput.addEventListener('click', function() {
            stopAutoCycle();
            var btn = document.querySelector('button.search-button, .search-button, button[aria-label="Search"], button[data-bs-toggle="search"]');
            if (btn) { btn.click(); }
            else {
                var inp = document.querySelector('input[type="search"], input.search-input, #searchbox input');
                if (inp) inp.focus();
            }
        });
    }

    // ── Description toggle (optional, app-defined element) ────────────────────
    var descToggle = container.querySelector('#description-toggle');
    var descMore   = container.querySelector('#description-more');
    if (descToggle && descMore) {
        descToggle.addEventListener('click', function() {
            stopAutoCycle();
            descMore.classList.toggle('expanded');
            descToggle.textContent = descMore.classList.contains('expanded') ? 'Show Less' : 'Show More';
        });
    }
}

// ── Entry points ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() { initializeWireframeEngine(); });
document.addEventListener('wireframe-loaded',  function() { initializeWireframeEngine(); });

// Grid item expand/collapse toggles (landing page utility — app-agnostic)
function initializeGridItemToggles() {
    document.querySelectorAll('.grid-item').forEach(function(item) {
        var content = item.querySelector('.grid-item-content');
        if (!content || content.scrollHeight <= 300) return;
        item.classList.add('has-toggle');
        var btn = document.createElement('button');
        btn.className   = 'toggle-more';
        btn.textContent = 'Show More';
        content.style.maxHeight = '300px';
        content.style.overflow  = 'hidden';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var expanded = item.classList.contains('expanded');
            if (expanded) { item.classList.remove('expanded'); content.style.maxHeight = '300px'; btn.textContent = 'Show More'; }
            else          { item.classList.add('expanded');    content.style.maxHeight = 'none';  btn.textContent = 'Show Less'; }
        });
        item.appendChild(btn);
    });
}
document.addEventListener('DOMContentLoaded', initializeGridItemToggles);
