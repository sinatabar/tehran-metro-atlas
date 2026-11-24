#!/usr/bin/env python3
"""Reconstruct the reviewed OSM passenger data from the pinned extract, offline.

Write to a candidate directory. Explicitly compare its contents before replacing
reviewed inputs. No geometric inference is made across missing track nodes.
"""

import argparse
import gzip
import hashlib
import heapq
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from shapely.geometry import MultiLineString, mapping, shape
from shapely.ops import linemerge

IDENTITIES = (
    Path(__file__).resolve().parents[1] / "data/reviewed/osm/station-identities.json"
)
# One direction per distinct passenger service. Other directions normally use
# the opposite track. Including both would double-count route length.
ROUTE_DIRECTIONS = {
    19967673: 7735255,
    6151834: 7832313,
    2431321: 7832324,
    7770933: 5366249,
    443307: 7705668,
    7683584: 7726963,
    443301: 7735261,
    5697303: 9468295,
    7429356: 7705643,
}


def source_id(manifest):
    day = manifest["snapshotTime"][:10]
    return "osm-geofabrik-" + day.replace("-", "")


def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def save(path, obj):
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def point(xy):
    return {"type": "Point", "coordinates": xy}


def distance(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 12742.0176 * math.asin(min(1, math.sqrt(h)))


def names(tags):
    fa = tags.get("name:fa") or tags.get("name")
    en = tags.get("name:en") or tags.get("int_name")
    return {
        "fa": re.sub(r"^ایستگاه متروی?\s+", "", fa).strip() if fa else None,
        "en": re.sub(r"\s+metro station$", "", en, flags=re.IGNORECASE).strip()
        if en
        else None,
    }


def aliases(tag_sets, canonical):
    values = {
        s.strip()
        for tags in tag_sets
        for key, value in tags.items()
        if key.startswith(
            ("alt_name", "old_name", "short_name", "name", "int_name", "official_name")
        )
        for s in value.split(";")
    }
    return sorted(
        v
        for v in values
        if v
        and v not in canonical.values()
        and "ایستگاه مترو" not in v
        and not v.lower().endswith("metro station")
    )


def topology(ways, relation):
    xy, graph = {}, defaultdict(dict)
    for typ, ref, role in relation["members"]:
        if typ != "w" or role != "":
            continue
        w = ways[str(ref)]
        if w["tags"].get("railway") not in (
            "rail",
            "subway",
            "light_rail",
            "narrow_gauge",
        ):
            continue
        xy.update(zip(w["nodes"], w["xy"]))
        for start, end in zip(w["nodes"], w["nodes"][1:]):
            cost = distance(xy[start], xy[end])
            graph[start][end] = (cost, ref)
            graph[end][start] = (cost, ref)
    return xy, graph


def route_path(graph, start, end):
    queue = [(0, start)]
    costs = {start: 0}
    parents = {}
    while queue:
        cost, here = heapq.heappop(queue)
        if here == end:
            path = [end]
            while path[-1] != start:
                path.append(parents[path[-1]])
            return list(reversed(path))
        if cost != costs[here]:
            continue
        for nxt, (length, _) in graph[here].items():
            alternative = cost + length
            if alternative < costs.get(nxt, math.inf):
                costs[nxt] = alternative
                parents[nxt] = here
                heapq.heappush(queue, (alternative, nxt))
    return None


def station_views(data, row):
    nodes, areas = data["nodes"], row["areas"]
    # Representative point is a mapped station node (or mapped stop position),
    # never a synthetic average across passenger platforms.
    mapped = [
        str(n)
        for a in areas
        for typ, n, _ in a["members"]
        if typ == "n"
        and nodes.get(str(n), {}).get("tags", {}).get("railway") == "station"
    ]
    geom_id = (mapped or row["stopNodes"])[0]
    return nodes[geom_id], geom_id


def build_network(raw, manifest):
    source = source_id(manifest)
    anchors = json.loads(IDENTITIES.read_text(encoding="utf-8"))
    relations, nodes, ways = raw["relations"], raw["nodes"], raw["ways"]
    known_routes = set(ROUTE_DIRECTIONS) | set(ROUTE_DIRECTIONS.values())
    actual_routes = {
        r["id"] for r in relations.values() if r["tags"].get("type") == "route"
    }
    if known_routes != actual_routes:
        raise ValueError(
            f"Passenger service patterns changed; review {sorted(known_routes ^ actual_routes)}"
        )
    member_stops = {
        ref
        for rid in known_routes
        for typ, ref, role in relations[str(rid)]["members"]
        if typ == "n" and role.startswith("stop")
    }
    by_stop, groups = {}, {}
    for r in relations.values():
        if r["tags"].get("public_transport") == "stop_area":
            for typ, ref, _ in r["members"]:
                if typ == "n" and ref in member_stops:
                    if ref in by_stop and by_stop[ref] != r["id"]:
                        raise ValueError(f"Conflicting stop areas for node/{ref}")
                    by_stop[ref] = r["id"]
        if r["tags"].get("public_transport") == "stop_area_group":
            for typ, ref, _ in r["members"]:
                if typ == "r":
                    groups[ref] = r["id"]
    # A station keeps its atlas ID when OSM promotes its stop area to a group.
    # An existing group that now joins two atlas records needs editorial review.
    ids_by_group = defaultdict(set)
    for area in by_stop.values():
        group = groups.get(area, area)
        ids_by_group[group].update(
            anchors[str(id_)] for id_ in (area, group) if str(id_) in anchors
        )
    if any(len(matches) > 1 for matches in ids_by_group.values()):
        raise ValueError(
            "Multiple existing stations merged in source; review stable identity mapping."
        )

    def stable_id(node):
        area = by_stop[node]
        group = groups.get(area, area)
        return next(iter(ids_by_group[group]), f"station-r{group}")

    uses, services, segments, unmapped = {}, [], [], []
    counted_edges = set()
    for rid, opposite in ROUTE_DIRECTIONS.items():
        relation = relations[str(rid)]
        line = "line-" + relation["tags"]["ref"]
        stops = [
            ref
            for typ, ref, role in relation["members"]
            if typ == "n" and role.startswith("stop")
        ]
        sequence = []
        for node_id in stops:
            area_id = by_stop[node_id]
            sid = stable_id(node_id)
            entry = uses.setdefault(
                sid,
                {"id": sid, "areas": [], "stopNodes": [], "lines": [], "services": []},
            )
            area = relations[str(area_id)]
            if area not in entry["areas"]:
                entry["areas"].append(area)
            if line not in entry["lines"]:
                entry["lines"].append(line)
            entry["stopNodes"].append(str(node_id))
            entry["services"].append(rid)
            sequence.append(sid)
        reverse_sequence = [
            stable_id(ref)
            for typ, ref, role in relations[str(opposite)]["members"]
            if typ == "n" and role.startswith("stop")
        ]
        if sequence != reverse_sequence[::-1]:
            raise ValueError(
                f"Directions have different stops in {rid}/{opposite}. Review as separate services."
            )
        if len(sequence) != len(set(sequence)):
            raise ValueError(f"Duplicate physical stop on service {rid}")
        service_id = f"service-r{rid}"
        services.append(
            {
                "id": service_id,
                "lineId": line,
                "stationIds": sequence,
                "sourceIds": [source, "operator-diagram"],
                "osmRefs": [f"relation/{rid}"],
                "licenseGroup": "osm",
            }
        )
        xy, graph = topology(ways, relation)
        if any(len(neighbors) > 2 for neighbors in graph.values()) or (
            graph and not any(len(n) == 1 for n in graph.values())
        ):
            raise ValueError(
                f"Ambiguous track branches or loop in relation/{rid}; review route way order."
            )
        for idx, (start, end) in enumerate(zip(stops, stops[1:])):
            trace = route_path(graph, start, end)
            sid1, sid2 = sequence[idx : idx + 2]
            base = {
                "id": f"segment-{rid}-{sid1[9:]}-{sid2[9:]}",
                "name": {
                    "fa": " — ".join(
                        names(nodes[str(n)]["tags"])["fa"] for n in (start, end)
                    ),
                    "en": " — ".join(
                        names(nodes[str(n)]["tags"])["en"] for n in (start, end)
                    ),
                },
                "lineId": line,
                "lineIds": [line],
                "startStationId": sid1,
                "endStationId": sid2,
                "status": "operational",
                "constructionStatus": None,
                "sourceIds": [source],
                "geometrySourceIds": [source],
                "licenseGroup": "osm",
                "lastVerified": manifest["retrieved"],
                "serviceId": service_id,
                "geometry": None,
                "confidence": "unknown",
                "alignmentType": "unknown",
                "osmRefs": [f"relation/{rid}"],
                "countedLengthKm": None,
                "lengthKm": None,
            }
            if trace:
                if set(trace[1:-1]).intersection(stops):
                    raise ValueError(
                        f"Path through another stop, relation/{rid}: {start} → {end}"
                    )
                refs = set()
                length = 0
                counted = 0
                for a, b in zip(trace, trace[1:]):
                    cost, wid = graph[a][b]
                    length += cost
                    refs.add(wid)
                    key = tuple(sorted((a, b)))
                    if key not in counted_edges:
                        counted += cost
                        counted_edges.add(key)
                base.update(
                    {
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [xy[n] for n in trace],
                        },
                        "confidence": "approximate",
                        "alignmentType": "actual",
                        "osmRefs": [f"relation/{rid}"]
                        + [f"way/{n}" for n in sorted(refs)],
                        "lengthKm": round(length, 6),
                        "countedLengthKm": round(counted, 6),
                    }
                )
            else:
                unmapped.append([rid, start, end])
            segments.append(base)
    stations, entrances, platforms = [], {}, {}
    for key, row in sorted(uses.items()):
        primary, geom_id = station_views(raw, row)
        stop = nodes[row["stopNodes"][0]]
        canonical = names(stop["tags"])
        identity = groups.get(row["areas"][0]["id"], row["areas"][0]["id"])
        tagsets = (
            [s["tags"] for s in row["areas"]]
            + [nodes[n]["tags"] for n in row["stopNodes"]]
            + [primary["tags"]]
        )
        osmrefs = sorted(
            {
                f"relation/{identity}",
                f"node/{geom_id}",
                *[f"relation/{s['id']}" for s in row["areas"]],
                *[f"node/{id}" for id in row["stopNodes"]],
                *[f"relation/{id}" for id in row["services"]],
            }
        )
        st = {
            "id": key,
            "name": canonical,
            "aliases": aliases(tagsets, canonical),
            "lineIds": row["lines"],
            "geometry": point(primary["xy"]),
            "geometryOsmRef": f"node/{geom_id}",
            "status": "operational",
            "constructionStatus": None,
            "confidence": "high",
            "sourceIds": [source, "operator-diagram"],
            "geometrySourceIds": [source],
            "lastVerified": manifest["retrieved"],
            "licenseGroup": "osm",
            "osmRefs": osmrefs,
            "opened": None,
            "expected": None,
            "uncertaintyM": None,
            "district": None,
            "neighborhood": None,
            "accessibility": None,
        }
        if (
            primary["tags"].get("wheelchair") in ("yes", "no", "limited")
            and len(row["areas"]) == 1
        ):
            st["accessibility"] = {
                "wheelchair": primary["tags"]["wheelchair"],
                "sourceIds": [source],
            }
        stations.append(st)
        for area in row["areas"]:
            for typ, ref, role in area["members"]:
                item = (nodes if typ == "n" else ways if typ == "w" else {}).get(
                    str(ref)
                )
                if not item:
                    continue
                tags = item["tags"]
                osm_ref = ("node/" if typ == "n" else "way/") + str(ref)
                is_entrance = typ == "n" and (
                    role == "entrance" or tags.get("railway") == "subway_entrance"
                )
                is_platform = (
                    role == "platform"
                    or tags.get("public_transport") == "platform"
                    or tags.get("railway") == "platform"
                )
                if not (is_entrance or is_platform):
                    continue
                if typ == "n":
                    geom = point(item["xy"])
                elif item["xy"][0] == item["xy"][-1]:
                    geom = {"type": "Polygon", "coordinates": [item["xy"]]}
                else:
                    geom = {"type": "LineString", "coordinates": item["xy"]}
                label_fa, label_en, prefix, out = (
                    ("ورودی", "Entrance", "entrance", entrances)
                    if is_entrance
                    else ("سکو", "Platform", "platform", platforms)
                )
                obj_id = f"{prefix}-{typ}{ref}"
                label = {
                    "fa": f"{label_fa} {canonical['fa']}",
                    "en": f"{canonical['en']} {label_en.lower()}",
                }
                out[obj_id] = {
                    "id": obj_id,
                    "stationId": key,
                    "name": label,
                    "lineIds": row["lines"],
                    "geometry": geom,
                    "confidence": "high",
                    "status": "unknown",
                    "sourceIds": [source],
                    "geometrySourceIds": [source],
                    "lastVerified": manifest["retrieved"],
                    "licenseGroup": "osm",
                    "osmRefs": [osm_ref, f"relation/{area['id']}"],
                }
    return {
        "stations": stations,
        "segments": segments,
        "services": services,
        "entrances": list(entrances.values()),
        "platforms": list(platforms.values()),
    }, unmapped


