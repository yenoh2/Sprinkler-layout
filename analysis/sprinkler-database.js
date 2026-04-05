export async function loadIrrigationDatabase() {
  try {
    const response = await fetch(new URL("../sprinkler_data.json", import.meta.url));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const database = payload?.irrigation_system_database;
    if (!database) {
      throw new Error("Invalid database structure: missing irrigation_system_database");
    }
    return structuredClone(database);
  } catch (error) {
    console.error(
      "Failed to load sprinkler database from sprinkler_data.json. " +
      "The irrigation analysis engine will have no nozzle data. " +
      "Make sure sprinkler_data.json is accessible.",
      error,
    );
    return {
      system_logic_constraints: {},
      rotor_series: {},
      spray_series: {},
    };
  }
}
