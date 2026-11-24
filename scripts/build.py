#!/usr/bin/env python3
"""Build all publication products offline, or compare them with the checked-in release."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

from atlas_exports import json_bytes, release_exports
from atlas_model import (
    CONFIDENCES,
    ROOT,
    DataError,
    assemble_view,
    geometry,
    load_release,
    read,
    require,
)


def connected_components(segments):
    parent = {}

    def find(point):
        parent.setdefault(point, point)
        while parent[point] != point:
            parent[point] = parent[parent[point]]
            point = parent[point]
        return point

    for row in segments:
        geometry = row["geometry"]
        parts = [geometry["coordinates"]] if geometry["type"] == "LineString" else geometry["coordinates"]
        for path in parts:
            first = tuple(path[0])
            for position in path[1:]:
                parent[find(tuple(position))] = find(first)
    return len({find(point) for point in parent})


def topology_report(data):
    """Count connected geometry components per line without inferring any joins."""
    reports = []
    for line in data["lines"]:
        members = [
            s
            for s in data["segments"]
            if line["id"] in s["lineIds"] and s["geometry"] and s["alignmentType"] == "actual"
        ]
        components = connected_components(members)
        reports.append(
            {
                "lineId": line["id"],
                "segments": len(members),
                "components": components,
                "reviewTopology": components > 1,
            }
        )
    return reports


def artifacts(root=ROOT):
    data = load_release(root)
    files = release_exports(data)
    data = assemble_view(data)
    target = Path("data/published")
    files[target / "atlas.json"] = json_bytes(data)
    context = read(root / "data/reviewed/osm/context.geojson")
    require(context.get("type") == "FeatureCollection", "context must be GeoJSON")
    for f in context["features"]:
        require(f.get("type") == "Feature" and f.get("geometry"), "background feature lacks geometry")
        geometry(f["geometry"], f.get("id", "context"))
    provenance_bytes = (root / "data/reviewed/osm/context-provenance.json.gz").read_bytes()
    provenance = json.loads(gzip.decompress(provenance_bytes))
    source_ids = {s["id"] for s in data["sources"]}
    require(
        context.get("attribution") and set(context.get("sourceIds", ())) <= source_ids,
        "background collection lacks traceable attribution",
    )
    for feature in context["features"]:
        props = feature["properties"]
        require(props.get("confidence") in CONFIDENCES - {"unknown"}, "unclassified mapped background feature")
        require(
            props.get("sourceId") in source_ids
            and (
                props.get("osmRef")
                or props.get("group") in provenance
                or feature.get("id") in provenance
                or props.get("provenanceId") in provenance
            ),
            f"missing background lineage: {props}",
        )
    files[target / "context.geojson"] = json_bytes(context)
    files[target / "context-provenance.json.gz"] = provenance_bytes
    adjacency = {
        (line, frozenset([s["startStationId"], s["endStationId"]]))
        for s in data["segments"]
        if s["geometry"] and s["startStationId"] and s["endStationId"]
        for line in s["lineIds"]
    }
    service_gaps = {}
    for service in data["services"]:
        if service.get("status", "operational") != "operational":
            continue
        order = service.get("stationIds", [])
        missing = [
            [a, b]
            for a, b in zip(order, order[1:])
            if (service["lineId"], frozenset([a, b])) not in adjacency
        ]
        if missing:
            service_gaps[service["id"]] = missing
    qa = {
        "version": data["version"],
        "topology": topology_report(data),
        "servicePairsWithoutMappedSegment": service_gaps,
        "operatorRosterComparisons": {
            r["id"]: r["corroborationId"] for r in data["services"] if r.get("corroborationId")
        },
        "unknownStationLocations": [r["id"] for r in data["stations"] if r["geometry"] is None],
        "stationServiceCoverage": {
            s["id"]: len(s["stationIds"]) for s in data["services"] if "stationIds" in s
        },
    }
    files[target / "quality.json"] = json_bytes(qa)
    manifest = {str(path): hashlib.sha256(payload).hexdigest() for path, payload in sorted(files.items())}
    files[target / "checksums.json"] = json_bytes({"version": data["version"], "sha256": manifest})
    return files


def publish_bytes(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Replacing one complete file prevents partial JSON reads during a local rebuild.
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        name = f.name
        try:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        except BaseException:
            os.unlink(name)
            raise
    try:
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="fail on stale or missing products; do not write"
    )
    args = parser.parse_args()
    try:
        # Validate, serialize and hash the entire release before touching any product.
        files = artifacts()
        stale = [
            path
            for path, content in files.items()
            if not (ROOT / path).is_file() or (ROOT / path).read_bytes() != content
        ]
        if args.check and stale:
            raise DataError("stale release products: " + ", ".join(map(str, stale)))
        for path in stale:
            publish_bytes(ROOT / path, files[path])
        print(f"{len(files)} checked products; {len(stale)} written")
    except (DataError, KeyError, TypeError, OSError) as e:
        print(f"Atlas build failed: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
