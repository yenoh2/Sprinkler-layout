# Sprinkler Layout Tool — Full Project Analysis

> [!NOTE]
> This analysis covers all source files across `src/`, `state/`, `canvas/`, `ui/`, `geometry/`, `analysis/`, and `io/`. Findings are ranked by impact: **Critical → Important → Polish**.

---

## Critical: Hardcoded Values That Should Be Dynamic

### 1. `scopeMode` sanitizer is a no-op
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L1351-L1354)

```js
if ("scopeMode" in patch) {
    sanitized.scopeMode = patch.scopeMode === "included_zones_only"
      ? "included_zones_only"
      : "included_zones_only";  // ← both branches return the same value
}
```

Both branches of the ternary return `"included_zones_only"`, meaning this "filter" does nothing — any input is silently coerced. This is either dead code left from a plan to add more scope modes, or an oversight. **If other scope modes are planned** (e.g. `"all_zones"`), the else-branch should default differently. If not, the whole conditional is misleading boilerplate.

---

### 2. `normalizeWireKind()` always returns `"multiconductor"`
**File:** [wires.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/geometry/wires.js#L3-L5)

```js
export function normalizeWireKind(value) {
  return value === "multiconductor" ? "multiconductor" : "multiconductor";
}
```

Identical to the `scopeMode` issue — no matter what value is passed, the result is always `"multiconductor"`. If single-conductor wire or direct-burial wire types are ever planned, this will silently swallow them.

---

### 3. Undo/redo stack has no depth limit
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L210-L211)

```js
next.history.undoStack = [...state.history.undoStack, cloneProjectSnapshot(state)];
next.history.redoStack = [];
```

Every undoable action pushes a **full `structuredClone`** of the entire state onto the undo stack, with no cap. On a large project (hundreds of sprinklers + pipe runs + background data URL), this will cause **unbounded memory growth** and eventual browser tab crash. A typical fix is capping the stack (e.g. `MAX_UNDO_DEPTH = 50`) and shifting old entries off.

---