LANDMARKS = {
    "place-jordan": ("node/5637867676", "neighbourhood", ["Jordan", "جردن"]),
    "place-vanak": ("node/5637867002", "neighbourhood", []),
    "place-vanak-square": ("node/5894949558", "square", []),
    "place-parkway": ("node/6482529108", "junction", ["Park Way", "پارک‌وی"]),
    "place-mellat-park": ("way/206602673", "park", ["پارک ملت", "Park Mellat"]),
}
CORRIDORS = {
    "place-mandela": (
        "Nelson Mandela Boulevard",
        "boulevard",
        ["بلوار آفریقا", "Africa Boulevard"],
    ),
    "place-rafsanjani": (
        "Hashemi Rafsanjani Expressway",
        "highway",
        ["Hashemi Rafsanjani Highway", "نیایش", "Niayesh Expressway"],
    ),
}


def gazetteer(raw, context, manifest):
    source = source_id(manifest)
    poi = {p["ref"]: p for p in raw["landmarkCandidates"]}
    places = []

    def add(id, name, other, refs, geom, kind):
        if geom.geom_type == "Point":
            centre = geom
        elif geom.geom_type == "Polygon":
            centre = geom.representative_point()
        else:
            merged = linemerge(geom) if geom.geom_type == "MultiLineString" else geom
            longest = (
                max(merged.geoms, key=lambda x: x.length)
                if merged.geom_type == "MultiLineString"
                else merged
            )
            centre = longest.interpolate(0.5, normalized=True)
        places.append(
            {
                "id": id,
                "name": name,
                "aliases": sorted(set(other) - set(name.values())),
                "lineIds": [],
                "placeType": kind,
                "geometry": point([round(centre.x, 7), round(centre.y, 7)]),
                "footprint": mapping(geom) if geom.geom_type != "Point" else None,
                "confidence": "approximate",
                "status": "unknown",
                "sourceIds": [source],
                "geometrySourceIds": [source],
                "lastVerified": manifest["retrieved"],
                "licenseGroup": "osm",
                "osmRefs": refs,
            }
        )

    selected_refs = set()
    for key, (ref, kind, alias) in LANDMARKS.items():
        p = poi[ref]
        title = names(p["tags"])
        add(
            key,
            title,
            aliases([p["tags"]], title) + alias,
            [ref],
            shape(p["geometry"]),
            kind,
        )
        selected_refs.add(ref)
    for key, (label, kind, alias) in CORRIDORS.items():
        parts = [
            p
            for p in poi.values()
            if p["tags"].get("name:en") == label
            and p["geometry"]["type"] == "LineString"
        ]
        title = names(parts[0]["tags"])
        add(
            key,
            title,
            alias + aliases([p["tags"] for p in parts], title),
            [p["ref"] for p in parts],
            MultiLineString([p["geometry"]["coordinates"] for p in parts]),
            kind,
        )
    # Include explicitly bilingual gazetteer points, excluding coincident duplicates
    # with the named focus areas above. No translation guesses on missing labels.
    for row in context:
        if row["class"] != "district" or row["ref"] in selected_refs:
            continue
        tag = row["tags"]
        n = names(tag)
        xy = row["geometry"]["coordinates"]
        if not (
            n["fa"] and n["en"] and 51.15 < xy[0] < 51.60 and 35.52 < xy[1] < 35.84
        ):
            continue
        add(
            "place-n" + row["ref"][5:],
            n,
            aliases([tag], n),
            [row["ref"]],
            shape(row["geometry"]),
            tag["place"],
        )
    return places


