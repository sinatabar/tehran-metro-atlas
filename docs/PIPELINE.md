# Building and reviewing a release

The published atlas is reproducible offline using Python 3.9 or newer and its standard library. It has no runtime geocoding or external map requirement. Source extraction has separate optional tooling documented in [the OSM acquisition guide](OSM.md).

```sh
python3 scripts/build.py
python3 scripts/build.py --check
python3 -m unittest discover -s tests/data
```

Run `python3 -m pip install -r scripts/osm-requirements.txt` in a virtual environment to enable the independent GIS check. `python3 scripts/check_gis.py` runs GEOS validity checks and confirms coordinate-for-coordinate equivalence between GeoJSON, CSV/WKT and KML. The release tests check the compressed KMZ against that KML.

## Update path

1. Find the most direct operator, municipality, engineering or open geodata source. Read both Persian and English texts where possible. Identify the reporting date, the milestone being claimed and the component to which it applies.
2. Add a stable source record to `data/sources/registry.json` or the OSM snapshot inventory. Record the original URL, date accessed, publishing organization, source type, reliability and reuse terms. Unknown publication dates remain null.
3. Preserve a raw file only with permission. Pin snapshot identifiers and file hashes. For restricted documents, retain the source citation and independently written factual observations. A schematic may establish stop ordering without establishing location.
4. Normalize a candidate under `data/processed/`. Keep candidate files separate from `data/reviewed/`. For an OSM refresh, retain the previous reviewed file until its suggested replacements have been checked against the passenger roster.
5. Compare snapshots without changing them.

   ```sh
   python3 scripts/review_changes.py data/reviewed/osm/network.json data/processed/osm/network.json
   ```

6. Review added/deleted stations, changes of name, coordinate shifts, source dates, discontinuities, branch membership, physical transfers, reported openings and conflicts. Follow source IDs for both versions. Keep contrary claims and the reason for the decision. Human approval is the PR review of the promoted `data/reviewed/` diff. Review changes to status and spatial confidence separately.
7. Update the release date, version and revision note in `data/releases/current.json`, and add the human-readable change to the repository changelog. Run the three commands above. Inspect `data/published/quality.json` for disconnected components by line, operating stop pairs without a traced path and missing station geometry. An unmapped operating stop pair requires an explicit reviewed entry in the service’s `unmappedPairs` before it can be released. An operator roster comparison can use the reverse stopping order, but not a different physical station sequence. A disconnected component may be a separately operated branch. Document it in the OSM guide before calling a line's geometry complete.
8. Commit reviewed inputs and generated products together. The publication job builds the website from this same Git commit. Run the browser and package checks from the repository README before deploying. Archive previous release commits/tags to reproduce earlier states.

The builder validates all inputs and serializes the complete release in memory before replacing changed files. Each individual replacement is atomic. A CI failure blocks deployment. Run one writer per checkout; do not serve a checkout while regenerating it for public release. An interrupted local write recovers on the next build; `--check` rejects a mixed set. A release manifest with SHA-256 hashes identifies each product.

## Optional availability monitoring

`python3 scripts/monitor_sources.py` checks the documented [Geofabrik replication status](https://download.geofabrik.de/technical.html) with a conditional HTTP HEAD. Its endpoint is declared in `data/sources/monitoring.json`. The same command can include other source records explicitly marked `"monitor": true` after checking source policy. It returns availability, ETag and Last-Modified observations. The dated baseline `data/processed/monitoring/2026-11-24.json` was collected from the live replication endpoint. A conditional recheck returned unchanged. Pass this file or a later observation as `--baseline previous.json`; subsequent JSON reports include UTC timestamps. Changed validator values request editorial review. Empty validators or inaccessible hosts leave content freshness unresolved. Monitoring never uploads, promotes changes, or updates the atlas.

## Exports

Separate folders under `exports/osm/` and `exports/research/` contain interoperable UTF-8 records. Their `references.json` files contain the source registry subset, services and history. The research sidecar also includes independent station assertions. The browser joins the two data groups at read-model generation. Geometry and opendata attribution remain traceable. The combined browser JSON carries records with distinct reuse terms; consult [the data license](../DATA_LICENSE.md).

| Format | Contents and workflow |
| --- | --- |
| GeoJSON | RFC 7946 FeatureCollection with source IDs, URLs, bilingual names, release version and remaining normalized metadata. A feature can carry null geometry. Open the file directly in QGIS. |
| KML / KMZ | KML 2.2 Placemark and `ExtendedData`, with one `doc.kml` inside the compressed KMZ. Unlocated features retain metadata without a point. KML readers may hide these records. |
| CSV | UTF-8 with BOM for Persian. WKT supports QGIS and My Maps import. Separate longitude/latitude columns are populated only for point features. `metadata_json` retains nested properties. Ordinary columns that begin with formula operators are escaped for spreadsheet safety. |
| References and manifest | JSON sidecars retain non-geometric relations. Version and SHA-256 digests are in `exports/manifest.json`. |

My Maps accepts KML/KMZ up to 5 MB uncompressed and up to 2,000 imported rows per upload. Inspect the manifest and split large exports spatially or by line using QGIS before importing. In CSV imports choose the `WKT` column. Exclude rows without geometry from coordinate-based imports. Some KML metadata and geometries may be omitted by My Maps. Local GeoJSON/CSV plus sidecars preserve the complete inventory. GeoPackage is an optional QGIS conversion; the repository does not bundle a second authoritative geodatabase. [My Maps import guidance](https://support.google.com/mymaps/answer/3024836?hl=en) · [GeoJSON specification](https://www.rfc-editor.org/rfc/rfc7946) · [KML reference](https://developers.google.com/kml/documentation/kmlreference)
