# Fittings Progress

## Purpose

Track implementation progress for the fittings feature in a simple, durable way that is easy to update as work lands.

Related docs:

- `fittings-ui-interaction-spec.md`
- `fittings-implementation-plan.md`

## Status Legend

- `Todo`: not started
- `In progress`: actively being worked
- `Done`: implemented and verified at the intended scope
- `Blocked`: waiting on a decision or dependency

## Current Focus

- `Milestone 3: Manual placement MVP: head takeoff`

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| 1. State and persistence | Done | Added fittings project state, selection state, actions, normalization, and save/load support. |
| 2. Toolbar button and floating panel shell | Done | Added the `Fittings` tool, movable palette shell, zone selector, tabs, and fitting inspector shell. |
| 3. Manual placement MVP: head takeoff | In progress | Next slice: place a manual head takeoff from the fittings palette onto the canvas. |
| 4. Render, select, move, and delete placed fittings | Todo | Draw fittings on the canvas and support basic editing interactions. |
| 5. Suggestion engine | Todo | Derive likely fittings from heads, pipes, and size transitions. |
| 6. Tee and reducing tee workflow | Todo | Add branch-point fitting resolution and placement for pipe-to-pipe connections. |
| 7. Parts integration | Todo | Count placed fittings in the parts workflow. |
| 8. Polish and validation | Todo | Verify with `sprinkler-layout.json`, fix rough edges, and tune the UX. |

## Working Log

| Date | Milestone | Status | Files Touched | Verification | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-27 | Project setup | Done | `fittings-ui-interaction-spec.md`, `fittings-implementation-plan.md`, `fittings-progress.md` | Docs created and reviewed | Initial feature spec, implementation roadmap, and progress tracker added. |
| 2026-03-27 | Milestones 1-2 | Done | `geometry/fittings.js`, `state/project-state.js`, `index.html`, `styles.css`, `ui/panels.js`, `src/main.js`, `canvas/interactions.js`, `fittings-progress.md` | Module import check passed for the touched JS modules | Added fittings state and persistence, toolbar integration, a draggable fittings palette shell, and fitting selection/delete plumbing. |

## Next Step

- Start the manual `Head takeoff` placement flow

## Decisions and Open Questions

- Use a hybrid model: derived suggestions plus explicitly placed fittings.
- Count only placed fittings in parts.
- Keep the first usable slice small by starting with manual `Head takeoff` placement before auto-suggestions.
