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

- `Milestone 8: Polish and validation`

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| 1. State and persistence | Done | Added fittings project state, selection state, actions, normalization, and save/load support. |
| 2. Toolbar button and floating panel shell | Done | Added the `Fittings` tool, movable palette shell, zone selector, tabs, and fitting inspector shell. |
| 3. Manual placement MVP: head takeoff | Done | The `Head takeoff` card now starts a drag, previews over sprinkler heads, and creates placed fittings on drop. |
| 4. Render, select, and delete placed fittings | Done | Rendering, selection, delete, overlap priority, and the `Show fittings` view toggle are in place. |
| 5. Suggestion engine | In progress | Head takeoff suggestions and pipe-connection suggestions now derive from the plan and feed the drag-to-place flow. |
| 6. Tee and reducing tee workflow | Done | Branch-point fitting resolution and targeted placement now cover tees, reducing tees, and reducers for pipe-to-pipe connections. |
| 7. Parts integration | Done | Placed fittings are now counted and grouped in the parts workflow. |
| 8. Polish and validation | Todo | Verify with `sprinkler-layout.json`, fix rough edges, and tune the UX. |

## Working Log

| Date | Milestone | Status | Files Touched | Verification | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-27 | Project setup | Done | `fittings-ui-interaction-spec.md`, `fittings-implementation-plan.md`, `fittings-progress.md` | Docs created and reviewed | Initial feature spec, implementation roadmap, and progress tracker added. |
| 2026-03-27 | Milestones 1-2 | Done | `geometry/fittings.js`, `state/project-state.js`, `index.html`, `styles.css`, `ui/panels.js`, `src/main.js`, `canvas/interactions.js`, `fittings-progress.md` | Module import check passed for the touched JS modules | Added fittings state and persistence, toolbar integration, a draggable fittings palette shell, and fitting selection/delete plumbing. |
| 2026-03-27 | Milestone 3 | Done | `geometry/fittings.js`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `canvas/renderer.js`, `src/main.js`, `fittings-progress.md` | Module import check passed, reducer state exercised with a head-takeoff draft and placed fitting | Added manual `Head takeoff` placement with palette drag start, canvas preview, sprinkler snapping, fitting rendering, selection, and delete support. |
| 2026-03-27 | Milestone 4 polish | Done | `index.html`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `canvas/renderer.js`, `fittings-progress.md` | Module import check passed, existing project loads with `showFittings` defaulting to `true` | Added a `Show fittings` view toggle and changed overlap selection priority so `Select` is head-first while `Fittings` is fitting-first. |
| 2026-03-27 | Milestone 5 | In progress | `analysis/fittings-analysis.js`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `fittings-progress.md` | Module import check passed. `sprinkler-layout.json` now yields 32 baseline head-takeoff suggestions, and a targeted preview resolves the correct sprinkler, zone, and size. | Added derived head-takeoff suggestions to the `Suggested` tab and wired suggested cards into the existing drag-to-place workflow. |
| 2026-03-27 | Milestone 5 pipe slice | In progress | `analysis/fittings-analysis.js`, `state/project-state.js`, `ui/panels.js`, `canvas/interactions.js`, `canvas/renderer.js`, `fittings-progress.md` | Module import check passed. `sprinkler-layout.json` now yields 7 pipe-connection suggestions (`2` tees, `4` reducing tees, `1` reducer), and placing one suggestion suppresses it from the list. | Added derived pipe-connection suggestions, targeted placement payloads for suggested fittings, and pipe-anchor rendering support for placed tees and reducers. |
| 2026-03-27 | Milestone 7 | Done | `analysis/irrigation-analysis.js`, `ui/panels.js`, `fittings-progress.md` | Module import check passed. The current sample file reports fitting rows in the parts snapshot, and in-memory placed fittings update counts and rows correctly. | Added placed-fitting grouping and totals to the parts snapshot, plus a dedicated `Fittings` section in the parts screen. |
| 2026-03-27 | Milestone 8 auto-place polish | In progress | `canvas/interactions.js`, `ui/panels.js`, `styles.css`, `fittings-progress.md` | Module import check passed. A controller-level test auto-placed a suggested pipe fitting, increased the fitting count, and removed that suggestion from the list. | Added a per-card `Place` action for suggested fittings while keeping drag-to-place intact. |
| 2026-03-27 | Milestone 8 terminal-head rule | In progress | `analysis/fittings-analysis.js`, `canvas/interactions.js`, `ui/panels.js`, `state/project-state.js`, `fittings-progress.md` | Verified against `S-32` in `sprinkler-layout.json`: the suggestion resolves to `elbow`, manual head preview resolves to `elbow`, and placing it stores an `elbow` fitting that suppresses the suggestion. | Terminal sprinkler heads now resolve as elbows instead of tees, and sprinkler-anchored suggestion copy/hints match that behavior. |
| 2026-03-27 | Milestone 8 pipe-delete cleanup | In progress | `analysis/fittings-analysis.js`, `state/project-state.js`, `fittings-progress.md` | Verified against `sprinkler-layout.json`: deleting a zone run now removes both pipe-run fittings and dependent sprinkler-head fittings, and the head suggestion returns afterward. Also verified that a mismatched placed head fitting no longer suppresses the correct suggestion. | Pipe deletion now cleans up dependent fittings instead of leaving orphans, and head suggestion suppression now respects the current line geometry. |
| 2026-03-27 | Milestone 8 head-fit delete fallback | In progress | `analysis/fittings-analysis.js`, `state/project-state.js`, `fittings-progress.md` | Verified with a legacy-style sprinkler fitting that had no stored `pipeRunId`: deleting a touching zone run removed the fitting and immediately re-suggested the head connection. | New head fittings now store their source zone run, and delete cleanup falls back to direct run-to-head contact for older fittings. |
| 2026-03-27 | Milestone 8 mainline snap refinement | In progress | `canvas/interactions.js`, `fittings-progress.md` | Controller-level checks passed: main-line drafting ignored nearby sprinkler and zone-line nodes, still snapped to valve boxes, zone-line drafting still snapped to sprinklers, and dragging a mainline vertex near a sprinkler no longer snapped onto it. | Main-line snap affinity is now limited to main-line nodes and valve boxes, while zone-line snap behavior stays unchanged. |
| 2026-03-27 | Milestone 8 pipe-kind snap symmetry | In progress | `canvas/interactions.js`, `fittings-progress.md` | Controller-level checks passed: zone-line drafting no longer snapped to main-line nodes, while still snapping to sprinklers, valve boxes, and zone-line nodes. | Pipe-node snapping is now symmetric by kind: main lines snap only to main-line nodes, and zone lines snap only to zone-line nodes. |
| 2026-03-27 | Milestone 8 zone snap affinity filter | In progress | `canvas/interactions.js`, `fittings-progress.md` | Controller-level checks passed: zone-line drafts snapped to valve boxes, same-zone sprinklers, and same-zone zone lines, while ignoring main-line nodes, different-zone sprinklers, and different-zone zone lines. | Zone-line snapping now filters zone-specific targets by compatible zone and stays off main-line nodes. |
| 2026-03-27 | Milestone 8 zone inference on snap | In progress | `canvas/interactions.js`, `state/project-state.js`, `fittings-progress.md` | Controller-level checks passed: unassigned zone drafts inherited a snapped sprinkler or zone-line zone, `active zone` remained authoritative when set, and moving an endpoint of an existing unassigned zone line onto a valid source assigned that zone. | Snap metadata now carries source context so unassigned zone lines can inherit zone from compatible sprinkler or zone-line targets. |

## Next Step

- Refine pipe-connection suggestion heuristics, mixed/main labeling, and edge-case suppression during validation

## Decisions and Open Questions

- Use a hybrid model: derived suggestions plus explicitly placed fittings.
- Count only placed fittings in parts.
- Keep the first usable slice small by starting with manual `Head takeoff` placement before auto-suggestions.
