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

- `Not started`

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| 1. State and persistence | Todo | Add fittings data to project state, selection state, actions, and save/load support. |
| 2. Toolbar button and floating panel shell | Todo | Add the `Fittings` tool and the initial movable panel UI. |
| 3. Manual placement MVP: head takeoff | Todo | Allow dragging a `Head takeoff` fitting onto the canvas and creating a placed fitting. |
| 4. Render, select, move, and delete placed fittings | Todo | Draw fittings on the canvas and support basic editing interactions. |
| 5. Suggestion engine | Todo | Derive likely fittings from heads, pipes, and size transitions. |
| 6. Tee and reducing tee workflow | Todo | Add branch-point fitting resolution and placement for pipe-to-pipe connections. |
| 7. Parts integration | Todo | Count placed fittings in the parts workflow. |
| 8. Polish and validation | Todo | Verify with `sprinkler-layout.json`, fix rough edges, and tune the UX. |

## Working Log

| Date | Milestone | Status | Files Touched | Verification | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-27 | Project setup | Done | `fittings-ui-interaction-spec.md`, `fittings-implementation-plan.md`, `fittings-progress.md` | Docs created and reviewed | Initial feature spec, implementation roadmap, and progress tracker added. |

## Next Step

- Start Milestone 1: state and persistence

## Decisions and Open Questions

- Use a hybrid model: derived suggestions plus explicitly placed fittings.
- Count only placed fittings in parts.
- Keep the first usable slice small by starting with manual `Head takeoff` placement before auto-suggestions.