def rounded_coordinates(geometry):
    if isinstance(geometry[0], (float, int)):
        return [round(v, 5) for v in geometry]
    return [rounded_coordinates(part) for part in geometry]


def make_context(raw, manifest):
    source = source_id(manifest)
    # Aggregate only same-class geometry, with an index into individually
    # identified source features. Roads keep their real shape and gaps.
    buckets = defaultdict(list)
    features = []
    refs = {}
    for row in raw:
        cls = row["class"]
        geom = shape(row["geometry"])
        tags = row["tags"]
        x, y = geom.representative_point().coords[0]
        in_city = 51.2 < x < 51.59 and 35.56 < y < 35.83
        if cls == "district":
            if not tags.get("name:en") or (
                not in_city and tags.get("place") not in ("city", "town", "suburb")
            ):
                continue
            features.append(
                {
                    "type": "Feature",
                    "id": row["ref"],
                    "properties": {
                        "class": cls,
                        "nameFa": tags.get("name:fa") or tags.get("name"),
                        "nameEn": tags["name:en"],
                        "osmRef": row["ref"],
                        "sourceId": source,
                    },
                    "geometry": row["geometry"],
                }
            )
            continue
        # Local streets are generalized for a low-bandwidth city overview.
        if cls == "street" and geom.length < 0.0026:
            continue
        if cls == "road-minor" and not in_city and tags.get("highway") == "tertiary":
            continue
        if cls in ("park", "water") and geom.area < (0.000004 if in_city else 0.00003):
            continue
        if cls == "river" and geom.length < 0.005:
            continue
        key = f"{cls}_{int(x * 20)}_{int(y * 20)}"
        buckets[key].append((row["ref"], geom))
    for key, parts in sorted(buckets.items()):
        cls = key.split("_")[0]
        geoms = [g for _, g in parts]
        refs[key] = [r for r, _ in parts]
        # A GeometryCollection of overlapping polygons would not be an appropriate
        # union. Keep polygon outlines independent; aggregate only line pieces.
        if cls in ("park", "water"):
            for ref, geom in parts:
                features.append(
                    {
                        "type": "Feature",
                        "id": ref,
                        "properties": {"class": cls, "sourceId": source, "osmRef": ref},
                        "geometry": mapping(geom.simplify(0.00015)),
                    }
                )
            continue
        merged = linemerge([g for g in geoms])
        typ = merged.geom_type
        features.append(
            {
                "type": "Feature",
                "id": key,
                "properties": {"class": cls, "sourceId": source, "provenanceId": key},
                "geometry": {
                    "type": typ,
                    "coordinates": rounded_coordinates(
                        mapping(merged.simplify(0.00015))["coordinates"]
                    ),
                },
            }
        )
    for feature in features:
        feature["properties"]["confidence"] = "approximate"
    return {
        "type": "FeatureCollection",
        "attribution": "© OpenStreetMap contributors",
        "license": "ODbL-1.0",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "snapshotTime": manifest["snapshotTime"],
        "sourceIds": [source],
        "features": features,
    }, refs


