# Sprinkler Layout Tool

A local, browser-based irrigation planning app for laying out sprinklers on top of a yard plan, calibrating scale, sketching main and zone piping, reviewing coverage and application-rate overlays, and generating a practical parts list.

This project is built as a static HTML/CSS/JavaScript app with no backend and no build step.

## Features

- Import a yard image (`PNG` or `JPG`) as the drawing background
- Calibrate scale with a two-point reference measurement
- Optionally rectify photographed plans with a four-corner reference rectangle before scale calibration
- Place and edit sprinkler heads with:
  - full-circle coverage
  - arc coverage
  - strip patterns
- Draw main and zone pipe runs
- Draw manual multiconductor control-wire runs
- Assign and manage irrigation zones
- Place valve boxes and suggested/explicit fittings
- Place controllers and track control cable runs to valve boxes
- Review overlap and irrigation analysis overlays:
  - application rate
  - zone catch-can depth
  - full schedule depth
  - target error
- Generate recommended sprinkler bodies/nozzles from the bundled irrigation database
- View a parts screen with bodies, nozzles, fittings, and pipe totals
- Save and load project JSON files
- Export the canvas as a PNG
- Restore work from local autosave
- Use undo/redo and a few practical keyboard shortcuts

## Current Scope

This tool is aimed at residential sprinkler layout planning and review. It helps with geometry, spacing, zone grouping, nozzle recommendations, manual controller-to-valve-box wire planning, and high-level hydraulic guidance.

It does not currently do full hydraulic simulation, pressure-loss modeling, trench routing, controller programming, or cloud sync.

## Running Locally

Because the app uses ES modules and loads local JSON data, run it from a local HTTP server instead of opening `index.html` directly from the filesystem.

### Option 1: Python

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Option 2: Node

```powershell
npx serve .
```

### Option 3: VS Code

Use the Live Server extension and open the project folder.

## Basic Workflow

1. Import a yard image in the Project panel.
2. Calibrate the plan with a known measurement.
3. Enter supply line size, pressure, and optionally a design flow cap.
4. Place sprinkler heads and adjust radius, arc, strip geometry, labels, and zone assignment.
5. Draw main and zone pipes.
6. Add valve boxes, controllers, and manual multiconductor wire runs.
7. Use the fittings palette for suggested or manual fittings.
8. Review coverage and analysis overlays.
9. Switch to the Parts screen to review bodies, nozzles, fittings, pipe totals, controllers, and control-wire totals.
9. Save the layout as JSON or export a PNG snapshot.

## Keyboard Shortcuts

- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Y`: Redo
- `Ctrl/Cmd + Shift + Z`: Redo
- `Ctrl/Cmd + C`: Copy selected sprinkler
- `Ctrl/Cmd + V`: Paste sprinkler
- `Delete` / `Backspace`: Delete selected sprinkler, pipe, valve box, fitting, or selected pipe vertex
- `Enter`: Finish the active pipe draft
- `Escape`: Cancel fitting draft, pipe draft, or measurement workflow

## Project Structure

```text
.
|-- index.html
|-- styles.css
|-- sprinkler_data.json
|-- src/
|   `-- main.js
|-- analysis/
|-- canvas/
|-- geometry/
|-- io/
|-- state/
|-- ui/
`-- tools/
```

### Notable Directories

- `src/`: app bootstrap and top-level wiring
- `canvas/`: drawing, hit testing, and interaction behavior
- `analysis/`: nozzle recommendation, overlay analysis, and fitting suggestion logic
- `geometry/`: math and formatting helpers
- `state/`: app state and reducer/store logic
- `ui/`: panel bindings and UI rendering
- `io/`: import/export and autosave helpers
- `tools/`: standalone utility scripts such as nozzle recommendation reporting

## Data Files

- `sprinkler_data.json`: bundled sprinkler/nozzle database used by the in-app analyzer
- `sprinkler-layout.json`: current sample/project data file in this repo

## Utility Script

The repo includes a reporting script that analyzes a saved layout and writes a markdown report:

```powershell
node .\tools\recommend-nozzles.mjs
```

It reads `sprinkler-layout.json` and `sprinkler_data.json`, uses the same shared analyzer as the app, and updates `zone-nozzle-analysis.md`.

## Browser Target

- Latest desktop Chrome
- Latest desktop Edge
- Latest desktop Firefox

Desktop is the intended target. Mobile/touch support is not the current focus.

## Limitations

- Hydraulic guidance is advisory only
- Background import currently supports image files, not PDF import
- There is no backend, user auth, or sync
- The app is optimized for local use and iterative layout work, not production estimating or stamped irrigation design

## Roadmap Ideas

- Direct PDF import
- Explicit lawn-area modeling
- More sprinkler catalogs and parts databases
- Better hydraulic zone validation
- Additional export/report options

## License

Add your preferred license here.
