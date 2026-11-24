# Data dictionary

`data/published/atlas.json` contains one dated release. The source of each fact is the reviewed input snapshot plus any explicit, separately stored evidence assertions. Regenerating the website never fetches or changes a source.

| Collection | Identity and meaning |
| --- | --- |
| `networks` | Passenger network and its line IDs. Lines are not inferred from their display numbers. |
| `lines` | One line per stable ID. The line can be operational while individual extension projects are under construction. `number` is its display designation. `color` may be null. |
| `stations` | One physical station record. The array of `lineIds` records its reviewed line associations. A directory-only station can have null geometry. |
| `services` | An ordered pattern with `lineId` and `stationIds`, or a separately scoped station-service assertion with `stationId`. Opposite directions and distinct branches may have their own patterns. The zero-based array position plus one gives a pattern-specific sequence. Planned service on an existing physical station stays separate from operating membership. |
| `complexes`, `interchanges` | Transfer relationships at reviewed shared stations using `stationIds` and operating `lineIds`. A complex describes shared facilities. An interchange describes transfer between lines. A branch change within one numbered line is not a cross-line interchange. |
| `platforms`, `entrances` | Passenger access features linked via `stationId` or `stationIds` when identifiable from sources. Missing access records say nothing about the availability of an entrance or accessibility. |
| `segments` | A mapped or documented part of a line. `startStationId` and `endStationId` can be null for records lacking endpoint evidence. Geometry may contain intermediate railway vertices. |
| `projects` | Extensions, active construction initiatives and development plans. `kind` distinguishes the type of work. |
| `alternatives` | Alternative alignments may carry individual sources, confidence, dates and geometry. Alternatives do not automatically contribute to route length. |
| `places` | Geographic anchors for neighborhood or landmark searches. Their existence does not establish a metro project in that area. |
| `sources` | Stable ID, original title, publisher, URL, publication date or null, retrieval date, type, reliability, rights, and available relevant line/station IDs. |
| `stationEvidence` | Independent source assertions attached to an existing physical station in the browser view. Original spatial lineage remains in `geometrySourceIds`. A conflict with a previous non-null field needs an explicit supersession. `placeEvidence` similarly joins editorial notes to named landmarks. The current release requires an independent passenger roster comparison on every operating OSM service pattern and evidence for every stop in those patterns. |
| `history`, `revisions` | Dated, sourced lifecycle observations per entity, and versioned editorial releases. Historic status and date confidence should be reviewed independently. Each revision can list the changed `entityIds`. Feature-level `revisionIds` can link back to the release notes. Prior input and output values remain accessible in Git history. |
| `metrics` | Computed from the validated release. See [Counting rules](#counting-rules). |

## Feature fields

Each spatially representable record has an immutable `id`, `name.fa`, `name.en`, `dataset`, `lineIds`, `sourceIds`, `status`, `confidence` and `geometry`. The geometry uses WGS84 longitude first and latitude second. Station longitude and latitude are available as `geometry.coordinates[0]` and `[1]`, and as CSV columns. IDs survive spelling changes. Add historical spellings to `aliases`; retain prior names as evidence. A display transliteration is an editorial translation unless the source specifies it.

Optional fields include `constructionStatus`, `effectiveFrom`, `effectiveTo`, `lastVerified`, `notes.fa/en`, `uncertaintyM`, and, where a source documents an area, `uncertaintyGeometry`. For stations, `opened`, `expected` (a day or an object containing `start` and/or `end`), `dateConfidence`, `district`, `neighborhood`, `landmarkIds`, `accessibility`, `complexId` and `interchange` are supported. An absent measurement or date is null. Empty arrays indicate no reviewed associations recorded in that collection. Review dates identify when an editor evaluated the evidence, not a field survey.

| Classification | Values |
| --- | --- |
| Lifecycle | `operational`, `temporarily_closed`, `under_construction`, `contract_awarded`, `approved`, `in_planning`, `proposed`, `suspended`, `cancelled`, `unknown` |
| Spatial confidence | `verified` exact supported location, `high` strong evidence with minor uncertainty, `approximate` general location, `indicative` schematic estimate, `unknown` insufficient spatial evidence |
| Segment alignment | `actual`, `official_planned`, `approximate_planned`, `schematic`, `unknown` |

A project can have a confirmed lifecycle status and unknown geometry. An unknown alignment or unknown location uses null geometry. OSM nodes can describe platforms or other representative points; the method used to pick a station point belongs with its OSM entity references. No radius should be inferred from a confidence category. A physical interchange point may sit at a different platform from one line’s traced endpoints. At Eram-e Sabz, the selected complex point and the Line 4 endpoint in the 23 November OSM extract are about 347 metres apart. The map retains both observed positions.

## Counting rules

- Count one operational line per operational line ID and one operational station per operational physical station ID. Transfers, directional patterns, platforms and branch origins cannot increment the physical-station total a second time.
- Count future lines from under-construction, contract-awarded, approved, planning and proposed line records. Report approved stations and stations under construction separately by physical station status. Planned service at an existing station affects the project/service inventory.
- `operationalLengthKm` and `plannedLengthKm` require a complete, sourced review of countable passenger corridors in `lengthCoverage`. Unique undirected coordinate edges are counted once within that review. Reviewers must exclude parallel tracks, alternate proposals and overlaps with different vertex spacing before asserting complete coverage. Unreviewed coverage yields null.
- `mappedPassengerLengthKm` sums unique source-edge contributions when the extraction supplies both `lengthKm` and `countedLengthKm` for every mapped operational segment. It measures published coverage; it may differ from audited operator network length.
- `knownOpeningsByDate` counts currently operational stations by documented opening day. `operationalStationsWithOpeningDate` gives its coverage. This partial series cannot establish a complete historical network size or count later closures.

### Reconciling the November 2026 snapshot

The reviewed roster has **145 physical stations**, **162 distinct station–line memberships** and **164 appearances on nine service patterns**. The last count includes same-line branch transfers. The 155 consecutive stop pairs on these patterns have traced OSM geometry. The distance between the first and last passenger stops totals **285.89 km** over unique reviewed passenger-path edges.

On 20 November 2026, Tasnim reported the mayor's figures of **163 stations and 312 km**. The statement gives no station-by-station reconciliation or geometric measurement convention. The atlas therefore retains the measured passenger coverage, the municipal statement and its own counting definitions separately. There is still no verified explanation for the remaining difference between 162 line memberships and 163 reported stations. [Mayor’s statement, 29 Aban 1405](https://newsmedia.tasnimnews.ir/fa/news/1405/08/29/3753660/زاکانی-سه-ورزشگاه-بزرگ-در-مناطق-4-15-و-18-تهران-احداث-می-شود) · [OSM measurement and branch coverage](OSM.md)

Formal publication structure is in [the JSON Schema](../data/schemas/atlas.schema.json). Cross-record rules, spatial bounds and date consistency checks are in [the validator](../scripts/atlas_model.py).
