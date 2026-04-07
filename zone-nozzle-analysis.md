# Zone Head and Nozzle Analysis

Generated from `chase-layout.json` and `sprinkler_data.json` using the shared analyzer in `analysis/irrigation-analysis.js`.

## Assumptions

- Design flow cap: 12.00 GPM per zone.
- Recommendation logic matches the in-app analyzer, so the report and UI stay in sync.
- Zone notes below come directly from the analyzer, including overlap-based rotor scoring when available.

## Zone East

- Heads analyzed: 5
- Estimated zone flow: 4.79 GPM
- Flow status: Within 12.00 GPM design cap
- Preferred family: Spray
- Average zone rate: 1.840 in/hr
- Head-level PR spread: 0.248 in/hr

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-21 | (679.5, 884.5) | spray | Rain Bird 1800 PRS | 12Q | 90 deg | 11.89 ft -> 12 ft | 0.65 GPM | 0.564 in/hr | Fixed arc 12Q normalized to 90 degrees. |
| S-22 | (890.2, 883.5) | spray | Rain Bird 1800 PRS | 18V (18-VAN) | 54 deg | 18.00 ft -> 18 ft | 0.80 GPM | 0.503 in/hr | Variable arc kept because the drawn arc is not close to a fixed spray pattern. |
| S-23 | (774.8, 883.5) | spray | Rain Bird 1800 PRS | 12H | 181 deg -> 180 deg | 10.30 ft -> 12 ft | 1.30 GPM | 0.751 in/hr | Fixed arc 12H normalized to 180 degrees. |
| S-25 | (794.4, 751.2) | spray | Rain Bird 1800 PRS | 15V (15-VAN) | 136 deg | 12.42 ft -> 15 ft | 1.40 GPM | 0.734 in/hr | Variable arc kept because the drawn arc is not close to a fixed spray pattern. |
| S-26 | (680.3, 749.1) | spray | Rain Bird 1800 PRS | 12Q | 89 deg -> 90 deg | 11.49 ft -> 12 ft | 0.65 GPM | 0.603 in/hr | Fixed arc 12Q normalized to 90 degrees. |

## Zone NE

- Heads analyzed: 6
- Estimated zone flow: 9.56 GPM
- Flow status: Within 12.00 GPM design cap
- Preferred family: Rotor
- Average zone rate: 0.923 in/hr
- Head-level PR spread: 0.208 in/hr

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-1 | (508.4, 403.0) | rotor | Rain Bird 5004 PRS | GQ (30ft_Green_Q_90) | 93 deg | 25.20 ft -> 30 ft | 1.40 GPM | 0.262 in/hr | Pre-balanced 30ft_Green Q_90 nozzle. |
| S-2 | (734.2, 313.4) | rotor | Rain Bird 5004 PRS | GT (30ft_Green_T_120) | 77 deg | 25.68 ft -> 30 ft | 1.85 GPM | 0.402 in/hr | Pre-balanced 30ft_Green T_120 nozzle. |
| S-4 | (769.1, 528.8) | rotor | Rain Bird 5004 PRS | GT (30ft_Green_T_120) | 177 deg | 22.76 ft -> 30 ft | 1.85 GPM | 0.223 in/hr | Pre-balanced 30ft_Green T_120 nozzle. |
| S-5 | (789.3, 746.9) | rotor | Rain Bird 5004 PRS | GT (30ft_Green_T_120) | 87 deg | 25.24 ft -> 30 ft | 1.85 GPM | 0.368 in/hr | Pre-balanced 30ft_Green T_120 nozzle. |
| S-6 | (547.4, 748.5) | rotor | Rain Bird 5004 PRS | GQ (30ft_Green_Q_90) | 90 deg | 25.12 ft -> 30 ft | 1.40 GPM | 0.272 in/hr | Pre-balanced 30ft_Green Q_90 nozzle. |
| S-20 | (553.3, 572.6) | rotor | Rain Bird 5004 PRS | RT (25ft_Red_T_120) | 195 deg | 18.77 ft -> 25 ft | 1.21 GPM | 0.194 in/hr | Pre-balanced 25ft_Red T_120 nozzle. |

