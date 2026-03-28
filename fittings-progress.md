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

- `Milestone 5: Suggestion engine`

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| 1. State and persistence | Done | Added fittings project state, selection state, actions, normalization, and save/load support. |
| 2. Toolbar button and floating panel shell | Done | Added the `Fittings` tool, movable palette shell, zone selector, tabs, and fitting inspector shell. |
| 3. Manual placement MVP: head takeoff | Done | The `Head takeoff` card now starts a drag, previews over sprinkler heads, and creates placed fittings on drop. |
| 4. Render, select, and delete placed fittings | Done | Rendering, selection, delete, overlap priority, and the `Show fittings` view toggle are in place. |
| 5. Suggestion engine | In progress | Head takeoff suggestions now derive from the plan and feed the drag-to-place flow. Pipe-based suggestions are still next. |
| 6. Tee and reducing tee workflow | Todo | Add branch-point fitting resolution and placement for pipe-to-pipe connections. |
| 7. Parts integration | Todo | Count placed fittings in the parts workflow. |
| 8. Polish and validation | Todo | Verify with `sprinkler-layout.json`, fix rough edges, and tune the UX. |

## Working Log

| Date | Milestone | Status | Files Touched | Verification | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-27 | Project setup | Done | `fittings-ui-interaction-spec.md`, `fittings-implementation-plan.md`, `fittings-progress.md` | Docs created and reviewed | Initial feature spec, implementation roadmap, and progress tracker added. |
| 2026-03-27 | Milestones 1-2 | Done | `geometry/fittings.js`, `state/project-state.js`, `index.html`, `styles.css`, `ui/panels.js`, `src/main.js`, `canvas/interactions.js`, `fittings-progress.md` | Module import check passed for the touched JS modules | Added fittings state and persistence, toolbar integration, a draggable fittings palette shell, and fitting selection/delete plumbing. |
| 2026-03-27 | Milestone 3 | Done | `geometry/fittings.js`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `canvas/renderer.js`, `src/main.js`, `fittings-progress.md` | Module import check passed, reducer state exercised with a head-takeoff draft and placed fitting | Added manual `Head takeoff` placement with palette drag start, canvas preview, sprinkler snapping, fitting rendering, selection, and delete support. |
| 2026-03-27 | Milestone 4 polish | Done | `index.html`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `canvas/renderer.js`, `fittings-progress.md` | Module import check passed, existing project loads with `showFittings` defaulting to `true` | Added a `Show fittings` view toggle and changed overlap selection priority so `Select` is head-first while `Fittings` is fitting-first. |
| 2026-03-27 | Milestone 5 | In progress | `analysis/fittings-analysis.js`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `fittings-progress.md` | Module import check passed. `sprinkler-layout.json` now yields 32 baseline head-takeoff suggestions, and a targeted preview resolves the correct sprinkler, zone, and size. | Added derived head-takeoff suggestions to the `Suggested` tab and wired suggested cards into the existing drag-to-place workflow. |

## Next Step

- Extend the suggestion engine beyond head takeoffs to pipe tees, reducing tees, and inline transitions

## Decisions and Open Questions

- Use a hybrid model: derived suggestions plus explicitly placed fittings.
- Count only placed fittings in parts.
- Keep the first usable slice small by starting with manual `Head takeoff` placement before auto-suggestions.
