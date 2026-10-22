// Emission factors used by CarbonProof AI.
//
// PROTOTYPE DEFAULTS: these are round, public-sector-style factors in the
// range published by widely used government/industry conversion-factor
// tables (grid electricity, road fuels, air travel, landfill waste).
// They are starting defaults for demonstration — NOT audited values and
// NOT tied to a specific cited edition. A production deployment should
// pin factors to a named, versioned source (e.g. a specific year's
// national conversion-factor release) and record that version per record.

export const EMISSION_FACTORS = {
  electricity: {
    label: 'Electricity',
    unit: 'kWh',
    factorKgPerUnit: 0.82,
    factorNote: 'Grid-average electricity, kg CO2e per kWh (prototype default)',
    scope: 'Scope 2',
  },
  diesel: {
    label: 'Diesel',
    unit: 'litres',
    factorKgPerUnit: 2.68,
    factorNote: 'Diesel fuel combustion, kg CO2e per litre (prototype default)',
    scope: 'Scope 1',
  },
  petrol: {
    label: 'Petrol',
    unit: 'litres',
    factorKgPerUnit: 2.31,
    factorNote: 'Petrol fuel combustion, kg CO2e per litre (prototype default)',
    scope: 'Scope 1',
  },
  flight: {
    label: 'Business flight',
    unit: 'passenger-km',
    factorKgPerUnit: 0.18,
    factorNote: 'Economy air travel average, kg CO2e per passenger-km (prototype default)',
    scope: 'Scope 3',
  },
  waste: {
    label: 'Waste to landfill',
    unit: 'kg',
    factorKgPerUnit: 0.45,
    factorNote: 'Mixed waste landfilled, kg CO2e per kg waste (prototype default)',
    scope: 'Scope 3',
  },
};

export const CATEGORY_KEYS = Object.keys(EMISSION_FACTORS);
