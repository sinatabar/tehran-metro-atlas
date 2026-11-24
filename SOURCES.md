# Sources and historical comparison

The reviewed Persian and English source catalog is [data/sources/registry.json](data/sources/registry.json). The [combined source list](data/published/atlas.json) also identifies the OSM extract. Look up an individual feature's source IDs in that release. The [research inventory](docs/RESEARCH.md) describes each numbered line, extensions, other projects, unresolved conflicts and area-specific evidence. The independent passenger roster and service sequences are in [roster.json](data/reviewed/research/roster.json). Each traceable spatial object links to its OSM lineage or the contextual way index.

## Historical My Maps investigation, 24 November 2026

The supplied public viewer identified the map as «نقشه مترو تهران در گوگل مپ». Its Persian description says each line has a common station colour, with black markers at two-line interchanges. The viewer exposed map/layer KML links. A HEAD request to the public map KML endpoint with the supplied map ID and forcekml=1 returned HTTP 200, XML and a Persian-named KML attachment. This was a capability check. The response headers do not establish that every feature exports successfully or identify the author of each coordinate. [Historical viewer](https://www.google.com/maps/d/u/0/viewer?mid=1Mzl8gQSK6Nz0G9IKwouXwF_u5Y26WMwj) · [Google's KML/KMZ export instructions](https://support.google.com/mymaps/answer/3109452?hl=en)

No explicit open license or chain of rights for the historic geometries was located. No features were imported, digitized or compared by copying their coordinates. Reconsider reuse only if the author identifies their source material and provides a compatible grant for the relevant features, including upstream rights. The new release instead traces the publicly mapped passenger railway against the independent roster. Google permits the export workflow and separately sets terms for the use of its map content. [Google Maps additional terms](https://www.google.com/help/terms_maps/) · [Google geographic content guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)

## Geographic sources considered

| Source | Use in this release | Reuse or coverage issue |
| --- | --- | --- |
| Tehran Metro operator passenger diagram | Names, stop order, branches, interchanges and colour families; changes checked against subsequent opening reports | A third-party mirror hosts the operator-branded document. Its precise edition date is unknown. Stop spacing is schematic. |
| Geofabrik Iran snapshot | Source ways, public stop areas, transit access features and a generalized city basemap | ODbL. Underground geometry has positional uncertainty. A complete Iran extract was needed for routes extending beyond municipal Tehran. |
| Consulting engineers and rail planning reports | Plan approval, line concepts and chronology | No licensed engineering GIS package for current future alignments was verified. |
| City and project management interviews | Component-specific milestone, dates and named corridors | A corridor description can identify an area while leaving proposed station coordinates unknown. |
| Overpass | Possible small-scope update or object lookup | Use respecting endpoint limits. For this snapshot the pinned regional PBF is reproducible offline and retains full relation members. |
| Satellite imagery / commercial map tiles | None incorporated | No suitable tracing or redistribution grant was established for use here. Tunnel centre lines cannot be verified by surface imagery alone. |

See [OSM method and source extract](docs/OSM.md), [release workflow](docs/PIPELINE.md) and [data licensing](DATA_LICENSE.md).
