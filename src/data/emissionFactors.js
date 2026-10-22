// Emission factors used by CarbonProof AI — pinned to published sources.
//
// Every factor below names its source publication. Electricity uses the
// Indian grid factor (the seeded organisation operates in India); fuels,
// flights and waste use the UK Government (DESNZ) GHG Conversion Factors,
// the most widely used public conversion-factor set. Pinning factors to a
// named edition — and showing the factor inside each record's calculation —
// is what makes the resulting CO2e figures auditable rather than asserted.
//
// Sources:
//  - CEA: Central Electricity Authority (India), CO2 Baseline Database —
//    grid emission factor (weighted average), FY 2023-24: 0.727 t CO2/MWh.
//  - DESNZ 2024: UK Department for Energy Security and Net Zero,
//    "Greenhouse gas reporting: conversion factors 2024".

export const EMISSION_FACTORS = {
  electricity: {
    label: 'Electricity',
    unit: 'kWh',
    factorKgPerUnit: 0.727,
    factorNote: 'Indian grid average, kg CO2e per kWh',
    source: 'CEA CO2 Baseline Database (India), FY 2023-24 weighted average grid emission factor',
    scope: 'Scope 2',
  },
  diesel: {
    label: 'Diesel',
    unit: 'litres',
    factorKgPerUnit: 2.5128,
    factorNote: 'Diesel (average biofuel blend, forecourt), kg CO2e per litre',
    source: 'UK DESNZ GHG Conversion Factors 2024 — Fuels: diesel (average biofuel blend)',
    scope: 'Scope 1',
  },
  petrol: {
    label: 'Petrol',
    unit: 'litres',
    factorKgPerUnit: 2.0844,
    factorNote: 'Petrol (average biofuel blend, forecourt), kg CO2e per litre',
    source: 'UK DESNZ GHG Conversion Factors 2024 — Fuels: petrol (average biofuel blend)',
    scope: 'Scope 1',
  },
  flight: {
    label: 'Business flight',
    unit: 'passenger-km',
    factorKgPerUnit: 0.18592,
    factorNote: 'Short-haul economy air travel incl. radiative-forcing uplift, kg CO2e per passenger-km',
    source: 'UK DESNZ GHG Conversion Factors 2024 — Air travel: short-haul, economy, with RF',
    scope: 'Scope 3',
  },
  waste: {
    label: 'Waste to landfill',
    unit: 'kg',
    factorKgPerUnit: 0.467,
    factorNote: 'Commercial & industrial waste landfilled, kg CO2e per kg (467 kg CO2e per tonne)',
    source: 'UK DESNZ GHG Conversion Factors 2024 — Waste disposal: commercial & industrial, landfill',
    scope: 'Scope 3',
  },
};

export const CATEGORY_KEYS = Object.keys(EMISSION_FACTORS);

export const FACTOR_SOURCES = [
  {
    name: 'CEA CO2 Baseline Database (India)',
    detail: 'Central Electricity Authority — grid emission factor, FY 2023-24 (0.727 t CO2/MWh, weighted average)',
  },
  {
    name: 'UK DESNZ GHG Conversion Factors 2024',
    detail: 'Department for Energy Security and Net Zero — fuels, air travel and waste-disposal factor tables',
  },
];
