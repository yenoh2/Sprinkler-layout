# Sprinkler Layout Tool Requirements

## 1. Purpose

The sprinkler layout tool shall allow a user to load a scale drawing of a yard, calibrate that drawing to a real-world measurement, and place sprinklers accurately in that scale. The tool shall visualize sprinkler throw coverage with arcs, highlight overlap density so users can see where coverage is weak or excessive, and collect basic hydraulic inputs needed to assess whether a proposed layout is feasible.

## 2. Goals

- Enable accurate sprinkler placement on top of a yard plan or site drawing.
- Preserve real-world scale so throw distances and spacing are meaningful.
- Make coverage easy to interpret visually, especially overlap count.
- Collect supply line size and pressure as required project inputs.
- Support practical residential yard planning workflows.

## 3. Non-Goals

- Full hydraulic simulation for friction loss across every branch and fitting.
- Automatic pipe routing or trench planning in the first version.
- Valve wiring, controller programming, or irrigation scheduling.
- Plant-specific watering recommendations beyond sprinkler coverage layout.

## 4. Primary Users

- Homeowners planning a new sprinkler system.
- Contractors creating rough irrigation layouts for customers.
- Designers validating sprinkler spacing and coverage on residential properties.

## 5. Core User Stories

- As a user, I want to import a yard drawing so I can design on top of an existing plan.
- As a user, I want to calibrate the drawing to a known measurement so all distances are accurate.
- As a user, I want to place sprinklers at exact positions on the scaled drawing.
- As a user, I want each sprinkler to display its throw arc so I can see covered areas immediately.
- As a user, I want overlap areas to appear darker or denser so I can identify under-watered and over-watered spots.
- As a user, I want to enter supply line size and pressure so the design reflects available water conditions.
- As a user, I want to adjust sprinkler properties such as radius and arc angle so I can model different heads and nozzles.
- As a user, I want to move, rotate, or delete sprinklers so I can iterate on the layout quickly.

## 6. Functional Requirements

### 6.1 Project Setup

- The system shall allow the user to create a new layout project.
- The system shall allow the user to load a background drawing or image of the yard.
- Supported drawing/image formats should include at minimum `PNG`, `JPG`, and `PDF` if feasible.
- The system shall store project metadata including project name, units, supply line size, and supply pressure.

### 6.2 Scale Calibration

- The system shall allow the user to define the drawing scale after import.
- The system shall support two scale calibration methods:
- Method 1: Enter a known drawing scale such as `1 in = 10 ft`.
- Method 2: Click two points on the drawing and enter the real-world distance between them.
- The system shall convert on-screen distances into real-world units after calibration.
- The system shall support at minimum `feet` and `meters`.
- The system shall display the current scale clearly in the interface.
- The system shall prevent sprinkler placement calculations until scale is defined, unless the user explicitly chooses a non-scaled draft mode.
- The system shall allow recalibration after sprinklers are already placed and update positions and coverage accordingly.

### 6.3 Drawing Canvas and Interaction

- The system shall display the imported yard drawing as a background layer.
- The system shall support zooming and panning on the drawing canvas.
- The system shall allow the user to toggle grid visibility.
- The system shall allow optional snap-to-grid and snap-to-object behavior.
- The system shall show cursor coordinates in real-world units.
- The system shall support selecting one or more sprinklers on the canvas.
- The system shall allow drag-and-drop repositioning of sprinklers.
- The system shall support undo and redo for placement and editing operations.

### 6.4 Sprinkler Placement

- The system shall allow the user to place a sprinkler by clicking on the canvas.
- The system shall support at minimum these sprinkler types:
- Full-circle head.
- Part-circle head with configurable start and end angle.
- Strip or rectangular pattern head, if included in scope later.
- For arc-based heads, the system shall allow configuration of:
- Throw radius.
- Arc angle or start/end angles.
- Rotation/orientation.
- Spray type or nozzle type label.
- Each sprinkler shall be represented by a visible symbol at its origin point.
- Each sprinkler shall display its current throw distance on the plan using the active scale.
- The system shall allow direct numeric editing of sprinkler coordinates and throw radius.

### 6.5 Coverage Visualization

- The system shall render each sprinkler’s coverage as an arc, wedge, or circle corresponding to its configured pattern.
- Coverage rendering shall align to the calibrated drawing scale.
- The system shall show the edge of the throw area clearly enough that a user can distinguish exact reach.
- The system shall allow the user to toggle individual sprinkler coverage visibility on and off.
- The system shall allow the user to toggle all coverage overlays on and off.
- The system shall support a semi-transparent fill for each sprinkler coverage area.

### 6.6 Overlap Density Visualization

- When two or more sprinkler coverage areas overlap, the overlapping region shall be visually darker or otherwise denser than single-coverage regions.
- The overlap visualization shall work through layered transparency or an equivalent method that makes coverage count easy to interpret.
- The visual system shall make at least these states distinguishable:
- No coverage.
- Single coverage.
- Double coverage.
- Triple or greater coverage.
- The system should provide a legend explaining the overlap intensity scale.
- The system should offer an alternate heatmap mode if later implemented, but layered arc transparency is the required baseline.
- Overlap visualization shall update immediately when sprinklers are added, moved, rotated, resized, hidden, or deleted.

### 6.7 Hydraulic Inputs

