# Zone Head and Nozzle Analysis

Generated from `sprinkler-layout.json` and `sprinkler_data.json`.

## Assumptions

- Design flow cap: 14.00 GPM per zone.
- Spray heads are recommended for plan radii up to 15 ft; larger throws are treated as rotor zones.
- Fixed spray arcs are normalized when the drawn arc is within +/-10 degrees of 90, 180, or 360 and that radius class has a fixed nozzle option.
- All head types are assumed to allow up to 25% radius reduction with the screw adjustment.
- Rotor optimization compares Rain Bird 5004 PRS MPR pre-balanced sets plus the standard-angle 25 degree and low-angle 10 degree nozzle families.
- The 5004 PRS Red, Green, and Beige pre-balanced sets are treated as discrete fixed-flow nozzle choices: `Q_90`, `T_120`, `H_180`, and `F_360`.
- The 5004 standard-angle and low-angle nozzle entries use their listed `flow_gpm` directly as candidate head flow.
- Actual precipitation is recalculated per head from flow, installed arc, and target radius using `96.3 x GPM / sector area`, so installed sweep changes actual PR but does not change nozzle GPM.
- When rotor precipitation spread is within 0.010 in/hr, the optimizer favors simpler installs: fewer specialty nozzles, fewer low-angle heads, and fewer unique SKUs.
- No undershoot is allowed for any head type; selected nominal radius must be greater than or equal to the required throw, and the closest qualifying radius is preferred.

## Zone East

- Heads analyzed: 6
- Estimated zone flow: 6.56 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-21 | (669.6, 893.1) | spray | Rain Bird 1800 PRS | U-12 | 90 deg | 12.00 ft -> 12 ft | 0.60 GPM | 0.511 in/hr | Fixed arc U-12 selected for 90 degrees. |
| S-22 | (875.6, 891.0) | spray | Rain Bird 1800 PRS | HE-VAN-15 | 54 deg | 12.05 ft -> 15 ft | 0.56 GPM | 0.785 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-23 | (761.8, 888.5) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 178 deg | 10.00 ft -> 10 ft | 0.80 GPM | 0.497 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-24 | (806.7, 802.9) | spray | Rain Bird 1800 PRS | U-12 | 180 deg | 10.07 ft -> 12 ft | 1.20 GPM | 0.725 in/hr | Fixed arc U-12 selected for 180 degrees. |
| S-25 | (777.8, 758.6) | spray | Rain Bird 1800 PRS | HE-VAN-15 | 213 deg | 12.53 ft -> 15 ft | 2.20 GPM | 0.726 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-26 | (669.5, 757.6) | spray | Rain Bird 1800 PRS | U-12 | 180 deg | 12.00 ft -> 12 ft | 1.20 GPM | 0.511 in/hr | Fixed arc U-12 selected for 180 degrees. |

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
| S-20 | (542.3, 580.0) | rotor | Rain Bird 5004 PRS | 25ft_Red_H_180 | 196 deg | 19.95 ft -> 25 ft | 1.98 GPM | 0.280 in/hr | Pre-balanced nozzle 25ft_Red_H_180 uses fixed 1.98 GPM; installed sweep stays 196 degrees and throw would be reduced 20.2%. |
| S-4 | (761.3, 535.7) | rotor | Rain Bird 5004 PRS | 30ft_Green_H_180 | 175 deg | 24.07 ft -> 30 ft | 2.96 GPM | 0.322 in/hr | Pre-balanced nozzle 30ft_Green_H_180 uses fixed 2.96 GPM; installed sweep stays 175 degrees and throw would be reduced 19.8%. |
| S-5 | (777.1, 758.3) | rotor | Rain Bird 5004 PRS | 30ft_Green_Q_90 | 87 deg | 25.00 ft -> 30 ft | 1.40 GPM | 0.284 in/hr | Pre-balanced nozzle 30ft_Green_Q_90 uses fixed 1.40 GPM; installed sweep stays 87 degrees and throw would be reduced 16.7%. |
| S-6 | (538.0, 756.5) | rotor | Rain Bird 5004 PRS | 30ft_Green_Q_90 | 90 deg | 25.00 ft -> 30 ft | 1.40 GPM | 0.275 in/hr | Pre-balanced nozzle 30ft_Green_Q_90 uses fixed 1.40 GPM; installed sweep stays 90 degrees and throw would be reduced 16.7%. |

### Notes

- Rotor zone optimized zone-wide for actual precipitation first, then install simplicity, then coverage reserve. Score: actual PR spread 0.048 in/hr, specialty heads 0, low-angle heads 0, unique SKUs 2, reserve 29.64 ft, flow 10.99 GPM.

## Zone North

