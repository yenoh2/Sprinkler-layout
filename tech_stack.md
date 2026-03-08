# Sprinkler Layout Tool MVP Technology Stack

## 1. Scope and Constraints

- MVP runs locally on a developer machine.
- No hosted backend required in MVP.
- Preference is low-complexity technologies: `HTML`, `CSS`, and `JavaScript`.
- Must support scale-based drawing, sprinkler arc rendering, overlap visualization, and local project save/load.

## 2. Recommended Stack (MVP)

### 2.1 Frontend Runtime

- `HTML5` for structure.
- `CSS3` for layout and styling.
- `Vanilla JavaScript (ES2022+)` for all app logic.
- Browser target: latest `Chrome`, `Edge`, and `Firefox` on desktop.

Why:
- Fastest path to implementation.
- No framework overhead.
- Easy debugging in browser dev tools.

### 2.2 Rendering and Interaction

- Primary rendering: `HTML Canvas 2D API`.
- Layer approach:
- Background layer for yard image/PDF raster.
- Coverage layer for sprinkler arcs and overlap shading.
- Interaction layer for selection handles and guides.
- Optional fallback:
- Use `SVG` for simple overlays if needed for debug/export, but keep Canvas as main runtime renderer.

Why:
- Canvas is straightforward for many moving/overlapping translucent shapes.
- Good fit for pan/zoom and real-time redraw.

### 2.3 State Management

- Plain JavaScript module state (single in-memory `projectState` object).
- Event-driven updates with lightweight pub/sub or direct controller calls.
- No Redux or external state library in MVP.

Why:
- Small app scope.
- Keeps implementation and onboarding simple.

### 2.4 Persistence (Local Only)

- Project save/load format: JSON.
- Storage options:
- Primary: download/upload `.json` project files.
- Optional convenience: browser `localStorage` for recent session autosave.
- No database in MVP.

Why:
- Works fully offline.
- No server dependencies.
- Easy portability for user files.

### 2.5 File Import

- Use browser `File` and `FileReader` APIs.
- Image imports: `PNG`, `JPG/JPEG`.
- PDF in MVP:
- Option A (simplest): require user to export PDF page to image before import.
- Option B (still feasible): use `pdf.js` to render first page to canvas.

Recommendation:
- Start with image import only.
- Add `pdf.js` in phase 2 if PDF demand is strong.

### 2.6 Geometry and Math

- Use native JavaScript math (`Math`, vector helper utilities).
- Build a small internal geometry utility module for:
- Distance and scaling conversions.
- Arc angle normalization.
- Hit testing (point-to-sprinkler, point-in-arc).
- Keep this module framework-agnostic and unit-testable.

Why:
- Geometry is core to correctness.
- Small custom utilities avoid heavy dependencies.

### 2.7 Overlap Visualization

- Use alpha compositing on Canvas for layered sprinkler coverage fills.
- Default blend mode: `source-over` with tuned opacity (example `0.18` to `0.30`).
- Optional advanced mode (later): offscreen raster count map for explicit overlap bands.

Why:
- Minimal implementation for MVP.
- Directly supports the "darker with more overlap" requirement.

### 2.8 UI Components

- Build with semantic HTML forms and custom lightweight components in JS.
- Panels:
- Project settings panel.
- Sprinkler properties panel.
- Canvas toolbar (select, place, calibrate, measure).
- Avoid component libraries for MVP.

Why:
- Reduces setup time and dependencies.
- Easier to control exact interactions.

## 3. Developer Tooling

### 3.1 Local Development

- Preferred: `Visual Studio Code` + `Live Server` extension.
- Alternative: `npx serve` or `python -m http.server` from project folder.
- No build step required for MVP.

### 3.2 Code Organization

- Suggested file structure:

```text
/index.html
/styles.css
/src/main.js
/src/state/project-state.js
/src/canvas/renderer.js
/src/canvas/interactions.js
/src/geometry/scale.js
/src/geometry/arcs.js
/src/io/import.js
/src/io/export.js
/src/ui/panels.js
```

### 3.3 Quality and Formatting

- Linting: `ESLint` (basic recommended rules).
- Formatting: `Prettier`.
- Optional type safety without TypeScript:
- JSDoc annotations plus `// @ts-check` in JS files.

Why:
- Keeps code quality high while staying in plain JavaScript.

### 3.4 Testing (MVP Level)

- Unit tests: `Vitest` for geometry and scale calculations.
- Minimal E2E/manual checklist for:
- Import background.
- Calibrate scale.
- Place and edit sprinklers.
- Validate overlap darkening behavior.
- Save and reload project JSON.

Why:
- Geometry bugs are common and high-impact.
- Unit tests provide quick confidence without a heavy test stack.

## 4. Dependencies Policy

- MVP should start with zero runtime dependencies if possible.
- Allowed runtime dependency when needed:
- `pdfjs-dist` only if direct PDF import is required.
- Dev dependencies allowed:
- `eslint`, `prettier`, `vitest`.

Decision rule:
- Add a dependency only when it removes meaningful complexity or risk.

## 5. Browser and Platform Requirements

- Desktop-first MVP.
- Minimum viewport: `1280x720`.
- Keyboard and mouse support required.
- Touch support can be deferred.
- Offline use should function after files are loaded locally.

## 6. Security and Privacy (Local MVP)

- All data stays on the user machine.
- No network calls required for core features.
- Avoid loading third-party scripts from CDNs in production-like local usage; prefer pinned local copies if dependencies are added.

## 7. Performance Targets

- Smooth pan/zoom and drag interactions at typical desktop performance.
- Redraw loop should handle at least 100 sprinkler overlays without visible stutter.
- Re-render only when state changes, not on a continuous animation loop unless needed.

## 8. Implementation Phases

### Phase 1: Core Local MVP

- Static app shell (`HTML/CSS/JS`).
- Canvas rendering with background image.
- Scale calibration tools.
- Sprinkler placement and arc visualization.
- Layered alpha overlap shading.
- Project JSON export/import.
- Supply line size and pressure input forms with validation.

### Phase 2: Practical Enhancements

- PDF import via `pdf.js`.
- Better selection handles and snapping.
- Autosave to `localStorage`.
- Additional sprinkler pattern presets.

## 9. Explicitly Deferred for MVP

- Cloud sync or multi-user collaboration.
- Backend API and database.
- Authentication and user accounts.
- Full hydraulic engine and zone optimization solver.
- Mobile-first UX.

## 10. Final Recommendation

For fastest delivery with the lowest complexity, implement the MVP as a pure client-side app using `HTML + CSS + Vanilla JavaScript + Canvas 2D`, with JSON file-based persistence and no backend. This stack directly supports your current requirements while keeping the codebase easy to build, run, and iterate locally.
