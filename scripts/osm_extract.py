#!/usr/bin/env python3
"""Extract public passenger relations and map context from a local Geofabrik Iran PBF.

Pass a new output directory when acquiring candidates. This script refuses to
replace existing snapshots. Geometry processing requires the pinned packages
in osm-requirements.txt. The deployment pipeline only reads reviewed data.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium as osm
from shapely.geometry import LineString, Polygon, box, mapping

NETWORK = 21175029
BBOX = (50.58, 35.19, 51.64, 36.05)
CORE = box(51.23, 35.59, 51.55, 35.82)
BOUNDS = box(*BBOX)
NAMES = {
    "name",
    "name:en",
    "name:fa",
    "alt_name",
    "alt_name:en",
    "alt_name:fa",
    "old_name",
    "old_name:fa",
    "old_name:en",
    "short_name",
    "int_name",
    "official_name",
    "wikidata",
    "wikipedia",
}
RAIL_TAGS = {
    "route",
    "route_master",
    "type",
    "from",
    "to",
    "ref",
    "colour",
    "public_transport",
    "railway",
    "subway",
    "station",
    "wheelchair",
    "opening_date",
    "network",
    "network:en",
}
OTHER_TAGS = {
    "place",
    "highway",
    "natural",
    "leisure",
    "landuse",
    "water",
    "waterway",
    "junction",
}


def clean_tags(tags, keys):
    return {key: value for key, value in tags if key in keys}


def name_matches(tags):
    text = " ".join(str(value).lower() for key, value in tags.items() if key in NAMES)
    return any(
        key in text
        for key in (
            "پارک وی",
            "پارک‌وی",
            "پارکوی",
            "پارک وى",
            "parkway",
            "park way",
            "ونک",
            "vanak",
            "جردن",
            "ماندلا",
            "mandela",
            "jordan",
            "رفسنجانی",
            "rafsanjani",
            "پارک ملت",
            "بوستان ملت",
            "mellat park",
        )
    )


def write_gzip(file, obj):
    content = json.dumps(
        obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode()
    with (
        file.open("xb") as out,
        gzip.GzipFile(fileobj=out, mode="wb", mtime=0, filename="") as stream,
    ):
        stream.write(content)


def extract(file, output, date, source_url):
    output.mkdir(parents=True, exist_ok=True)
    for name in ["network.json.gz", "context.json.gz", "manifest.json"]:
        if (output / name).exists():
            raise ValueError(f"{output / name} exists. Use a new candidate directory.")
    relations = {}
    for r in osm.FileProcessor(file, osm.osm.RELATION):
        if r.tags.get("type") in (
            "route",
            "route_master",
            "network",
            "public_transport",
        ):
            relations[r.id] = {
                "id": r.id,
                "version": r.version,
                "tags": clean_tags(r.tags, NAMES | RAIL_TAGS),
                "members": [[m.type, m.ref, m.role] for m in r.members],
            }
    if NETWORK not in relations:
        raise ValueError(
            "Missing Tehran Metro network relation. Review network identity."
        )
    routes = {NETWORK}
    for _ in range(4):
        routes |= {
            ref
            for rid in routes
            for typ, ref, _ in relations[rid]["members"]
            if typ == "r" and ref in relations
        }
    members = {
        (typ, ref)
        for rid in routes
        for typ, ref, _ in relations[rid]["members"]
        if typ != "r"
    }
    stop_members = {
        (typ, ref)
        for rid in routes
        for typ, ref, role in relations[rid]["members"]
        if role.startswith(("stop", "platform"))
    }
    areas = {
        r["id"]
        for r in relations.values()
        if r["tags"].get("public_transport") == "stop_area"
        and any((typ, ref) in stop_members for typ, ref, _ in r["members"])
    }
    groups = {
        r["id"]
        for r in relations.values()
        if r["tags"].get("public_transport") == "stop_area_group"
        and any(typ == "r" and ref in areas for typ, ref, _ in r["members"])
    }
    # Also capture railway=station nodes linked to the same public stop area.
    members |= {
        (typ, ref) for rid in areas for typ, ref, _ in relations[rid]["members"]
    }
    relation_ids = areas | groups | routes
    selected = {str(k): v for k, v in relations.items() if k in relation_ids}
    selected_nodes = {ref for typ, ref in members if typ == "n"}
    selected_ways = {ref for typ, ref in members if typ == "w"}
    nodes, ways, context, poi_candidates = {}, {}, [], []
    for node in osm.FileProcessor(file, osm.osm.NODE).with_filter(
        osm.filter.KeyFilter(
            "place",
            "junction",
            "highway",
            "railway",
            "public_transport",
            "leisure",
            "name",
        )
    ):
        xy = [node.location.lon, node.location.lat]
        if not (BBOX[0] <= xy[0] <= BBOX[2] and BBOX[1] <= xy[1] <= BBOX[3]):
            continue
        tags = clean_tags(node.tags, NAMES | RAIL_TAGS | OTHER_TAGS)
        if (
            node.id in selected_nodes
            or tags.get("railway") in ("station", "halt")
            and tags.get("station") == "subway"
        ):
            nodes[str(node.id)] = {"xy": xy, "tags": tags, "version": node.version}
        if tags.get("place") in (
            "neighbourhood",
            "neighborhood",
            "suburb",
            "quarter",
            "city",
            "town",
        ) and tags.get("name"):
            context.append(
                {
                    "class": "district",
                    "ref": f"node/{node.id}",
                    "tags": tags,
                    "geometry": {"type": "Point", "coordinates": xy},
                }
            )
        if name_matches(tags):
            poi_candidates.append(
                {
                    "ref": f"node/{node.id}",
                    "tags": tags,
                    "geometry": {"type": "Point", "coordinates": xy},
                }
            )
    processor = (
        osm.FileProcessor(file)
        .with_locations("sparse_mem_array")
        .with_filter(osm.filter.EntityFilter(osm.osm.WAY))
        .with_filter(
            osm.filter.KeyFilter(
                "railway",
                "highway",
                "public_transport",
                "water",
                "natural",
                "leisure",
                "landuse",
                "waterway",
            )
        )
    )
    for way in processor:
        loc = way.nodes[0].location if way.nodes else None
        if (
            not loc
            or not loc.valid()
            or not (
                BBOX[0] - 0.04 <= loc.lon <= BBOX[2] + 0.04
                and BBOX[1] - 0.04 <= loc.lat <= BBOX[3] + 0.04
            )
        ):
            continue
        tags = clean_tags(way.tags, NAMES | RAIL_TAGS | OTHER_TAGS)
        if not all(n.location.valid() for n in way.nodes):
            continue
        xy = [[n.location.lon, n.location.lat] for n in way.nodes]
        if len(xy) < 2:
            continue
        if way.id in selected_ways:
            ways[str(way.id)] = {
                "tags": tags,
                "version": way.version,
                "nodes": [n.ref for n in way.nodes],
                "xy": xy,
            }
        highway = tags.get("highway")
        if highway in ("motorway", "trunk", "primary"):
            cls = "road-major"
        elif highway in ("secondary", "tertiary"):
            cls = "road-minor"
        elif highway in ("residential", "unclassified") and CORE.contains(
            LineString(xy).centroid
        ):
            cls = "street"
        elif (
            (
                tags.get("leisure") in ("park", "garden")
                or tags.get("landuse") in ("forest", "recreation_ground")
                or tags.get("natural") in ("wood", "scrub")
            )
            and xy[0] == xy[-1]
            and len(xy) >= 4
        ):
            cls = "park"
        elif (
            (tags.get("natural") == "water" or tags.get("landuse") == "reservoir")
            and xy[0] == xy[-1]
            and len(xy) >= 4
        ):
            cls = "water"
        elif tags.get("waterway") in ("river", "stream", "canal"):
            cls = "river"
        else:
            continue
        original = Polygon(xy) if cls in ("park", "water") else LineString(xy)
        if (
            not original.is_valid
            or original.is_empty
            or not original.intersects(BOUNDS)
        ):
            continue
        if tags.get("name") and name_matches(tags):
            poi_candidates.append(
                {"ref": f"way/{way.id}", "tags": tags, "geometry": mapping(original)}
            )
        if (
            cls in ("park", "water")
            and original.area < 0.000001
            or cls == "river"
            and original.length < 0.002
        ):
            continue
        if cls == "street" and original.length < 0.00065:
            continue
        geom = original.intersection(BOUNDS).simplify(
            0.00010 if cls != "street" else 0.00008, preserve_topology=True
        )
        if geom.geom_type != original.geom_type or geom.is_empty:
            continue
        context.append(
            {
                "class": cls,
                "ref": f"way/{way.id}",
                "tags": {
                    k: v
                    for k, v in tags.items()
                    if k in ("name", "name:fa", "name:en", "highway", "place")
                },
                "geometry": mapping(geom),
            }
        )
    with osm.io.Reader(str(file)) as reader:
        timestamp = reader.header().get("osmosis_replication_timestamp") or None
    sha = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            sha.update(block)
    write_gzip(
        output / "network.json.gz",
        {
            "relations": selected,
            "nodes": nodes,
            "ways": ways,
            "landmarkCandidates": poi_candidates,
        },
    )
    write_gzip(output / "context.json.gz", context)
    (output / "manifest.json").write_text(
        json.dumps(
            {
                "url": source_url,
                "pbfSha256": sha.hexdigest(),
                "sha256": {
                    name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                    for name in ("network.json.gz", "context.json.gz")
                },
                "retrieved": date,
                "snapshotTime": timestamp,
                "license": "ODbL-1.0",
                "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
                "attribution": "© OpenStreetMap contributors",
                "bounds": BBOX,
                "networkRelation": NETWORK,
                "counts": {
                    "relations": len(selected),
                    "ways": len(ways),
                    "nodes": len(nodes),
                    "context": len(context),
                },
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--retrieved", required=True)
    parser.add_argument("--source-url", required=True)
    args = parser.parse_args()
    extract(args.pbf, args.output, args.retrieved, args.source_url)
