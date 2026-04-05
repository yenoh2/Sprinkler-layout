# Technical Debt Resolution - Sprinkler Layout Tool

All 23 issues from the project analysis have now been addressed. Below is the final resolution summary, grouped by severity.

---

## Critical Issues

### #1 - `scopeMode` sanitizer was a no-op
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: The sanitizer now validates against `["included_zones_only", "all_zones"]` instead of always returning `"included_zones_only"`.

### #2 - `normalizeWireKind()` always returned `"multiconductor"`
- **File**: [wires.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/geometry/wires.js)
- **Fix**: Added `WIRE_KIND_OPTIONS = ["multiconductor", "single_conductor"]`, so supported values are preserved and only unknown values fall back to `"multiconductor"`.

### #3 - Unbounded undo/redo stack (memory leak)
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Introduced `MAX_UNDO_DEPTH = 50` and trim the undo stack on every history push.

### #4 - Duplicated sprinkler database (out-of-sync fallback)
- **File**: [sprinkler-database.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/analysis/sprinkler-database.js)
- **Fix**: Removed the fallback database copy. The app now loads from `sprinkler_data.json` only and returns an empty structure with a clear error if loading fails.

---

## Important Issues

### #5 - Hardcoded brand name strings
- **Files**: [irrigation-analysis.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/analysis/irrigation-analysis.js), [fittings-analysis.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/analysis/fittings-analysis.js)
- **Fix**: Centralized shared body names in `BODY_1800_PRS`, `BODY_5004_PRS`, and `BODY_3504`, including the recommendation label builders.

### #6 - Canvas background color duplicated between CSS and JS
- **Files**: [styles.css](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/styles.css), [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: Added `--canvas-bg` in CSS and use `THEME.bg` in the renderer.

### #7 - Font family string repeated across canvas drawing
- **File**: [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: Added `CANVAS_FONT_BODY`, `CANVAS_FONT(size)`, and `CANVAS_FONT_BOLD(size)`.

### #8 - Design colors scattered throughout renderer
- **File**: [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: Centralized renderer colors in the `THEME` object.

### #9 - Pipe diameter options out of sync between HTML and JS
- **Files**: [index.html](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html), [pipes.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/geometry/pipes.js)
- **Fix**: Added the missing `0.5 in` option so the static HTML matches `PIPE_DIAMETER_OPTIONS`.

### #10 - Autosave debounce hardcoded
- **File**: [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js)
- **Fix**: Extracted `AUTOSAVE_DEBOUNCE_MS = 250`.

### #11 - Grid spacing not scale-aware
- **File**: [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: The grid now uses calibrated `5 ft` spacing when scale is known, with `DEFAULT_GRID_SPACING = 50` as the fallback.

---

## Polish Issues

### #12 - Head-connection pipe epsilon not scale-aware
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Added `resolveHeadConnectionPipeEpsilon(state)`, which keeps the old `3px` fallback for uncalibrated projects and scales the tolerance from a real-world distance once `pixelsPerUnit` is known.

### #13 - Default sprinkler radius hardcoded as magic number `12`
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Added shared default helpers so the feet-only project state consistently uses `12 ft` for spray radius plus shared strip defaults.

### #14 - Canvas minimum dimensions hardcoded
- **File**: [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: Extracted `CANVAS_MIN_WIDTH`, `CANVAS_MIN_HEIGHT`, and `CANVAS_PADDING`.

### #15 - `structuredClone` of entire state on every action
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Replaced the reducer's full-state `structuredClone(state)` with a shape-aware `cloneMutableState()` helper, preserving immutable reducer behavior without deep-cloning the entire project graph on every dispatch.

### #16 - Selection-clearing logic duplicated 14+ times
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Added `clearAllSelections(ui)` and replaced the repeated blocks with single-line calls.

### #17 - Valid tool list duplicated
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Extracted the shared `VALID_TOOLS` array and reuse it in both tool activation and project normalization.

### #18 - Escape key handling duplicated in `main.js`
- **File**: [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js)
- **Fix**: Removed the duplicate Escape handling from the focused-input path so there is one main cancellation flow.

### #19 - Pipe and wire handle drawing now uses one shared helper
- **File**: [renderer.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/canvas/renderer.js)
- **Fix**: Kept `drawPipeHandle(ctx, ...)` as the shared helper for both pipe and wire handles so every call site renders through the same path without duplicating drawing logic.

### #20 - Missing HTML metadata
- **File**: [index.html](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/index.html)
- **Fix**: Added a meta description, Open Graph tags, and an inline SVG favicon. The document title now also follows `state.meta.projectName` at runtime.

### #21 - Only 6 zone colors available
- **File**: [project-state.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/state/project-state.js)
- **Fix**: Expanded `ZONE_COLORS` from 6 to 14 distinct colors.

### #22 - Autosave silently swallowed `QuotaExceededError`
- **Files**: [persistence.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/persistence.js), [main.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/src/main.js)
- **Fix**: `saveAutosave()` now returns structured status, detects `QuotaExceededError`, and surfaces the warning through the visible hint bar instead of relying on console-only logging.

### #23 - Brittle version check in import/persistence
- **Files**: [persistence.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/persistence.js), [import.js](file:///c:/Users/yenoh/Documents/Ben/Projects/Sprinkler%20layout/io/import.js)
- **Fix**: Persistence accepts a `SUPPORTED_VERSIONS` list, and import accepts any `1.x` project file via `version.startsWith("1.")`.

---

## Net Impact

| Measure | Before | After |
|---|---|---|
| Duplicated selection-clearing blocks | 14+ | 1 helper function |
| Raw font strings in renderer | 25+ | 0 |
| Raw color hex codes in renderer | 35+ | 0 |
| Hardcoded brand name strings | 12+ | 0 outside shared body constants |
| Undo stack depth limit | Unbounded | 50 |
| Full-state `structuredClone` on every action | Yes | No |
| Zone color palette | 6 | 14 |
| Sprinkler database sources of truth | 2 | 1 |