- Heads analyzed: 11
- Estimated zone flow: 16.03 GPM
- Flow status: Over 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-16 | (512.1, 454.0) | spray | Rain Bird 1800 PRS | U-15 | 180 deg | 15.00 ft -> 15 ft | 1.85 GPM | 0.504 in/hr | Fixed arc U-15 selected for 180 degrees. |
| S-16 copy | (535.5, 630.0) | spray | Rain Bird 1800 PRS | U-15 | 90 deg | 15.00 ft -> 15 ft | 0.92 GPM | 0.501 in/hr | Fixed arc U-15 selected for 90 degrees. |
| S-16 copy | (370.8, 486.9) | spray | Rain Bird 1800 PRS | U-15 | 180 deg | 15.00 ft -> 15 ft | 1.85 GPM | 0.504 in/hr | Fixed arc U-15 selected for 180 degrees. |
| S-16 copy copy | (397.1, 630.0) | spray | Rain Bird 1800 PRS | U-15 | 181 deg -> 180 deg | 15.00 ft -> 15 ft | 1.85 GPM | 0.504 in/hr | Fixed arc U-15 selected for 180 degrees. |
| S-19 | (494.5, 543.9) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 360 deg | 10.00 ft -> 10 ft | 1.62 GPM | 0.497 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-27 | (277.6, 632.1) | spray | Rain Bird 1800 PRS | U-15 | 180 deg | 12.84 ft -> 15 ft | 1.85 GPM | 0.688 in/hr | Fixed arc U-15 selected for 180 degrees. |
| S-28 | (258.0, 511.2) | spray | Rain Bird 1800 PRS | U-15 | 180 deg | 12.67 ft -> 15 ft | 1.85 GPM | 0.707 in/hr | Fixed arc U-15 selected for 180 degrees. |
| S-29 | (145.8, 524.7) | spray | Rain Bird 1800 PRS | U-12 | 180 deg | 12.00 ft -> 12 ft | 1.20 GPM | 0.511 in/hr | Fixed arc U-12 selected for 180 degrees. |
| S-30 | (165.2, 634.4) | spray | Rain Bird 1800 PRS | U-12 | 180 deg | 11.85 ft -> 12 ft | 1.20 GPM | 0.524 in/hr | Fixed arc U-12 selected for 180 degrees. |
| S-31 | (46.9, 658.8) | spray | Rain Bird 1800 PRS | U-15 | 90 deg | 12.65 ft -> 15 ft | 0.92 GPM | 0.705 in/hr | Fixed arc U-15 selected for 90 degrees. |
| S-32 | (45.7, 536.7) | spray | Rain Bird 1800 PRS | U-15 | 95 deg -> 90 deg | 13.08 ft -> 15 ft | 0.92 GPM | 0.659 in/hr | Fixed arc U-15 selected for 90 degrees. |

### Notes

- Zone exceeds the 14.00 GPM design cap by 2.03 GPM.
- Recommended precipitation values span 0.21 in/hr. Review for cross-family mismatch.

### Suggested Split

- spray-15 group: 12.01 GPM (S-16, S-16 copy, S-16 copy, S-16 copy copy, S-27, S-28, S-31, S-32).
- spray-12 + spray-10 group: 4.02 GPM (S-29, S-30, S-19).

## Zone W

- Heads analyzed: 9
- Estimated zone flow: 5.83 GPM
- Flow status: Within 14 GPM

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-12 | (161.5, 787.6) | spray | Rain Bird 1800 PRS | U-12 | 90 deg | 12.00 ft -> 12 ft | 0.60 GPM | 0.511 in/hr | Fixed arc U-12 selected for 90 degrees. |
| S-13 | (45.7, 786.9) | spray | Rain Bird 1800 PRS | U-12 | 90 deg | 12.00 ft -> 12 ft | 0.60 GPM | 0.511 in/hr | Fixed arc U-12 selected for 90 degrees. |
| S-14 | (161.5, 920.9) | spray | Rain Bird 1800 PRS | U-12 | 90 deg | 12.00 ft -> 12 ft | 0.60 GPM | 0.511 in/hr | Fixed arc U-12 selected for 90 degrees. |
| S-15 | (138.1, 920.9) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 90 deg | 10.00 ft -> 10 ft | 0.41 GPM | 0.497 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-7 | (44.7, 1121.1) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 89 deg | 9.75 ft -> 10 ft | 0.40 GPM | 0.522 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-7 copy | (138.1, 1121.1) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 91 deg | 9.75 ft -> 10 ft | 0.41 GPM | 0.522 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-7 copy | (44.3, 1029.5) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 180 deg | 9.91 ft -> 10 ft | 0.81 GPM | 0.506 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-7 copy copy | (138.0, 1027.0) | spray | Rain Bird 1800 PRS | HE-VAN-10 | 180 deg | 9.94 ft -> 10 ft | 0.81 GPM | 0.503 in/hr | Variable arc selected because the drawn arc is not close to a fixed pattern or the radius class is variable-only. |
| S-7 copy copy | (47.2, 936.3) | spray | Rain Bird 1800 PRS | U-12 | 180 deg | 10.08 ft -> 12 ft | 1.20 GPM | 0.724 in/hr | Fixed arc U-12 selected for 180 degrees. |

### Notes

- Recommended precipitation values span 0.23 in/hr. Review for cross-family mismatch.

## Summary

- East: 6.56 GPM, OK.
- NE: 10.99 GPM, OK.
- North: 16.03 GPM, Over 14 GPM.
- W: 5.83 GPM, OK.
