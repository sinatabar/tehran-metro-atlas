#!/usr/bin/env python3
"""Check each published OSM rail edge against its cited ways and stop members."""

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

from osm_normalize import distance, load, source_id
from shapely.geometry import shape


def require(condition, message):
    if not condition:
        raise ValueError(message)


def audit(raw_dir, reviewed):
    data = json.loads((reviewed / "network.json").read_text())
    manifest = json.loads((raw_dir / "manifest.json").read_text())
    raw = load(raw_dir / "network.json.gz")
    expected_source = source_id(manifest)
    stations = {s["id"]: s for s in data["stations"]}
    services = {s["id"]: s for s in data["services"]}
    owners = set()
    counts = Counter()
    max_offset = 0
    for row in data["segments"]:
        label = row["id"]
        service = services[row["serviceId"]]
        order = service["stationIds"]
        index = order.index(row["startStationId"])
        require(
            order[index + 1] == row["endStationId"], f"{label}: wrong stop sequence"
        )
        if not row["geometry"]:
            require(
                row["confidence"] == "unknown",
                f"{label}: unlocated path needs unknown confidence",
            )
            counts["unmappedPairs"] += 1
            continue
        route_id = service["osmRefs"][0].split("/")[1]
        relation = raw["relations"][route_id]
        stop_nodes = [
            str(ref)
            for typ, ref, role in relation["members"]
            if typ == "n" and role.startswith("stop")
        ]
        ways = {
            str(ref)
            for typ, ref, role in relation["members"]
            if typ == "w" and not role
        }
        refs = {r.split("/")[1] for r in row["osmRefs"] if r.startswith("way/")}
        require(
            refs and refs <= ways,
            f"{label}: track references outside passenger relation",
        )
        evidence = {}
        for ref in refs:
            way = raw["ways"][ref]
            for i in range(len(way["xy"]) - 1):
                positions = tuple(
                    sorted((tuple(way["xy"][i]), tuple(way["xy"][i + 1])))
                )
                evidence[positions] = tuple(sorted(way["nodes"][i : i + 2]))
        path = row["geometry"]["coordinates"]
        for station_key, node_id, pos in [
            (order[index], stop_nodes[index], path[0]),
            (order[index + 1], stop_nodes[index + 1], path[-1]),
        ]:
            require(
                pos == raw["nodes"][node_id]["xy"],
                f"{label}: endpoint differs from actual stop node",
            )
            max_offset = max(
                max_offset,
                distance(pos, stations[station_key]["geometry"]["coordinates"]) * 1000,
            )
        length, counted = 0, 0
        for a, b in zip(path, path[1:]):
            pair = tuple(sorted((tuple(a), tuple(b))))
            require(
                pair in evidence, f"{label}: coordinate edge absent from all cited ways"
            )
            edge = evidence[pair]
            length += distance(a, b)
            if edge not in owners:
                counted += distance(a, b)
                owners.add(edge)
        require(
            abs(length - row["lengthKm"]) < 1e-5
            and abs(counted - row["countedLengthKm"]) < 1e-5,
            f"{label}: measured length or shared-edge allocation mismatch",
        )
        counts["mappedPairs"] += 1
    for station in stations.values():
        ref = station["geometryOsmRef"].split("/")[1]
        require(
            ref in raw["nodes"]
            and station["geometry"]["coordinates"] == raw["nodes"][ref]["xy"],
            f"{station['id']}: stop location must have a mapped source",
        )
    for table in ["stations", "segments", "platforms", "entrances", "places"]:
        for row in data[table]:
            geom = row.get("geometry")
            if geom:
                spatial = shape(geom)
                require(
                    spatial.is_valid
                    and not spatial.is_empty
                    and expected_source in row["geometrySourceIds"],
                    f"{row['id']}: invalid or unsourced geometry",
                )
    index = json.load(
        gzip.open(reviewed / "context-provenance.json.gz", "rt", encoding="utf-8")
    )
    source_objects = {r["ref"] for r in load(raw_dir / "context.json.gz")}
    for f in json.loads((reviewed / "context.geojson").read_text())["features"]:
        g = shape(f["geometry"])
        p = f["properties"]
        refs = [p["osmRef"]] if p.get("osmRef") else index.get(p["provenanceId"])
        require(
            g.is_valid
            and not g.is_empty
            and refs
            and set(refs) <= source_objects
            and p["sourceId"] == expected_source
            and p["confidence"] == "approximate",
            f"{f['id']}: invalid geometry or provenance",
        )
    return dict(
        counts,
        distinctRailEdges=len(owners),
        maxStationMarkerToStopMetres=round(max_offset, 1),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("reviewed", type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.raw, args.reviewed)))
