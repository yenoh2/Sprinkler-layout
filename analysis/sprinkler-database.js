const FALLBACK_DATABASE = {
  irrigation_system_database: {
    system_logic_constraints: {
      main_line_size_inch: 1,
      design_flow_limit_gpm: 14,
      supply_pressure_psi: 76,
      regulation_targets: {
        rotors_psi: 45,
        sprays_psi: 30,
      },
    },
    rotor_series: {
      rain_bird_5004_prs: {
        nominal_pressure_psi: 45,
        mechanical_specs: {
          inlet_size: "3/4 inch NPT",
          max_radius_reduction_pct: 25,
          arc_range: "40 to 360 degrees",
        },
        standard_angle_25_deg: [
          { nozzle: "1.5", radius_ft: 35, flow_gpm: 1.54 },
          { nozzle: "2.0", radius_ft: 37, flow_gpm: 2.07 },
          { nozzle: "3.0", radius_ft: 40, flow_gpm: 3.09 },
          { nozzle: "4.0", radius_ft: 42, flow_gpm: 4.01 },
          { nozzle: "6.0", radius_ft: 46, flow_gpm: 6.01 },
        ],
        low_angle_10_deg: [
          { nozzle: "1.0_LA", radius_ft: 29, flow_gpm: 1.05 },
          { nozzle: "1.5_LA", radius_ft: 31, flow_gpm: 1.58 },
          { nozzle: "3.0_LA", radius_ft: 35, flow_gpm: 3.07 },
        ],
        mpr_pre_balanced_sets: [
          { set: "25ft_Red", Q_90: 1.0, T_120: 1.21, H_180: 1.98, F_360: 3.82 },
          { set: "30ft_Green", Q_90: 1.4, T_120: 1.85, H_180: 2.96, F_360: 5.78 },
          { set: "35ft_Beige", Q_90: 1.92, T_120: 2.58, H_180: 3.9, F_360: 7.62 },
        ],
      },
      rain_bird_3504: {
        target_pressure_psi: 45,
        mechanical_specs: {
          inlet_size: "1/2 inch NPT",
          max_radius_reduction_pct: 35,
          notes: "Requires external regulation if line PSI > 55",
        },
        standard_nozzles: [
          { nozzle: "0.75", radius_ft: 17, flow_gpm: 0.77, precip_in_hr_square: 0.51 },
          { nozzle: "1.0", radius_ft: 21, flow_gpm: 1.06, precip_in_hr_square: 0.46 },
          { nozzle: "1.5", radius_ft: 24, flow_gpm: 1.48, precip_in_hr_square: 0.49 },
          { nozzle: "2.0", radius_ft: 27, flow_gpm: 1.93, precip_in_hr_square: 0.51 },
          { nozzle: "3.0", radius_ft: 31, flow_gpm: 3.0, precip_in_hr_square: 0.6 },
          { nozzle: "4.0", radius_ft: 35, flow_gpm: 4.13, precip_in_hr_square: 0.65 },
        ],
      },
    },
    spray_series: {
      rain_bird_1800_prs: {
        target_pressure_psi: 30,
        mechanical_specs: {
          inlet_size: "1/2 inch NPT",
          max_radius_reduction_pct: 25,
          regulation_type: "Internal stem (PRS)",
        },
        u_series_fixed_mpr: [
          { series: "U-15", arc: "90", radius_ft: 15, flow_gpm: 0.92, precip_in_hr: 1.58 },
          { series: "U-15", arc: "180", radius_ft: 15, flow_gpm: 1.85, precip_in_hr: 1.58 },
          { series: "U-15", arc: "360", radius_ft: 15, flow_gpm: 3.7, precip_in_hr: 1.58 },
          { series: "U-12", arc: "90", radius_ft: 12, flow_gpm: 0.6, precip_in_hr: 1.61 },
          { series: "U-12", arc: "180", radius_ft: 12, flow_gpm: 1.2, precip_in_hr: 1.61 },
          { series: "U-12", arc: "360", radius_ft: 12, flow_gpm: 2.4, precip_in_hr: 1.61 },
        ],
        he_van_high_efficiency: [
          { model: "HE-VAN-15", max_radius_ft: 15, flow_gpm_360: 3.72, precip_avg: 1.58 },
          { model: "HE-VAN-12", max_radius_ft: 12, flow_gpm_360: 2.44, precip_avg: 1.61 },
          { model: "HE-VAN-10", max_radius_ft: 10, flow_gpm_360: 1.62, precip_avg: 1.58 },
        ],
        van_series_variable_arc: [
          {
            model: "15-VAN",
            max_radius_ft: 15,
            flow_gpm_90: 0.92,
            flow_gpm_180: 1.85,
            flow_gpm_270: 2.78,
            flow_gpm_360: 3.7,
            precip_avg: 1.58,
          },
          {
            model: "18-VAN",
            max_radius_ft: 18,
            flow_gpm_90: 1.33,
            flow_gpm_180: 2.66,
            flow_gpm_270: 3.99,
            flow_gpm_360: 5.32,
            precip_avg: 1.58,
          },
        ],
      },
    },
  },
};

export async function loadIrrigationDatabase() {
  const fallback = structuredClone(FALLBACK_DATABASE.irrigation_system_database);

  try {
    const response = await fetch(new URL("../sprinkler_data.json", import.meta.url));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return structuredClone(payload?.irrigation_system_database ?? fallback);
  } catch (error) {
    console.warn("Falling back to embedded sprinkler database.", error);
    return fallback;
  }
}
