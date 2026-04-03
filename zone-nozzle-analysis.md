# Zone Head and Nozzle Analysis

Generated from `sprinkler-layout.json` and `sprinkler_data.json`.

## Assumptions

- Design flow cap: 14.00 GPM per zone.
- Spray versus rotor classification is based on whether any spray radius class in the dataset can meet the head under the no-undershoot plus allowed reduction rule, so larger spray options like `18-VAN` are preferred over mixing in rotors when they fit.
- Fixed spray arcs are normalized when the drawn arc is within +/-10 degrees of 90, 180, or 360 and that radius class has a fixed nozzle option.
- Fixed spray preference order is Rain Bird MPR first, then U-Series as a fallback when no matching MPR fixed nozzle exists at that radius and arc.
- All head types are assumed to allow up to 25% radius reduction with the screw adjustment.
- Rotor optimization compares Rain Bird 5004 PRS MPR pre-balanced sets plus the standard-angle 25 degree and low-angle 10 degree nozzle families.
- The 5004 PRS Red, Green, and Beige pre-balanced sets are treated as discrete fixed-flow nozzle choices: `Q_90`, `T_120`, `H_180`, and `F_360`.
- The 5004 standard-angle and low-angle nozzle entries use their listed `flow_gpm` directly as candidate head flow.
- Adjustable VAN spray nozzles use arc-aware flow. When the chart provides 90/180/270/360 GPM anchors, intermediate arcs are piecewise-linearly interpolated; otherwise flow is scaled linearly from 0 to the listed 360 degree GPM.
- Actual precipitation is recalculated per head from flow, installed arc, and target radius using `96.3 x GPM / sector area`, so installed sweep changes actual PR but does not change nozzle GPM.
- When rotor precipitation spread is within 0.010 in/hr, the optimizer favors simpler installs: fewer specialty nozzles, fewer low-angle heads, and fewer unique SKUs.
- When a mixed-family zone has a uniform dominant-family alternative within 0.030 in/hr of the current spread and without a worse flow overage, the selector auto-resolves to the dominant family.
- No undershoot is allowed for any head type; selected nominal radius must be greater than or equal to the required throw, and the closest qualifying radius is preferred.

## Zone East

- Heads analyzed: 6
- Estimated zone flow: 7.65 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-21 | (669.6, 893.1) | spray | Rain Bird 1800 PRS | 12Q | 90 deg | 12.00 ft -> 12 ft | 0.65 GPM | 0.553 in/hr | Fixed arc 12Q selected for 90 degrees. |
| S-22 | (875.6, 891.0) | spray | Rain Bird 1800 PRS | 15-VAN | 54 deg | 12.05 ft -> 15 ft | 0.55 GPM | 0.777 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-23 | (761.8, 888.5) | spray | Rain Bird 1800 PRS | 10H | 178 deg -> 180 deg | 10.00 ft -> 10 ft | 0.79 GPM | 0.484 in/hr | Fixed arc 10H selected for 180 degrees. |
| S-25 | (783.2, 758.9) | spray | Rain Bird 1800 PRS | 15-VAN | 128 deg | 12.53 ft -> 15 ft | 1.31 GPM | 0.721 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-26 | (679.7, 754.9) | spray | Rain Bird 1800 PRS | 12Q | 89 deg -> 90 deg | 11.60 ft -> 12 ft | 0.65 GPM | 0.593 in/hr | Fixed arc 12Q selected for 90 degrees. |
| S-32 | (743.2, 562.4) | spray | Rain Bird 1800 PRS | 15F | 360 deg | 15.00 ft -> 15 ft | 3.70 GPM | 0.504 in/hr | Fixed arc 15F selected for 360 degrees. |

### Notes

- Recommended precipitation values span 0.29 in/hr. Review for cross-family mismatch.

## Zone NE

