# Fittings Implementation Plan

## Goal

Implement a fittings workflow that fits the current app structure and delivers a useful first release without introducing a lot of manual complexity.

The plan below assumes:

- fittings suggestions are derived, not saved
- only placed fittings persist to JSON and count toward parts
- the first version focuses on common irrigation fittings and head takeoffs

## Step 1: Add State for Fittings

Update `state/project-state.js` to add:

- `fittings: []` at the project level
- `ui.selectedFittingId`
- `ui.fittingsPanel` with open state, screen position, selected tab, and zone mode
- `activeTool: "fittings"` in the allowed tool list

Add reducer actions for:

- `ADD_FITTING`
- `UPDATE_FITTING`
- `DELETE_FITTING`
- `SELECT_FITTING`
- `SET_FITTINGS_PANEL_STATE`

Exit criteria:

- fittings live in state
- the selected fitting can be tracked
- undo/redo includes fitting add, update, and delete actions

## Step 2: Normalize and Persist Fittings

Extend project import and state normalization so fittings survive save and load.

Update normalization and project snapshot behavior to:

- default older projects to `fittings: []`
- validate anchor shape and sizing fields
- preserve backward compatibility with existing JSON files

Exit criteria:

- projects load cleanly with or without fittings
- placed fittings save and reload without corruption

## Step 3: Create a Fitting Domain Module

Add a new module such as `geometry/fittings.js`.

This module should define:

- fitting template ids
- fitting labels
- fitting categories
- size resolution helpers
- anchor helpers
- utility formatters for labels like `3/4 x 3/4 x 1/2 tee`

Exit criteria:

- one central module resolves fitting metadata and display labels
- UI and analysis code do not hard-code fitting strings all over the app

## Step 4: Build a Suggestion Engine

Add a new derived-analysis module such as `analysis/fittings-analysis.js`.

It should inspect:

- sprinklers
- valve boxes
- pipe runs
- pipe diameters
- pipe-to-pipe topology

Generate suggestions for:

- head takeoffs
- pipe tees
- reducing tees
- reducers or transitions
- elbows
- couplings
- caps
- valve-box takeoffs

Important rule:

- keep suggestions derived from live state instead of persisting them

Exit criteria:

- suggestions update automatically when geometry changes
- the app can distinguish `suggested`, `placed`, and `ignored`

## Step 5: Add the Fittings Tool to the Topbar

Update `index.html` to add the `Fittings` button beside `Pipe`.

Update `ui/panels.js` and `state/project-state.js` so tool activation behaves like the current `Pipe` and `Valve Box` tools.

Exit criteria:

- the topbar shows a `Fittings` tool
- switching tools updates state correctly
- hint text reflects the new mode

## Step 6: Add the Floating Fittings Panel

Add panel markup in `index.html` and styling in `styles.css`.

The panel should include:

- draggable title bar
- zone selector with `Auto`, `Main`, and zones
- tabs for `Suggested`, `Common`, and `All`
- fitting cards with drag handles or drag-ready surfaces

Exit criteria:

- the panel can open over the canvas
- the panel can be moved without affecting canvas panning
- the panel renders the right cards and active tab state

## Step 7: Wire Panel Behavior

Extend `ui/panels.js` to manage:

- panel dragging
- tab switching
- zone mode changes
- rendering of suggested fitting groups
- initiation of palette drag operations

Use custom pointer handling instead of HTML drag-and-drop so canvas placement remains predictable.

Exit criteria:

- the panel responds smoothly
- drag state starts from a fitting card and is available to canvas interactions

## Step 8: Render Fittings on the Canvas

Extend `canvas/renderer.js` to draw:

- placed fitting glyphs
- selected fitting state
- drag ghost previews
- snap target highlights
- optional resolved labels near the cursor or selected fitting

Keep fitting visuals simple and readable instead of using detailed CAD symbols.

Exit criteria:

- placed fittings are visible and selectable
- the ghost preview clearly shows what will be placed

## Step 9: Add Fitting Hit Testing

Extend renderer hit helpers so the interaction controller can detect placed fittings.

Add:

- fitting hit-testing
- fitting selection feedback
- fitting hover state if needed for polish

Exit criteria:

- clicking a placed fitting selects it reliably
- fittings do not interfere badly with existing sprinkler or pipe selection

## Step 10: Add Canvas Placement Logic

Extend `canvas/interactions.js` for `activeTool === "fittings"`.

Support:

- dragging a fitting template from the floating panel
- showing live snap previews
- resolving placement target on drop
- creating a placed fitting with anchor and resolved size
- cancelling on `Escape`

Use snap priority such as:

- sprinkler or head point
- pipe branch point
- inline size change
- corner
- run end
- valve box outlet

Exit criteria:

- the user can drag from the panel to the plan and place a fitting in one gesture
- the placed fitting is anchored and survives movement of related geometry

## Step 11: Add Fitting Inspector Support

Extend the existing details panel in `index.html` and `ui/panels.js` to handle fitting selection.

Expose:

- fitting type
- resolved size
- zone
- anchor summary
- manual override fields
- `lock size`
- delete

Exit criteria:

- the details panel can edit a selected fitting
- most fittings still require no inspector interaction for normal use

## Step 12: Add Suggestion State Management

Implement a lightweight way to ignore suggestions without persisting full suggestion objects.

Recommended approach:

- store a small ignored-suggestion signature list in UI or project state
- regenerate suggestions from geometry
- filter out ignored signatures until the underlying geometry changes enough to invalidate them

Exit criteria:

- users can dismiss noisy suggestions
- ignored items do not immediately reappear unless the layout meaningfully changes

## Step 13: Add Parts Integration

Extend `analysis/irrigation-analysis.js` so placed fittings appear in the parts workflow.

Add:

- a fittings row type or section
- grouping by resolved fitting label
- zone usage where applicable
- fitting counts in the parts summary

Exit criteria:

- placed fittings appear on the parts screen
- suggestions do not count until placed

## Step 14: Verify with the Existing Project File

Use `sprinkler-layout.json` as the main verification fixture.

Confirm at minimum:

- NE head takeoffs resolve to zone-size-to-`1/2"` fittings
- East branch points suggest `3/4"` tees
- North size changes suggest reducing tees or reducers
- zone association behaves correctly
- save/load preserves placed fittings
- undo/redo works for placement and deletion

Exit criteria:

- the current project file demonstrates the full end-to-end workflow

## Recommended MVP Cut

Build these pieces first:

- state and persistence for placed fittings
- fitting domain module
- suggestion engine for the most common cases
- `Fittings` tool
- floating panel
- drag-to-place
- snapping to heads, pipe endpoints, and branch points
- basic fitting rendering and inspector
- parts counting for placed fittings

## Defer Until After MVP

Delay these items until the first version feels solid:

- batch `Place all suggestions`
- multi-select
- free rotation
- advanced manifold assemblies
- expanded fitting catalog
- manufacturer-specific SKUs

## File Touchpoints

The most likely files to change in the first implementation pass are:

- `index.html`
- `styles.css`
- `state/project-state.js`
- `ui/panels.js`
- `canvas/interactions.js`
- `canvas/renderer.js`
- `analysis/irrigation-analysis.js`
- `geometry/fittings.js`
- `analysis/fittings-analysis.js`

## Practical Build Order

Use this order to reduce rework:

1. state and persistence
2. fitting domain module
3. suggestion engine
4. topbar tool and floating panel shell
5. palette rendering and dragging
6. canvas preview and drop logic
7. selection and inspector
8. parts integration
9. verification and polish