### 4. `FALLBACK_DATABASE` duplicated between two files
**Files:**
- [sprinkler_data.json](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/sprinkler_data.json)
- [sprinkler-database.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/analysis/sprinkler-database.js#L1-L99)

The entire Rain Bird database is copy-pasted into two locations. The `sprinkler-database.js` fallback is **missing several nozzle series** that exist in the JSON (the `mpr_series_fixed`, all strip nozzles, and the `van_series_variable_arc` 18-VAN entry). If the JSON fetch fails, users silently get an incomplete database with no warning in the UI. These should be unified to a single source of truth.

---

### 5. Brand names hardcoded as string literals throughout analysis
**File:** [irrigation-analysis.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/analysis/irrigation-analysis.js) — 30+ instances

```js
body: "Rain Bird 1800 PRS",   // lines 498, 515, 532, 552, 571
body: "Rain Bird 5004 PRS",   // lines 1016, 1043, 1056
body: "Rain Bird 3504",       // line 1083
```

Body/brand strings are scattered as raw string literals across `recommendSpray()`, `recommendStripSpray()`, `buildRotorCandidatesForHead()`, etc. If a second brand or product line is ever added, every occurrence must be found and updated. These should be constants or derived from the database itself (e.g. `database.rotor_series.rain_bird_5004_prs.name`).

---

## Important: Should Be Dynamic / Configurable

### 6. Canvas background color hardcoded in two places
**Files:**
- [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js#L58-L59): `ctx.fillStyle = "#f6f1e4";`
- [styles.css](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/styles.css#L511): `background: #f6f1e4;`

This warm-parchment color isn't a CSS variable — it's hardcoded in both the canvas renderer JS (for the clear fill) and the CSS canvas element style. If the theme changes, two locations must be updated and they can drift.

---

### 7. Font family duplicated as raw strings in all canvas drawing
**File:** [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)

The string `"Aptos, Segoe UI, sans-serif"` (and `"12px Aptos, Segoe UI, sans-serif"`, `"11px Aptos..."`, `"13px Aptos..."`, `"bold 8px Aptos..."`, `"bold 13px Aptos..."`) appears in **25+ places** throughout the renderer. CSS uses `var(--font-body)` but the canvas `ctx.font` assignments can't consume CSS vars. These should be extracted to a shared constant like:

```js
const CANVAS_FONT_BODY = "Aptos, Segoe UI, sans-serif";
```

---

### 8. Design-system colors duplicated between CSS variables and JS
**File:** [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)

The CSS defines `--ink: #2f2418`, `--accent: #b65c2a`, `--muted: #776655`, etc. But the canvas renderer uses identical hex values as raw string literals in **30+ places**:

| Color | CSS Var | Raw-string occurrences in JS |
|---|---|---|
| `#2f2418` | `--ink` | 5 |
| `#b65c2a` | `--accent` | 12 |
| `#4f4033` | (no var) | 8 |
| `#fff7eb` | (no var) | 6 |
| `#7d6957` | (no var) | 5 |

If the color palette changes, every JS occurrence must be manually hunted down. Extract to a `THEME` constant object.

---

### 9. Pipe diameter options duplicated in HTML and JS
**Files:**
- [index.html](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L124-L131) — supply line size `<select>`: `0.75, 1, 1.25, 1.5`
- [pipes.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/geometry/pipes.js#L6) — `PIPE_DIAMETER_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5]`

The HTML supply-line dropdown is missing `0.5 in` (which is in the JS constant), and the JS constant has `0.5` which the HTML doesn't. The pipe-run detail panel is dynamically populated from `PIPE_DIAMETER_OPTIONS`, but the top-level hydraulics dropdown is static HTML. They should use the same data source.

---

### 10. Autosave timer interval hardcoded
**File:** [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L329-L331)

```js
autosaveTimer = window.setTimeout(() => {
    flushAutosave(state);
}, 250);
```

The 250ms debounce is buried inside the function. For large projects the autosave itself (`JSON.stringify` + `localStorage.setItem` of the full state including base64 background image) could janketize the UI. This should be a tunable constant, and ideally skip the background data URL from autosave payloads entirely for large images.

---

### 11. Grid spacing hardcoded to 50px
**File:** [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js#L121)

```js
const spacing = 50 * state.view.zoom;
```

The "Show grid" overlay always draws at 50 world-pixel intervals, which is not calibrated to any real unit. If the scale is set (e.g., 20 px/ft), a 1-ft or 5-ft grid would be more useful than an arbitrary 50px grid.

---

### 12. Head-connection pipe epsilon hardcoded
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L8)

```js
const HEAD_CONNECTION_PIPE_EPSILON = 3;
```

This pixel-distance tolerance for determining if a head "touches" a pipe is in **world-image pixels**, not calibrated units. At different zoom/scale levels, this tolerance represents wildly different real distances. It should scale with `pixelsPerUnit`.

---

### 13. Default sprinkler radius hardcoded to `12`
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L423)

```js
radius: action.payload.radius ?? 12,
```

Also repeated in `normalizeSprinkler()` at line 1825. The default `12` (feet) is a reasonable residential default but should be a named constant. A user in metric mode (`units: "m"`) will get a default radius of 12 meters, which is enormous.

---

### 14. Canvas minimum dimensions hardcoded
**File:** [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js#L46-L47)

```js
const width = Math.max(600, Math.floor(frame.clientWidth - 12));
const height = Math.max(480, Math.floor(frame.clientHeight - 12));
```

The `600` / `480` minimums and the `12` padding are magic numbers. Also the canvas HTML element starts with `width="1600" height="1000"` which is immediately overridden by `resize()`.

---

## Polish / Code Quality

### 15. `structuredClone` of entire state on every action
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L203)

```js
const working = structuredClone(state);
```

Every dispatched action deep-clones the **entire** state tree (including the background base64 data URL, which can be megabytes). This is very expensive. Combined with the unbounded undo stack (finding #3), a single edit can clone multi-MB state objects. Consider an immutable update pattern or structural sharing instead.

---

### 16. Duplicated selection-clearing boilerplate
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)

The pattern of clearing all selection IDs:
```js
state.ui.selectedSprinklerId = null;
state.ui.selectedValveBoxId = null;
state.ui.selectedControllerId = null;
state.ui.selectedPipeRunId = null;
state.ui.selectedWireRunId = null;
state.ui.selectedFittingId = null;
state.ui.selectedPipeVertexIndex = null;
state.ui.selectedWireVertexIndex = null;
```

appears **14+ times** (lines ~284-294, ~438-444, ~471-478, ~510-517, ~571-578, ~631-638, etc.). This should be a helper like `clearAllSelections(state)`.

---

### 17. Duplicated tool-validation arrays
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)

The array `["select", "place", "pipe", "wire", "fittings", "valve-box", "controller", "calibrate", "measure", "pan"]` appears on both line 225 and line 1691. Extract to a shared constant.

---

### 18. `isInputFocused()` check inverted in main.js
**File:** [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L64)

```js
if (isInputFocused()) {
    // Only handles Escape, then returns
    return;
}
```

The name `isInputFocused()` is accurate, but the early-return means "if an input has focus, eat the keyboard shortcut." The Escape-handling inside this block is duplicated with the Escape-handling in the main body (lines 159-191). The two Escape blocks handle overlapping cases.

---

### 19. `drawPipeHandle` defined inside renderer closure but called from drawing code
**File:** [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)

The function signature `drawPipeHandle(ctx, ...)` passes `ctx` explicitly, even though it's a closure variable. This is inconsistent — other draw functions don't pass `ctx`. Minor but creates cognitive overhead.

---

### 20. No `meta` description or OG tags
**File:** [index.html](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html#L1-L8)

The HTML head has only `charset`, `viewport`, and `title`. No `<meta name="description">`, no favicon link, and the title hardcodes "Sprinkler Layout Tool" rather than reflecting `state.meta.projectName`.

---

### 21. Zone color palette has only 6 entries
**File:** [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js#L54)

```js
const ZONE_COLORS = ["#d55d3f", "#4d8b31", "#3876b4", "#9d59c1", "#d18e2f", "#2e8b85"];
```

After 6 zones, colors cycle. With complex residential systems (10+ zones), zones will share colors, making visual distinction impossible. Consider programmatic HSL generation or a larger palette.

---

### 22. `beforeunload` autosave is synchronous but `saveAutosave` may fail
**File:** [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js#L59-L61) + [persistence.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/persistence.js#L20-L31)

`saveAutosave` wraps in try/catch and logs a warning, but `localStorage.setItem()` can throw `QuotaExceededError` with large background images (base64 data URLs). The user gets no notification that their autosave silently failed.

---

### 23. Import version check is brittle
**Files:**
- [import.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/import.js#L10): `if (parsed.version !== "1.0")`
- [persistence.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/persistence.js#L10): `if (parsed.version !== "1.0")`

Strict equality against `"1.0"` means even a minor version bump to `"1.1"` will make all existing saves unloadable, with no migration path. Consider semver comparison or a `>=` check.

---

## Summary Table

| # | Severity | Category | File(s) | Issue |
|---|---|---|---|---|
| 1 | 🔴 Critical | Dead code | project-state.js | `scopeMode` ternary always returns same value |
| 2 | 🔴 Critical | Dead code | wires.js | `normalizeWireKind` always returns `"multiconductor"` |
| 3 | 🔴 Critical | Memory | project-state.js | Unbounded undo/redo stack with full state clones |
| 4 | 🔴 Critical | Data integrity | sprinkler-database.js | Fallback DB missing nozzle series, duplicated from JSON |
| 5 | 🟠 Important | Maintainability | irrigation-analysis.js | 30+ hardcoded brand name strings |
| 6 | 🟠 Important | Maintainability | renderer.js, styles.css | Canvas background color duplicated |
| 7 | 🟠 Important | Maintainability | renderer.js | Canvas font family in 25+ raw strings |
| 8 | 🟠 Important | Maintainability | renderer.js | Design colors duplicated between CSS vars and JS |
| 9 | 🟠 Important | Data mismatch | index.html, pipes.js | Pipe diameter options out of sync |
| 10 | 🟡 Polish | Performance | main.js | Autosave debounce hardcoded, large payloads |
| 11 | 🟡 Polish | UX | renderer.js | Grid spacing not calibrated to real units |
| 12 | 🟡 Polish | Accuracy | project-state.js | Pipe epsilon in pixels, not calibrated units |
| 13 | 🟡 Polish | UX | project-state.js | Default radius (12) not unit-aware |
| 14 | 🟡 Polish | Cleanup | renderer.js | Canvas min dimensions are magic numbers |
| 15 | 🟡 Polish | Performance | project-state.js | `structuredClone` of full state + base64 on every action |
| 16 | 🟡 Polish | DRY | project-state.js | Selection-clearing pattern repeated 14+ times |
| 17 | 🟡 Polish | DRY | project-state.js | Tool-list array duplicated |
| 18 | 🟡 Polish | Clarity | main.js | Duplicated Escape-key handling across two code paths |
| 19 | 🟡 Polish | Consistency | renderer.js | `drawPipeHandle` passes `ctx` when it's a closure var |
| 20 | 🟡 Polish | SEO | index.html | Missing meta description, favicon |
| 21 | 🟡 Polish | UX | project-state.js | Only 6 zone colors in rotation |
| 22 | 🟡 Polish | Reliability | persistence.js | Silent autosave failure on quota exceeded |
| 23 | 🟡 Polish | Forward compat | import.js, persistence.js | Strict `"1.0"` version check with no migration |
