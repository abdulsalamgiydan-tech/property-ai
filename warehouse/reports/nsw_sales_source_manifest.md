# NSW Valuer General Sales Source Manifest (Sprint 5, archive added Sprint 11 WS8)

Generated: 2026-07-20T09:21:17.829Z. Archive entry updated: 2026-07-22.
Status: 1 discovered (2001-current),
1 built_and_validated_local_store (1990-2000 archive — built and validated in
Sprint 11 Workstream 8, branch promotion deliberately not yet attempted).

## Primary source

**NSW Valuer General Property Sales Information (PSI)**, official bulk download:
https://valuation.property.nsw.gov.au/embed/propertySalesInformation

- Annual bundles: `https://www.valuergeneral.nsw.gov.au/__psi/yearly/<YYYY>.zip`
- Current-year weekly files: `https://www.valuergeneral.nsw.gov.au/__psi/weekly/<YYYYMMDD>.zip`
- Format: ';'-delimited `.DAT` text files, one per district per week
- Licence: CC BY 4.0. History: 2001-07 onward (this sprint), 1990-2000 archive
  now built (Sprint 11 WS8) — same `__psi/yearly/<YYYY>.zip` URL pattern, but a
  materially different, older record format (verified against the official
  fact sheet; see `warehouse/docs/NSW_SALES_ARCHIVE_1990_2000_METHOD.md`).

## Access method

The bulk-download path sits behind a Cloudflare managed JS challenge (confirmed:
plain HTTP returns 403). Per project instructions, files were retrieved through a
real headed browser session using the official listing page's own download links.

## Verification this run

- Listing page (plain HTTP): 200
- Bulk endpoint (plain HTTP, 403/challenge expected): 403
- Annual bundles on disk: 2021.zip, 2022.zip, 2023.zip, 2024.zip, 2025.zip
- Weekly files on disk: 16

## Known limitations

- Non-arm's-length/nominal transfers must be flagged, never included in price stats.
- District code is not LGA name — this pipeline matches suburb-name/postcode text
  fields against a pilot allow-list derived spatially from the ASGS backbone.
- No ASGS code on source records — text-matching join carries lower confidence
  than the SA1-allocation joins used in Sprints 2-4.

## Next actions

Run `build_nsw_sales_local_store.mjs` to parse the already-downloaded archives,
filter to the pilot LGA suburbs/postcodes, and build the local DuckDB store.
