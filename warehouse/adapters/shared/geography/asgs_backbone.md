# ASGS geography backbone (shared, already national)

`core.dim_geography` holds the full national ASGS Edition 3 (2021) backbone
— every state's STATE/GCCSA/SA4/SA3/SA2/SA1/LGA/SAL/POA rows were loaded
once in Sprint 2. State adapters **query** this table (filtered by
`state_code`); they never create new geography rows.

Verified for Sprint 10 (see `sprint10_existing_state_audit.md`): Victoria
(`state_code='2'`) already has 2,944 SAL, 522 SA2, 80 LGA rows present.

State adapters are responsible only for **locality-name-to-SAL/POA
correspondence** — mapping their own source data's raw locality/suburb
strings onto the already-existing `geography_id` values, using
jurisdiction-specific alias lookup tables (e.g.
`warehouse/config/vic_locality_aliases.yml`) where the source's own naming
differs from ASGS's official suburb names.
