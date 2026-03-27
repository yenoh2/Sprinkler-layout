# Fittings UI and Interaction Spec

## Goal

Add fittings in a way that feels visual and fast instead of CAD-heavy. Users should be able to:

- switch into a dedicated fittings workflow
- see likely fittings suggested from the existing layout
- drag fittings onto the page to confirm placement
- keep fittings associated with the correct zone or main line
- count placed fittings in the parts workflow

The design should minimize fiddly manual setup while still allowing enough control to capture what is actually needed.

## Core UX Model

Use a hybrid model:

- the app computes suggested fittings from pipes, heads, and valve boxes
- the user confirms them by dragging fitting cards from a floating panel onto the plan
- placed fittings become part of the saved project and parts list
- suggestions remain derived and update automatically when the layout changes

This keeps the page interactive and visual without forcing the user to manually draft every fitting from scratch.

## Main Entry Point

Add a new `Fittings` tool button beside `Pipe` in the top toolbar.

When `Fittings` is active:

- the canvas still supports pan and zoom
- fitting snap targets become visible
- the fittings floating panel opens over the canvas
- clicking placed fittings selects them
- dragging from the panel onto the canvas creates fittings

## Floating Panel

The fittings panel should be a draggable overlay inside the canvas area rather than a fixed sidebar section.

### Panel Layout

The panel should include:

- a title bar with a drag handle
- a zone selector with `Auto`, `Main`, and all zones
- tabs for `Suggested`, `Common`, and `All`
- a scrollable list of fitting cards

### Why a Floating Panel

This fits the visual nature of the workflow better than the existing sidebars:

- users can keep their eyes on the plan
- drag distance from catalog to target stays short
- the panel can be moved away from dense plan areas

## Zone Association Rules

Use smart defaults for zone assignment:

- if a fitting snaps to a zone pipe or sprinkler, inherit that zone
- if a fitting snaps to a main line, assign it to `Main`
- if no strong target exists, use the panel's selected zone
- if the target is ambiguous, show a compact one-time choice prompt

`Auto` should be the default panel mode.

## What the User Drags

Do not force users to choose fully sized fittings first.

The `Common` tab should use smart templates:

- `Head takeoff`
- `Pipe tee`
- `Reducer / transition`
- `Elbow`
- `Coupling`
- `Cap`

After drop, the app should resolve the actual fitting size from the target context.

Examples:

- drop `Head takeoff` on a `3/4"` zone pipe -> resolve to `3/4 x 3/4 x 1/2 tee`
- drop `Head takeoff` on a `1"` zone pipe -> resolve to `1 x 1 x 1/2 tee`
- drop `Pipe tee` on a branch where `1"` meets `3/4"` -> resolve to `1 x 1 x 3/4 reducing tee`

The `All` tab can expose explicit-size fittings for edge cases and manual overrides.

## Suggested Tab

The `Suggested` tab should be the default and should group items by reason:

- `Heads`
- `Pipe connections`
- `Valve box takeoffs`

Each suggestion card should show:

- fitting type
- resolved size
- zone
- why it was suggested
- quantity when several identical suggestions exist

Good suggestion card actions:

- `Locate`
- `Drag to place`
- `Ignore`

## Canvas Placement Rules

### Snap Targets

Allow snapping to:

- sprinklers and head connection points
- pipe endpoints
- pipe branch points
- pipe segment midpoints
- valve box outlets

### Placement Behavior

When the user drags a fitting over the plan:

- show a ghost glyph preview
- highlight the current snap target
- show the resolved label near the cursor
- auto-rotate the fitting to the pipe direction

Only show a small choice popover when the app genuinely cannot disambiguate between likely outcomes, such as:

- `tee` versus `reducer`
- left-branch versus right-branch interpretation

## Fitting Interpretation Rules

The first version should follow these rules:

- drop over a sprinkler or its snap point -> treat as a head takeoff
- drop over a pipe branch -> treat as a tee
- drop over a branch with different sizes -> treat as a reducing tee
- drop over an inline size change -> treat as a reducer or transition
- drop over a corner -> treat as an elbow
- drop over a dead-end -> treat as a cap
- drop near a valve box outlet -> treat as a zone takeoff

## Reduce Fiddliness

To keep the feature easy to use:

- use a generous snap radius
- prevent free placement when a valid snap target is nearby
- auto-resolve size whenever possible
- auto-rotate by default
- keep manual overrides in the inspector rather than in the initial placement flow

The user should usually be able to:

1. pick a fitting card
2. drag it to the plan
3. drop once

## Placed Fittings

Placed fittings should appear as a lightweight fitting layer on the canvas.

Visual treatment:

- simple glyphs rather than detailed pipe drafting symbols
- zone-colored accent or ring
- selected state highlight
- optional labels only when selected or zoomed in

## Selection and Editing

Selecting a placed fitting should open a fitting inspector in the existing details panel.

The fitting inspector should support:

- fitting type
- resolved size
- zone
- anchor summary
- manual size/type override
- `lock size` toggle
- delete

Most fittings should not require editing after placement, but the override path should exist for exceptions.

## Suggested vs Placed vs Ignored

Track three states:

- `suggested`
- `placed`
- `ignored`

Only `placed` fittings should count for persistence and parts. `ignored` suggestions should stay suppressed unless the layout changes enough to invalidate and regenerate them.

## Data Model Requirements

Placed fittings should be stored as anchored objects rather than loose points.

Recommended fields:

- `id`
- `type`
- `zoneId`
- `sizeSpec`
- `anchor`
- `rotationDeg`
- `status`
- `locked`

The `anchor` should point to a pipe segment, pipe vertex, sprinkler, or valve box so fittings stay aligned when geometry moves.

## Parts Workflow

Placed fittings should integrate into the parts screen as a new fittings section or row type.

Suggestions should not be counted in parts until they are placed.

## MVP Scope

The first release should include:

- `Fittings` tool
- draggable floating panel
- `Suggested` and `Common` tabs
- drag-to-place on the canvas
- snapping to heads, pipe endpoints, and branch points
- automatic resolution of `head takeoff`, `tee`, `reducing tee`, `elbow`, and `coupling`
- placed fitting selection and deletion
- parts counting for placed fittings

## Later Enhancements

Good follow-up improvements after the MVP:

- `Place all visible suggestions`
- more fitting families like crosses and manifolds
- batch accept and batch ignore workflows
- free rotation
- multi-select editing
- more detailed manufacturer-specific catalogs
