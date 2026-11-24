#!/usr/bin/env python3
"""Independently decode published GIS geometry in three formats with GEOS."""

import csv
import json
import xml.etree.ElementTree as ET

from atlas_exports import NS
from atlas_model import ROOT, SPATIAL
from shapely import from_wkt
from shapely.geometry import shape
from shapely.validation import explain_validity


def checked(uid, value):
    if value is None:
        return None
    geom = shape(value)
    if geom.is_empty or not geom.is_valid:
        raise ValueError(f"{uid}: {explain_validity(geom)}")
    return geom


def kml_geometry(node):
    name = node.tag.split("}")[-1]
    if name in ("Point", "LineString", "LinearRing"):
        positions = [
            [float(n) for n in pos.split(",")] for pos in node.findtext(f"{{{NS}}}coordinates").split()
        ]
        return {"type": name, "coordinates": positions[0] if name == "Point" else positions}
    if name == "Polygon":
        rings = node.findall(f"./*/{{{NS}}}LinearRing")
        return {"type": name, "coordinates": [kml_geometry(r)["coordinates"] for r in rings]}
    if name == "MultiGeometry":
        parts = [kml_geometry(part) for part in node]
        return {"type": "Multi" + parts[0]["type"], "coordinates": [p["coordinates"] for p in parts]}
    return None


def check_export(group):
    folder = ROOT / "exports" / group
    collection = json.loads((folder / "atlas.geojson").read_text())["features"]
    marks = ET.parse(folder / "atlas.kml").findall(f".//{{{NS}}}Placemark")
    with (folder / "atlas.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not (len(collection) == len(marks) == len(rows)):
        raise ValueError(f"{group}: record counts differ")
    n = 0
    for feature, mark, row in zip(collection, marks, rows):
        uid = feature["id"]
        if mark.get("id") != uid or row["id"] != uid:
            raise ValueError(f"{group}: changed feature identity")
        geom = checked(uid, feature["geometry"])
        kml = next((value for child in mark if (value := kml_geometry(child)) is not None), None)
        others = (checked(uid, kml), from_wkt(row["WKT"]) if row["WKT"] else None)
        if any(
            (g is None) != (geom is None) or (g is not None and not geom.equals_exact(g, 0)) for g in others
        ):
            raise ValueError(f"{uid}: GIS format disagreement")
        n += (geom is not None) * 3
    return n


if __name__ == "__main__":
    total = 0
    data = json.loads((ROOT / "data/published/atlas.json").read_text())
    for key in SPATIAL:
        for row in data[key]:
            for field in ("geometry", "footprint", "uncertaintyGeometry"):
                total += checked(row["id"] + "." + field, row.get(field)) is not None
    for i, feature in enumerate(
        json.loads((ROOT / "data/published/context.geojson").read_text())["features"]
    ):
        total += checked(f"context.{i}", feature["geometry"]) is not None
    total += sum(check_export(group) for group in ("osm", "research"))
    print(
        f"GEOS validated {total} geometry representations and confirmed GeoJSON, CSV/WKT and KML coordinate equivalence"
    )
