# Passenger geography and map context

The OSM layer uses the 23 November 2026 Geofabrik Iran extract, retrieved on 24 November. The replication timestamp is `2026-11-23T21:21:17Z`. The atlas ships a small, reproducible extract of the passenger network and surrounding streets. Browsing the atlas makes no requests to OSM, Nominatim or a tile server. [Geofabrik Iran](https://download.geofabrik.de/asia/iran.html) · [OSM network relation 21175029](https://www.openstreetmap.org/relation/21175029) · [OSM copyright](https://www.openstreetmap.org/copyright)

## Geography and identity

One `route_master` represents each numbered line in this snapshot. Each pair of directional `route` relations describes one passenger service. Historical wiki counts can lag behind the underlying objects. The included route inventory and the operator diagram are the evidence used here. [OSM passenger network inventory](https://wiki.openstreetmap.org/wiki/Tehran/Tehran_Metro)

| Line | Selected passenger service in this extract | OSM directional route | Ordered stops |
| --- | --- | --- | ---: |
| 1 | Tajrish to Kahrizak | [19967673](https://www.openstreetmap.org/relation/19967673) | 29 |
| 1 | Shahed–Bagher Shahr to Parand via the airport | [6151834](https://www.openstreetmap.org/relation/6151834) | 4 |
| 2 | Sadeghiyeh to Farhangsara | [2431321](https://www.openstreetmap.org/relation/2431321) | 22 |
| 3 | Azadegan to Ghaem | [7770933](https://www.openstreetmap.org/relation/7770933) | 25 |
| 4 | Allameh Jafari to Shahid Kolahdouz | [443307](https://www.openstreetmap.org/relation/443307) | 20 |
| 4 | Bimeh to Mehrabad Terminals 4 & 6 via Terminals 1 & 2 | [7683584](https://www.openstreetmap.org/relation/7683584) | 3 |
| 5 | Shahid Qasem Soleimani to Sadeghiyeh | [443301](https://www.openstreetmap.org/relation/443301) | 13 |
| 6 | Shahid Arman Aliverdi to Shohada-ye Dowlat Abad | [5697303](https://www.openstreetmap.org/relation/5697303) | 26 |
| 7 | Meydan-e Ketab to Varzeshgah-e Takhti | [7429356](https://www.openstreetmap.org/relation/7429356) | 22 |

Each operating stop must belong to a mapped `stop_area`. Shared `stop_area_group` relations establish physical station identity across lines. A name match or nearby position alone cannot merge two stations. The reviewed identity file anchors atlas station IDs to the area's underlying relation IDs. A new group can retain an established ID. A merge of previously distinct IDs requires explicit review and preservation of external links. The importer compares both directions' stop lists and flags extra route relations for review.

This produces 164 appearances on the nine services and 145 distinct stations. Seventeen stations connect different operating lines. Shahed and Bimeh each connect two services of the same numbered line. The plan and feature directories can show a proposed future connection to an operating station while its actual `lineIds` still identify today's services.

The marker uses a mapped station node, falling back to the service's actual stop node when needed. `geometryOsmRef` identifies the specific origin and `osmRefs` contains associated areas, stops and service relations. These are high-confidence passenger reference points. For interchanges, a station marker represents the complex. Platforms can be far apart. The largest marker-to-stop separation in this snapshot is 347.3 m at Eram-e Sabz. The 260 mapped entrances and 25 mapped platform features have partial coverage. Their operating status is unknown unless supported separately. Accessibility entries require an explicit `wheelchair` tag and apply to the station-level feature.

## Station-to-station alignment

The importer selects the unqualified rail-way members of one direction of each passenger route. Ways with a platform or inactive membership role are excluded. Edges come directly from consecutive OSM node IDs on those ways. Each adjacent passenger stop pair requires a connected path on those edges. Missing paths retain null geometry and unknown positional confidence. A path through a different stop, a branching/looped route needing direction resolution, a changed service pattern or an ambiguous station identity requires review.

In the pinned extract all nine selected routes form simple chains. All 155 adjacent station pairs have an observed track path. The independent edge audit checks every published pair of coordinates against a cited source way and checks both endpoints against the relation's actual stop members. There are 2,000 distinct undirected rail edges. Every alignment has positional confidence `approximate`. The sources identify public passenger service and its mapped track path. Engineering or survey precision for underground tracks has yet to be established.

Distances use WGS84 coordinates with a mean-radius spherical great-circle length per edge. Mapped passenger length is **285.894 km**, calculated over these station-to-station paths and counted once per physical OSM node pair. This convention excludes depots, approach tracks outside terminus stop nodes and the return track. Municipality construction or system-length statistics may use a different convention. Lines 1 and 4 each have two separately traced service paths using distinct platform nodes at the branch interchange. The topology report preserves those separate components.

## Landmarks and background map

The gazetteer includes 451 bilingual reference points. It contains 444 additional named places in the central study envelope and seven explicitly reviewed place records. Vanak neighbourhood and Vanak Square are separate. Each gazetteer entry identifies its OSM source. For Mellat Park a polygon yields a point inside the park. Each street corridor retains all matching OSM way pieces in a `MultiLineString` footprint and a point halfway along its longest connected piece. A proximity calculation from that point measures straight-line distance from one representative point. It does not estimate a walking journey, coverage along the whole highway, or a future station location.

| Place | Source geography |
| --- | --- |
| Jordan neighbourhood | [OSM neighbourhood node](https://www.openstreetmap.org/node/5637867676) |
| Vanak neighbourhood and square | [Neighbourhood](https://www.openstreetmap.org/node/5637867002) · [Square](https://www.openstreetmap.org/node/5894949558) |
| Parkway | [OSM locality node](https://www.openstreetmap.org/node/6482529108) |
| Mellat Park | [OSM park polygon](https://www.openstreetmap.org/way/206602673) |
| Nelson Mandela Boulevard | 19 named way pieces in this snapshot, enumerated in `place-mandela.osmRefs` |
| Hashemi Rafsanjani Expressway | 23 named way pieces in this snapshot, enumerated in `place-rafsanjani.osmRefs` |

The overview contains local street, arterial, park, water and neighbourhood context. It is generalized for city-scale navigation. Small minor roads and small park/water polygons are selectively omitted. Streets are merged only across real shared endpoints within a class and spatial bucket. Every context feature has a confidence classification and either `osmRef` or a `provenanceId` resolving to the source way list in `context-provenance.json.gz`. The grouped geometries retain their source coordinates with simplification. Their background role is distinct from transit-service evidence. All OSM-derived assets are distributed under the [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) with attribution to OpenStreetMap contributors.

## Reproduce and review

The public static release build reads `data/reviewed/osm/` without installing GIS packages. Reprocessing raw OSM uses Python 3.11+ with the pinned pyosmium and Shapely versions. Python 3.14.7 was used for the initial review. Start at the repository root.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/osm-requirements.txt
.venv/bin/python scripts/osm_normalize.py data/raw/osm/2026-11-23 data/processed/osm/reproduction
.venv/bin/python scripts/osm_verify.py data/raw/osm/2026-11-23 data/processed/osm/reproduction
cmp data/processed/osm/reproduction/network.json data/reviewed/osm/network.json
cmp data/processed/osm/reproduction/context.geojson data/reviewed/osm/context.geojson
cmp data/processed/osm/reproduction/context-provenance.json.gz data/reviewed/osm/context-provenance.json.gz
```

The [raw source notice](../data/raw/osm/README.md) accompanies the ODbL data. `data/raw/osm/2026-11-23/manifest.json` records the URL, timestamp, PBF hash, hashes of both compact inputs, bounding box and object counts. `osm_normalize.py` checks those input hashes before processing. Published derivatives and exports have SHA-256 entries in `data/published/checksums.json`. If the provider's dated extract is available, it also permits regeneration of the compact raw inputs. Geofabrik rotates older daily files. The checked-in compact raw snapshot remains usable offline after rotation.

```sh
curl --fail --location --output /tmp/iran-261123.osm.pbf https://download.geofabrik.de/asia/iran/iran-261123.osm.pbf
shasum -a 256 /tmp/iran-261123.osm.pbf
.venv/bin/python scripts/osm_extract.py /tmp/iran-261123.osm.pbf data/processed/osm/raw-reproduction --retrieved 2026-11-24 --source-url https://download.geofabrik.de/asia/iran/iran-261123.osm.pbf
```

For a new snapshot, supply its own retrieval date and dated source URL. Compare network membership, station identities, aliases, way paths, position changes, closures and the growth of the gazetteer footprint. Obtain operator or official opening evidence for new passenger services before promotion. Review the full evidence bundle and source dates, then copy accepted changes into `data/reviewed/`, update the release revision, regenerate published datasets and run the repository tests. The acquisition and normalization scripts refuse to overwrite a previous candidate. [Release review procedure](PIPELINE.md)