### Notes

- Rotor zone overlap score 0.1492 (dry 0.0309, wet 0.0255, normalized spread 1.660) at 9.56 GPM using 2 family SKUs. Head-level PR spread 0.208 in/hr.

## Zone North

- Heads analyzed: 6
- Estimated zone flow: 8.14 GPM
- Flow status: Within 12.00 GPM design cap
- Preferred family: Spray
- Average zone rate: 1.659 in/hr
- Head-level PR spread: 0.154 in/hr

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-27 | (290.3, 624.5) | spray | Rain Bird 1800 PRS | 15H | 180 deg | 12.85 ft -> 15 ft | 1.85 GPM | 0.687 in/hr | Fixed arc 15H normalized to 180 degrees. |
| S-28 | (268.0, 500.8) | spray | Rain Bird 1800 PRS | 15H | 180 deg | 12.71 ft -> 15 ft | 1.85 GPM | 0.702 in/hr | Fixed arc 15H normalized to 180 degrees. |
| S-29 | (153.6, 518.2) | spray | Rain Bird 1800 PRS | 12H | 180 deg | 11.89 ft -> 12 ft | 1.30 GPM | 0.564 in/hr | Fixed arc 12H normalized to 180 degrees. |
| S-30 | (172.5, 626.9) | spray | Rain Bird 1800 PRS | 12H | 180 deg | 11.74 ft -> 12 ft | 1.30 GPM | 0.578 in/hr | Fixed arc 12H normalized to 180 degrees. |
| S-31 | (53.2, 651.0) | spray | Rain Bird 1800 PRS | 15Q | 90 deg | 12.54 ft -> 15 ft | 0.92 GPM | 0.718 in/hr | Fixed arc 15Q normalized to 90 degrees. |
| S-32 | (52.9, 530.0) | spray | Rain Bird 1800 PRS | 15Q | 95 deg -> 90 deg | 12.96 ft -> 15 ft | 0.92 GPM | 0.672 in/hr | Fixed arc 15Q normalized to 90 degrees. |

## Zone North2

- Heads analyzed: 4
- Estimated zone flow: 3.66 GPM
- Flow status: Within 12.00 GPM design cap
- Preferred family: Rotor
- Average zone rate: 0.721 in/hr
- Head-level PR spread: 0.169 in/hr

| Head | Location | Family | Body | Nozzle | Arc | Radius | Flow | Actual PR | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-16 | (522.4, 448.5) | rotor | Rain Bird 3504 | 1.0 | 97 deg | 18.13 ft -> 21 ft | 1.06 GPM | 0.367 in/hr | 3504 fallback rotor. Auto-resolved to keep the zone on the rotor family. |
| S-16 copy | (544.5, 624.5) | rotor | Rain Bird 3504 | 1.0 | 94 deg | 18.33 ft -> 21 ft | 1.06 GPM | 0.370 in/hr | 3504 fallback rotor. Auto-resolved to keep the zone on the rotor family. |
| S-16 copy | (384.9, 478.2) | rotor | Rain Bird 3504 | 0.75 | 180 deg | 15.15 ft -> 17 ft | 0.77 GPM | 0.206 in/hr | 3504 fallback rotor. Auto-resolved to keep the zone on the rotor family. |
| S-16 copy copy | (406.4, 624.5) | rotor | Rain Bird 3504 | 0.75 | 180 deg | 15.33 ft -> 17 ft | 0.77 GPM | 0.201 in/hr | 3504 fallback rotor. Auto-resolved to keep the zone on the rotor family. |

### Notes

- Auto-resolved mixed zone to the rotor family. Zone spread 0.344 -> 0.169 in/hr at 7.44 -> 3.66 GPM.

## Summary

- East: 4.79 GPM, OK.
- NE: 9.56 GPM, OK.
- North: 8.14 GPM, OK.
- North2: 3.66 GPM, OK.