- Heads analyzed: 6
- Estimated zone flow: 10.99 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-1 | (498.0, 408.0) | rotor | Rain Bird 5004 PRS | 30ft_Green_T_120 | 103 deg | 25.43 ft -> 30 ft | 1.85 GPM | 0.306 in/hr | Pre-balanced nozzle 30ft_Green_T_120 uses fixed 1.85 GPM; installed sweep stays 103 degrees and throw would be reduced 15.2%. |
| S-2 | (722.3, 317.1) | rotor | Rain Bird 5004 PRS | 30ft_Green_Q_90 | 78 deg | 25.91 ft -> 30 ft | 1.40 GPM | 0.295 in/hr | Pre-balanced nozzle 30ft_Green_Q_90 uses fixed 1.40 GPM; installed sweep stays 78 degrees and throw would be reduced 13.6%. |
| S-20 | (542.3, 580.0) | rotor | Rain Bird 5004 PRS | 25ft_Red_H_180 | 194 deg | 19.95 ft -> 25 ft | 1.98 GPM | 0.283 in/hr | Pre-balanced nozzle 25ft_Red_H_180 uses fixed 1.98 GPM; installed sweep stays 194 degrees and throw would be reduced 20.2%. |
| S-4 | (755.1, 539.1) | rotor | Rain Bird 5004 PRS | 30ft_Green_H_180 | 177 deg | 23.38 ft -> 30 ft | 2.96 GPM | 0.338 in/hr | Pre-balanced nozzle 30ft_Green_H_180 uses fixed 2.96 GPM; installed sweep stays 177 degrees and throw would be reduced 22.1%. |
| S-5 | (777.1, 758.3) | rotor | Rain Bird 5004 PRS | 30ft_Green_Q_90 | 87 deg | 25.17 ft -> 30 ft | 1.40 GPM | 0.280 in/hr | Pre-balanced nozzle 30ft_Green_Q_90 uses fixed 1.40 GPM; installed sweep stays 87 degrees and throw would be reduced 16.1%. |
| S-6 | (538.0, 756.5) | rotor | Rain Bird 5004 PRS | 30ft_Green_Q_90 | 90 deg | 25.00 ft -> 30 ft | 1.40 GPM | 0.275 in/hr | Pre-balanced nozzle 30ft_Green_Q_90 uses fixed 1.40 GPM; installed sweep stays 90 degrees and throw would be reduced 16.7%. |

### Notes

- Rotor zone optimized zone-wide for actual precipitation first, then install simplicity, then coverage reserve. Score: actual PR spread 0.063 in/hr, specialty heads 0, low-angle heads 0, unique SKUs 2, reserve 30.16 ft, flow 10.99 GPM.

## Zone North

- Heads analyzed: 6
- Estimated zone flow: 8.87 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-16 copy | (534.6, 624.4) | spray | Rain Bird 1800 PRS | 18-VAN | 93 deg | 18.00 ft -> 18 ft | 1.37 GPM | 0.503 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-16 copy copy | (397.1, 630.0) | spray | Rain Bird 1800 PRS | 15H | 181 deg -> 180 deg | 15.00 ft -> 15 ft | 1.85 GPM | 0.504 in/hr | Fixed arc 15H selected for 180 degrees. |
| S-27 | (277.6, 632.1) | spray | Rain Bird 1800 PRS | 15H | 180 deg | 12.84 ft -> 15 ft | 1.85 GPM | 0.688 in/hr | Fixed arc 15H selected for 180 degrees. |
| S-30 | (165.2, 634.4) | spray | Rain Bird 1800 PRS | 12H | 180 deg | 11.85 ft -> 12 ft | 1.30 GPM | 0.568 in/hr | Fixed arc 12H selected for 180 degrees. |
| S-31 | (46.9, 658.8) | spray | Rain Bird 1800 PRS | 15Q | 90 deg | 12.65 ft -> 15 ft | 0.92 GPM | 0.705 in/hr | Fixed arc 15Q selected for 90 degrees. |
| S-32 | (465.8, 550.4) | spray | Rain Bird 1800 PRS | 10F | 360 deg | 9.00 ft -> 10 ft | 1.58 GPM | 0.598 in/hr | Fixed arc 10F selected for 360 degrees. |

### Notes

- Recommended precipitation values span 0.20 in/hr. Review for cross-family mismatch.

## Zone North2

- Heads analyzed: 5
- Estimated zone flow: 7.28 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-16 | (512.1, 454.0) | spray | Rain Bird 1800 PRS | 18-VAN | 92 deg | 18.00 ft -> 18 ft | 1.36 GPM | 0.503 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-16 copy | (370.8, 486.9) | spray | Rain Bird 1800 PRS | 15H | 180 deg | 15.00 ft -> 15 ft | 1.85 GPM | 0.504 in/hr | Fixed arc 15H selected for 180 degrees. |
| S-28 | (258.0, 511.2) | spray | Rain Bird 1800 PRS | 15H | 180 deg | 12.67 ft -> 15 ft | 1.85 GPM | 0.707 in/hr | Fixed arc 15H selected for 180 degrees. |
| S-29 | (145.8, 524.7) | spray | Rain Bird 1800 PRS | 12H | 180 deg | 12.00 ft -> 12 ft | 1.30 GPM | 0.553 in/hr | Fixed arc 12H selected for 180 degrees. |
| S-32 | (45.7, 536.7) | spray | Rain Bird 1800 PRS | 15Q | 95 deg -> 90 deg | 13.08 ft -> 15 ft | 0.92 GPM | 0.659 in/hr | Fixed arc 15Q selected for 90 degrees. |

### Notes

- Recommended precipitation values span 0.20 in/hr. Review for cross-family mismatch.

## Summary

- East: 7.65 GPM, OK.
- NE: 10.99 GPM, OK.
- North: 8.87 GPM, OK.
- North2: 7.28 GPM, OK.
