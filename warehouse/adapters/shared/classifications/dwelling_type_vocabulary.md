# Shared canonical dwelling-type vocabulary

`detached_house`, `apartment_unit`, `townhouse_villa_semidetached`,
`residential_land`, `other_residential`, `unknown_residential`.

Every jurisdiction adapter maps its own source's raw property-type field
into exactly these 6 values via a documented, deterministic,
evidence-only mapping (never inferred from price, suburb, or postcode). See
`warehouse/docs/NSW_DWELLING_TYPE_CLASSIFICATION.md` and
`warehouse/docs/VIC_DWELLING_TYPE_CLASSIFICATION.md` for the per-state rule
sets. No adapter introduces a 7th value or redefines what any of these 6
mean — see `warehouse/docs/CANONICAL_PROPERTY_DATA_CONTRACTS.md`.