def normalize(raw_dir, dest):
    dest.mkdir(parents=True, exist_ok=True)
    if any(
        (dest / x).exists()
        for x in ("network.json", "context.geojson", "context-provenance.json.gz")
    ):
        raise ValueError("Choose an empty candidate directory.")
    manifest = json.loads((raw_dir / "manifest.json").read_text())
    for name in ("network.json.gz", "context.json.gz"):
        if (
            hashlib.sha256((raw_dir / name).read_bytes()).hexdigest()
            != manifest["sha256"][name]
        ):
            raise ValueError(f"Snapshot checksum mismatch for {name}")
    raw = load(raw_dir / "network.json.gz")
    context = load(raw_dir / "context.json.gz")
    source = source_id(manifest)
    data, gaps = build_network(raw, manifest)
    for s in data["stations"]:
        s["interchange"] = len(s["lineIds"]) > 1
    data["places"] = gazetteer(raw, context, manifest)
    data["sources"] = [
        {
            "id": source,
            "title": f"Tehran Metro passenger network and metropolitan map context, {manifest['snapshotTime'][:10]} OSM snapshot",
            "publisher": "OpenStreetMap contributors via Geofabrik",
            "url": "https://download.geofabrik.de/asia/iran.html",
            "snapshotUrl": manifest["url"],
            "published": manifest["snapshotTime"][:10],
            "retrieved": manifest["retrieved"],
            "type": "geospatial dataset",
            "reliability": "community-mapped",
            "license": "ODbL-1.0",
            "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
            "attribution": "© OpenStreetMap contributors",
            "lineIds": [f"line-{i}" for i in range(1, 8)],
            "stationIds": [s["id"] for s in data["stations"]],
            "licenseGroup": "osm",
        }
    ]
    base, index = make_context(context, manifest)
    save(dest / "network.json", data)
    save(dest / "context.geojson", base)
    with (
        (dest / "context-provenance.json.gz").open("xb") as out,
        gzip.GzipFile(fileobj=out, mode="wb", mtime=0, filename="") as stream,
    ):
        stream.write(json.dumps(index, separators=(",", ":")).encode())
    print(
        json.dumps(
            {
                "counts": {k: len(v) for k, v in data.items()},
                "unmappedAdjacentStopPairs": gaps,
                "contextFeatures": len(base["features"]),
                "routeKm": round(
                    sum(s["countedLengthKm"] or 0 for s in data["segments"]), 3
                ),
            }
        )
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("raw", type=Path)
    p.add_argument("candidate", type=Path)
    args = p.parse_args()
    normalize(args.raw, args.candidate)
