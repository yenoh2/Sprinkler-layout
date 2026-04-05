# Sprinkler Layout Tool — UX Improvement Analysis

> [!NOTE]
> This audit focuses on the user-facing experience: workflows, feedback, discoverability, interaction patterns, and accessibility. Findings are ranked by impact: **High → Medium → Low**.

---

## 1. Discovery & Onboarding

### 1.1 🔴 No guided first-use workflow
**Impact:** High

A new user lands on a blank canvas with all tool buttons visible but no walking onboarding. The only hint is a small static string at the bottom:

```
"Import a yard image to start."
```

The overlay warning in [renderer.js:971](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js#L969-L995) displays `"Scale not calibrated."` and `"Supply line size and pressure required."` sequentially, but there's no step-by-step guidance (e.g., "Step 1: Import → Step 2: Calibrate → Step 3: Set hydraulics → Step 4: Place heads").

**Recommendation:** Add a lightweight "Getting Started" checklist overlay or status stepper in the sidebar that tracks completion of the three prerequisites (import, calibrate, hydraulics), then auto-dismisses. The status pills already partially do this — surface them as an interactive workflow.

---

### 1.2 🟠 Tool buttons have no tooltips or shortcut hints
**Impact:** Medium

The 10 tool buttons in [index.html:22-31](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L22-L31) display only text labels (`Select`, `Place`, `Pipe`, etc.) with no `title` attribute or tooltip overlay. There are no keyboard shortcuts to switch tools, and no shortcut hints displayed on the undo/redo/save/export buttons. Users must click to discover functionality.

**Recommendation:**
- Add `title="..."` or a custom tooltip with the shortcut key to each button
- Implement single-key tool shortcuts (e.g., `V` = Select, `P` = Place, `L` = Pipe, `W` = Wire, `M` = Measure, `C` = Calibrate, `H` = Pan)
- Show modifier-key hints on action buttons (e.g., "Undo (Ctrl+Z)")

---

### 1.3 🟠 Silent failure on uncalibrated clicks
**Impact:** Medium

When the user clicks the canvas with Place, Pipe, Wire, Valve Box, or Controller tools before calibrating, the click is silently consumed:

```js
// interactions.js:52-53
if (!state.scale.calibrated) {
    return;  // ← nothing happens, no feedback
}
```

This pattern repeats at [lines 52](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L52), [101](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L101), [157](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L157), [219](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L219), and [234](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L234). The user clicks repeatedly and nothing happens, with no indication of why.

**Recommendation:** Flash the "Scale not calibrated" status pill, shake the calibration panel header, or set the hint text to "Calibrate scale before placing elements."

---

### 1.4 🟡 Placement defaults are not discoverable
**Impact:** Low

When placing a sprinkler, the default radius is a hardcoded `12` (see [interactions.js:90](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L90)). The default sweep for arcs is `180°`. Default strip dimensions are `15 × 4`. These are reasonable but there's no way to pre-configure them before placing. Users must place first, select, then edit — creating extra steps for repetitive layouts.

**Recommendation:** Add "placement defaults" fields alongside the placement pattern selector (e.g., a radius field that appears when Place tool is active), or allow the last-used values to persist for subsequent placements.

---

## 2. Feedback & Responsiveness

### 2.1 🔴 No visual snap indicator on canvas
**Impact:** High

The pipe and wire snap system ([interactions.js:1163-1289](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L1163-L1289)) uses a `PIPE_SNAP_SCREEN_PX = 12` pixel radius to snap to nearby points (sprinklers, valve boxes, pipe vertices). However, the renderer **never draws a snap indicator** — no highlight ring, no crosshair, no "magnetized" visual. The user can't tell if they've successfully snapped to a node or placed a free-floating point.

**Recommendation:** Draw a pulsing ring or snap-target highlight when the cursor is within snap range of a candidate. The snap result already contains the matched source, so the renderer just needs to receive it and draw a highlight at the snap point.

---

### 2.2 🟠 No progress indicator during image loading
**Impact:** Medium

When loading a yard image ([main.js:33-52](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L33-L52)), the `FileReader.readAsDataURL` operation runs asynchronously. For large images (5MB+ phone photos), there's a noticeable delay. During this time, the UI gives no loading spinner, progress bar, or "Processing image..." message.

Similarly, loading a saved JSON project ([panels.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/ui/panels.js)) has no loading state.

**Recommendation:** Show a lightweight overlay or progress indicator on the canvas during file I/O operations.

---

### 2.3 🟠 Error messages use native `alert()` dialogs
**Impact:** Medium

Six locations in [panels.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/ui/panels.js) use `alert()`:
- Calibration validation failure (line 298)
- Rectification validation failures (lines 324, 344, 364, 398)
- Invalid fitting placement (line 769)

Native `alert()` is jarring, blocks the thread, and breaks visual consistency with the warm design system. Similarly, `window.confirm()` is used for destructive actions (zone deletion, rectification application).

**Recommendation:** Replace with inline toast notifications or a styled modal component that matches the app's design language.

---

### 2.4 🟠 No undo/redo feedback
**Impact:** Medium

When the user presses Ctrl+Z or clicks Undo, the state rolls back silently. There's no toast/flash ("Undo: Moved sprinkler"), and since the undo stack uses full state snapshots, there are no action descriptions to display.

The history summary ([index.html:247](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L247)) shows `"0 undo / 0 redo"` but gives no information about what each step contains.

**Recommendation:** Store a short description string with each history entry (e.g., "Placed sprinkler", "Moved valve box") and show it in a transient toast or update the history summary text.

---

### 2.5 🟡 No visual cursor coordinate on canvas
**Impact:** Low

The status bar shows cursor coordinates in raw pixels (`Cursor: 412.33, 289.65 ft`) but these values **are in world-image pixels** only converted to unit labels. For the canvas itself, there's no crosshair or coordinate label near the cursor. On large plans, the user's eye must jump from the canvas to the bottom toolbar to check their position.

**Recommendation:** Optionally render a small coordinate label near the cursor itself, especially when the Measure tool is active.

---

### 2.6 🟡 Autosave failure is completely invisible
**Impact:** Low

When `localStorage.setItem()` throws `QuotaExceededError` (common with large base64 background images), the autosave silently catches the error:

```js
// persistence.js:20-31
try {
    localStorage.setItem(key, JSON.stringify(state));
} catch (error) {
    console.warn("Autosave failed:", error);
}
```

The user has no idea their work isn't being saved.

**Recommendation:** Show a persistent warning banner in the status bar when autosave fails, e.g., "⚠ Autosave failed — save your project manually."

---

## 3. Interaction Model

### 3.1 🔴 No keyboard shortcuts for tool switching
**Impact:** High

The tool palette has 10 modes but the only keyboard shortcuts are:
- `Ctrl+Z` / `Ctrl+Y` — Undo/Redo
- `Ctrl+C` / `Ctrl+V` — Copy/paste sprinkler
- `Delete` / `Backspace` — Delete selected
- `Enter` — Commit pipe/wire draft
- `Escape` — Cancel draft / clear calibration
- `Space` — Temporary pan

No single-key shortcuts exist for tool switching (e.g., `S` for Select, `P` for Place). This forces constant mouse trips to the toolbar, which is significant friction for power users.

**Recommendation:** Assign mnemonic keys to each tool. This is one of the highest-ROI improvements for workflow speed.

---

### 3.2 🟠 Delete key has a hidden priority cascade
**Impact:** Medium

When the user presses Delete ([main.js:107-156](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L107-L156)), the handler checks 8 conditions in priority order:
1. Selected pipe vertex → delete vertex
2. Selected wire vertex → delete vertex
3. Selected pipe run → delete entire run
4. Selected wire run → delete entire run
5. Selected sprinkler → delete
6. Selected valve box → delete
7. Selected controller → delete
8. Selected fitting → delete

The user has no way to know which entity will be deleted. If they have both a pipe vertex and a sprinkler selected (which shouldn't normally happen but could via stale state), the behavior is unpredictable.

**Recommendation:** Show the "focused" entity name in the selection panel title and ensure Delete only targets the visible selection. Consider adding a confirmation for non-trivial deletions (e.g., deleting a pipe run with fittings).

---

### 3.3 🟠 No multi-select or batch operations
**Impact:** Medium

Only one entity can be selected at a time (one sprinkler OR one pipe run OR one valve box, etc.). Operations like "select 5 sprinklers and change their zone" or "select all unassigned heads and assign them to Zone 1" require individually selecting and editing each one.

**Recommendation:** Support Shift-click to add to selection and implement batch property changes in the details panel.

---

### 3.4 🟠 Copy/paste only works for sprinklers
**Impact:** Medium

`Ctrl+C` / `Ctrl+V` only operates on sprinklers ([main.js:276-324](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L276-L324)). Copying a valve box, controller, pipe run, wire run, or fitting is not supported. There's no visual confirmation that copy succeeded.

**Recommendation:** Extend copy/paste to all entity types, or at minimum show a brief toast confirming the copy.

---

### 3.5 🟡 No right-click context menu
**Impact:** Low

Right-click is consumed entirely by the pan handler ([interactions.js:1359-1361](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/interactions.js#L1359-L1361)):

```js
function shouldStartPan(event, activeTool, isSpacePressed) {
    return activeTool === "pan" || event.button === 1 || event.button === 2 || ...
}
```

There's no context menu for quick actions (Delete, Duplicate, Assign to Zone, Change Pattern). Users who right-click expecting a menu get pan mode instead.

**Recommendation:** Reserve right-click for a context menu (with Shift+right-click or middle-click for pan), or use a long-press gesture on the selected entity.

---

### 3.6 🟡 Sprinkler duplication via button only — not on canvas
**Impact:** Low

The "Duplicate" button is in the selection panel ([index.html:396](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L396)). It duplicates the selected sprinkler but the clone appears at an offset from the original. There's no way to Alt-drag to duplicate (a common CAD pattern), and the paste offset logic adds `+ offset` in world pixels, not calibrated units:

```js
// main.js:304-305
x: basePoint.x + offset,
y: basePoint.y + offset,
```

**Recommendation:** Support Alt+drag to duplicate a sprinkler at the drop location. Use calibrated units for paste offset.

---

## 4. Information Architecture

### 4.1 🔴 Sidebar panels require excessive scrolling
**Impact:** High

The left sidebar contains 5 panels stacked vertically (Project, Calibration, Hydraulics, View, Analysis, History), and the right sidebar has 3 (Selected Item, Zones, Project Summary). On a 1080p display, the user must scroll extensively to reach the bottom panels. The View panel alone has 9 checkboxes + a slider + a legend.

The panels are always visible regardless of context — e.g., the Calibration panel with its "Reference width" and "Reference height" fields is fully visible even when the user is in the Place tool routing sprinklers.

**Recommendation:** 
- Collapse panels by default and expand on click (accordion pattern)
- Context-collapse: auto-expand panels relevant to the active tool (e.g., show Calibration when Calibrate tool is active)
- Move infrequently-used options (rectification, history) into a settings flyout

---

### 4.2 🟠 Zone list fully re-renders on every state change
**Impact:** Medium

The `renderZonesList()` function in [panels.js:1650-1797](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/ui/panels.js#L1650-L1797) rebuilds the entire zone list HTML and re-attaches all event listeners on each render pass. The only optimization is the `buildZonesListRenderKey()` check, which serializes the entire zone state to JSON to compare. With many zones, this creates DOM thrash and can cause input focus loss if the user is mid-type in a zone name field.

**Recommendation:** Use a diffing strategy that only updates changed zones, or use a lightweight virtual DOM approach for the zone list.

---

### 4.3 🟠 Coordinate fields show raw world pixels, not meaningful units
**Impact:** Medium

When a sprinkler is selected, the X/Y fields show values like `"412.33"` and `"289.65"` — these are in **image pixels**, not calibrated feet or meters. The field labels just say "X" and "Y" with no unit indicator. Unless the user knows the scale conversion, these numbers are meaningless for manual positioning.

**Recommendation:** Either display coordinates in calibrated units (ft/m) with a unit label, or at minimum add a "(px)" suffix so the user understands the coordinate space.

---

### 4.4 🟠 Fitting anchor displays raw UUIDs
**Impact:** Medium

When a fitting is selected, the anchor field shows strings like:

```
Sprinkler 3f8a2b4c-1d9e-4fa7-8b2c-...
Pipe e7b19c3d-5a4f-... vertex 3
```

These UUIDs are meaningless to the user. If the sprinkler or pipe has a label, that should be shown instead.

**Recommendation:** Resolve UUIDs to human-readable labels: `"Sprinkler → Head A3 (Zone 1)"` or `"Pipe → Main supply, vertex 3"`.

---

### 4.5 🟡 No "scroll to selection" or "zoom to selection"
**Impact:** Low

When the user clicks a zone card or selects a sprinkler from the panel, the canvas doesn't pan to center on the selected entity. On a large, zoomed-in plan, the selected item may be entirely off-screen.

**Recommendation:** Add auto-center-on-selection (or a "Zoom to" button per entity) so the user can quickly locate the selected item.

---

### 4.6 🟡 Project summary is tabular text, not interactive
**Impact:** Low

The Project Summary panel ([index.html:580-583](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L580-L583)) shows read-only stats. None of the summary items link to the relevant entities. Clicking "Heads: 12" doesn't show or filter those heads.

**Recommendation:** Make summary items clickable to filter or highlight the relevant entities on the canvas.

---

## 5. Accessibility & Polish

### 5.1 🟠 No skip-navigation or landmark structure
**Impact:** Medium

The HTML has no `<main>` landmark (the `<main>` serves as the layout screen container but has `id="layout-screen"` without proper role separation), no skip-nav link, and sections aren't labeled with `aria-label` except the fittings panel. Screen reader users have no way to jump between the toolbar, canvas, left sidebar, and right sidebar.

**Recommendation:** Add `role="navigation"` to the toolbar, properly landmark the sidebars with `aria-label`, and add a `<a href="#sprinkler-canvas" class="skip-link">Skip to canvas</a>`.

---

### 5.2 🟠 Canvas has no keyboard focus indicator
**Impact:** Medium

The canvas element has no `tabindex` and can't receive keyboard focus. When focused (e.g., after clicking), there's no visible focus ring. Space-to-pan works only because it's attached to `window.keydown`, not the canvas itself. Keyboard-only users cannot interact with the canvas at all.

**Recommendation:** Add `tabindex="0"` to the canvas, add a `:focus-visible` outline style, and ensure all canvas interactions are also available via keyboard.

---

### 5.3 🟡 No touch/mobile support
**Impact:** Low

The interaction controller uses `pointer` events (which technically support touch), but the interaction model requires:
- Hover (`pointermove` without press for snap/preview)
- Right-click (for pan)
- `event.detail >= 2` for double-click to commit pipe drafts
- Mouse wheel for zoom

None of these have touch alternatives (pinch-to-zoom, long-press for context menu, etc.). The responsive CSS exists but the interaction model would be unusable on touch devices.

**Recommendation:** This is a desktop-first professional tool and touch support may be out of scope, but at minimum consider pinch-to-zoom via wheel event translation.

---

### 5.4 🟡 Parts list has no export-to-CSV button
**Impact:** Low

The Parts screen has a well-structured table ([panels.js:2320-2380](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/ui/panels.js#L2320-L2380)) with categories, items, quantities, and zone usage. But there's no way to export this data to CSV or clipboard for a purchasing list. Users must manually copy from the table.

**Recommendation:** Add "Copy to Clipboard" and "Export CSV" buttons above the parts table.

---

### 5.5 🟡 No dark mode or high-contrast option
**Impact:** Low

The design system uses a warm parchment palette baked into both CSS variables and canvas rendering. There's no dark mode toggle. For extended use (common for professional layout work), a dark theme would reduce eye strain. The canvas background `#f6f1e4` is particularly bright.

**Recommendation:** Add a `prefers-color-scheme` media query or a manual toggle. This requires the CSS variable / JS canvas color centralization recommended in the architecture audit.

---

## Summary Table

| # | Impact | Category | Issue |
|---|---|---|---|
| 1.1 | 🔴 High | Onboarding | No guided first-use workflow or interactive setup checklist |
| 1.2 | 🟠 Medium | Onboarding | Tool buttons lack tooltips and keyboard shortcut hints |
| 1.3 | 🟠 Medium | Onboarding | Silent failure when clicking canvas before calibration |
| 1.4 | 🟡 Low | Onboarding | Placement defaults not pre-configurable |
| 2.1 | 🔴 High | Feedback | No visual snap indicator when pipe/wire approaches a node |
| 2.2 | 🟠 Medium | Feedback | No progress indicator during image/project loading |
| 2.3 | 🟠 Medium | Feedback | Native alert() dialogs break design consistency |
| 2.4 | 🟠 Medium | Feedback | No undo/redo action description or feedback toast |
| 2.5 | 🟡 Low | Feedback | No on-canvas coordinate label near cursor |
| 2.6 | 🟡 Low | Feedback | Silent autosave failure with no user warning |
| 3.1 | 🔴 High | Interaction | No keyboard shortcuts for tool switching |
| 3.2 | 🟠 Medium | Interaction | Delete key has hidden 8-level priority cascade |
| 3.3 | 🟠 Medium | Interaction | No multi-select or batch editing |
| 3.4 | 🟠 Medium | Interaction | Copy/paste only works for sprinklers |
| 3.5 | 🟡 Low | Interaction | Right-click consumed for pan, no context menu |
| 3.6 | 🟡 Low | Interaction | No Alt+drag to duplicate on canvas |
| 4.1 | 🔴 High | Information | Sidebar panels require excessive scrolling, no collapse |
| 4.2 | 🟠 Medium | Information | Zone list fully re-renders, causing DOM thrash |
| 4.3 | 🟠 Medium | Information | X/Y coordinates in raw pixels, not calibrated units |
| 4.4 | 🟠 Medium | Information | Fitting anchor displays raw UUIDs instead of labels |
| 4.5 | 🟡 Low | Information | No scroll-to or zoom-to selected entity |
| 4.6 | 🟡 Low | Information | Project summary not interactive |
| 5.1 | 🟠 Medium | Accessibility | No skip-nav, limited landmark structure |
| 5.2 | 🟠 Medium | Accessibility | Canvas has no focus indicator or keyboard access |
| 5.3 | 🟡 Low | Accessibility | No touch/mobile interaction support |
| 5.4 | 🟡 Low | Polish | Parts list not exportable to CSV/clipboard |
| 5.5 | 🟡 Low | Polish | No dark mode or high-contrast theme option |
