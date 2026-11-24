# Release and maintenance roadmap

| Phase | Implementation and acceptance | State on 24 November 2026 |
| --- | --- | --- |
| 1 · Discovery | Inspect My Maps rights and export affordance. Inventory Persian and English sources, compare successive master-plan accounts and source-specific station rosters. | Completed for this snapshot. Signed plan annexes and an openly licensed official GIS release remain research gaps. |
| 2 · Foundation | Version the data model, establish licensed input boundaries, accessible bilingual controls, static publishing and automated validation. | Implemented. Decisions and dependency versions are recorded in the architecture and lockfile. |
| 3 · Operating network | Match independent ordered rosters for main services and branches. Resolve physical complexes. Validate every rail edge and endpoint against a pinned source. | All nine service sequences reconciled; 155 adjacent pairs traced. OSM positions of underground tracks remain approximate. |
| 4 · Future network | Review Lines 8–11, extensions and related suburban, express and light rail individually. Preserve source disagreements, line options and unknown geography. | 35 unlocated station records and 18 prospective service links. Reviewed project-specific details and open questions are in the research inventory. |
| 5 · Public interface | Implement real map, directories, confidence/status filters, bilingual labels, localized dates, shareable views, history, downloads and low-bandwidth/offline operation. | Implemented. Actual station hits, layer visibility, language changes, mobile flows and offline reload have test coverage. |
| 6 · Publication | Validate reviewed JSON, topology and exports; exercise the production build under the Pages path; release the tested artifact and verify public URLs. | Initial public deployment succeeded on 24 November 2026. The hosted checks verify the Pages artifact before publication. Subsequent releases also compare public data checksums and deep links. |
| 7 · Maintenance | Monitor approved sources, review changes, version records and release updates. | The Geofabrik source is enrolled for weekly read-only observation. Manual review is required for every source promotion. |

## Continuing research checklist

- [ ] Obtain the signed latest master-plan decision, route annexes, stable GIS metadata and reuse grants. Reconcile successive plan names and approval dates.
- [ ] Reconcile the municipality's reported 163 stations and 312 km against a published counting ledger. Track complex, platform, branch and route-length definitions separately.
- [ ] Fill historic operating dates beyond the 17 currently attributed to day-level evidence. Recompute historical coverage with each release.
- [ ] Review new line and extension milestones by component. For each, distinguish land acquisition, preparatory works, contract, tunnelling, equipment, test running and passenger opening.
- [ ] Verify future platform locations or uncertainty areas before geographic publication. Record new line variants alongside superseded options.
- [ ] Expand entrance, platform and accessibility coverage using authoritative passenger-access evidence, including changes to lift availability.
- [ ] Obtain voluntary reachability checks of the public Pages origin on mobile and fixed Iranian networks. Record date, ISP, public assets, export and offline-save outcome.
- [ ] Repeat keyboard, screen-reader, low-end device and GIS-client checks after material changes. Retain a release-tagged archive and review community corrections.

[Research inventory and unresolved claims](docs/RESEARCH.md) · [Release data and version](data/releases/current.json) · [Public deployment history](https://github.com/sinatabar/tehran-metro-atlas/actions/workflows/pages.yml)