- The system shall require entry of supply line size for each project.
- The system shall require entry of available supply pressure for each project.
- Supply line size shall support common nominal sizes such as `3/4 in`, `1 in`, `1 1/4 in`, and `1 1/2 in`.
- Supply pressure shall support user entry in `psi` and optionally `kPa`.
- The system shall validate that supply pressure is a positive number within a reasonable range.
- The system shall allow editing of hydraulic inputs after project creation.
- The system shall display hydraulic inputs in the project summary.

### 6.8 Basic Feasibility Guidance

- The system shall use supply line size and pressure as project constraints for layout review.
- The first version shall at minimum warn the user that available pressure and line size affect the number of heads that can run per zone.
- The system should provide informational guidance when a selected sprinkler radius appears unrealistic for the entered pressure.
- If full hydraulic calculations are not implemented, the interface shall clearly state that hydraulic feasibility is advisory, not guaranteed.

### 6.9 Measurement and Validation Tools

- The system shall provide a measurement tool for checking distances on the plan.
- The system shall allow the user to inspect the distance between two sprinkler heads.
- The system shall allow the user to compare head-to-head spacing against throw radius.
- The system should identify uncovered gaps within user-defined lawn areas if such areas are later modeled explicitly.

### 6.10 Data Persistence

- The system shall allow the user to save a project and reopen it later.
- A saved project shall retain:
- Imported drawing reference.
- Scale calibration.
- Sprinkler placements.
- Sprinkler settings.
- Coverage visualization settings.
- Hydraulic inputs.
- The system shall allow export of the layout as an image or PDF including the background drawing and overlays.

## 7. Data Model Requirements

### 7.1 Project

- Project name.
- Units.
- Background drawing reference.
- Scale calibration definition.
- Supply line size.
- Supply pressure.
- Created date.
- Updated date.

### 7.2 Sprinkler Entity

- Unique identifier.
- X and Y position on the drawing.
- Position expressed in canvas coordinates and scaled real-world coordinates.
- Throw radius.
- Coverage type.
- Start angle.
- End angle or arc sweep.
- Rotation.
- Visual style or category.
- Optional label or zone assignment.

### 7.3 Visualization Settings

- Coverage fill opacity.
- Coverage stroke visibility.
- Overlap mode enabled or disabled.
- Grid enabled or disabled.
- Units display preference.

## 8. User Interface Requirements

- The main workspace shall include a drawing canvas and a properties panel.
- The properties panel shall expose project settings and selected sprinkler settings.
- The scale calibration workflow shall be easy to discover immediately after drawing import.
- The interface shall make it clear whether the drawing is calibrated.
- The interface shall display real-world dimensions rather than only pixel distances.
- The sprinkler placement workflow shall require no more than a few actions:
- Select sprinkler type.
- Click to place.
- Adjust radius and arc.
- The overlap visualization shall remain readable over varied background drawings.
- The user shall be able to adjust overlay opacity if the background drawing becomes hard to read.

## 9. Validation Rules

- A project shall not be marked ready for layout review until scale, supply line size, and supply pressure are entered.
- Throw radius shall be greater than zero.
- Arc sweep shall be greater than zero and less than or equal to 360 degrees.
- Supply pressure shall be greater than zero.
- Scale calibration shall be rejected if the reference distance is zero or invalid.
- Imported drawing dimensions shall be validated before display.

## 10. Performance Requirements

- Canvas interaction shall remain responsive during pan, zoom, and drag operations.
- Coverage overlays shall update with no noticeable lag for small to medium residential projects.
- The baseline target should support at least 100 placed sprinklers while maintaining usable interaction performance on a typical desktop browser.

## 11. Accessibility Requirements

- Overlap density shall not rely solely on color differences; opacity, shading, pattern, or legend cues should also help interpretation.
- Controls shall be keyboard accessible where practical.
- Text and controls shall maintain readable contrast.
- Units and numeric values shall be presented clearly and consistently.

## 12. Assumptions

- The imported yard drawing is sufficiently accurate for scaled layout work.
- Users know at least one real-world dimension on the plan for calibration if no explicit drawing scale is provided.
- Hydraulic inputs are supplied manually by the user.
- The first version focuses on 2D planning rather than terrain elevation analysis.

## 13. Risks and Open Considerations

- Overlap darkening based purely on alpha compositing may become difficult to interpret at high overlap counts; a capped scale or legend may be needed.
- PDF import may require rasterization or a separate rendering pipeline.
- Hydraulic guidance can be misleading if users assume it replaces full irrigation design calculations.
- Different sprinkler manufacturers have different throw characteristics, so default radius behavior must be clearly user-controlled.

## 14. Acceptance Criteria

- A user can import a yard drawing and calibrate it using a known distance.
- A user can place sprinklers and see their throw arcs rendered to scale on the drawing.
- Moving or editing a sprinkler updates the throw visualization immediately.
- Overlapping coverage areas become visibly darker or otherwise denser as overlap count increases.
- A user must enter supply line size and supply pressure as part of project setup or review.
- Saved projects reopen with the same drawing, scale, sprinkler placements, and hydraulic inputs intact.
- The exported layout clearly shows sprinkler positions and coverage arcs on top of the yard drawing.

## 15. Recommended Future Enhancements

- Zone grouping and valve assignment.
- Pipe routing assistance.
- Manufacturer nozzle libraries.
- Pressure loss estimation by zone and pipe run.
- Coverage analysis for lawn polygons only, excluding hardscape and buildings.
- Automatic head-to-head spacing suggestions.
- Mobile and tablet field markup support.
