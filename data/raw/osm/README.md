# OpenStreetMap source snapshots

Map data © OpenStreetMap contributors. The compact raw and processed snapshots and reviewed OSM database are available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Geofabrik supplied the source-country extract. [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright) · [Geofabrik Iran](https://download.geofabrik.de/asia/iran.html)

Each dated directory contains the extraction manifest, compact public passenger objects with OSM IDs and a generalized set of context objects. The manifest pins the original PBF SHA-256, OSM replication timestamp and SHA-256 for both compressed data files. The extractor retains only the documented passenger/context fields and their object versions. The tracked files omit contributor account identifiers and changeset metadata.

Raw files and reviewed outputs are available in the source distribution. Intermediate copies under `data/processed/osm/` reproduce the reviewed derived data. Public GIS downloads provide the passenger geography and separate machine-readable references. The static basemap file and its companion provenance index are distributed alongside the application dataset. [Extraction, validation and release instructions](../../../docs/OSM.md)
