"""Lossless UTF-8 tabular, GeoJSON and KML exports per provenance group."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from atlas_model import SPATIAL

NS = "http://www.opengis.net/kml/2.2"
ET.register_namespace("", NS)
CREDITS = {
    "osm": "© OpenStreetMap contributors · ODbL 1.0 · https://opendatacommons.org/licenses/odbl/1-0/ · https://www.openstreetmap.org/copyright",
    "research": "Independent factual inventory · see DATA_LICENSE.md and linked sources for reuse terms",
}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def json_bytes(value):
    return (compact(value) + "\n").encode("utf-8")


def child(node, tag, value=None, attrs=None):
    out = ET.SubElement(node, "{" + NS + "}" + tag, attrs or {})
    if value is not None:
        out.text = str(value)
    return out


def coordinates(points, sep):
    return ",".join(sep.join(str(v) for v in p) for p in points)


def kml_shape(node, g):
    if not g:
        return
    kind, coords = g["type"], g["coordinates"]
    if kind in ("MultiLineString", "MultiPolygon"):
        shape = child(node, "MultiGeometry")
        for part in coords:
            kml_shape(shape, {"type": kind[5:], "coordinates": part})
        return
    shape = child(node, kind)
    if kind == "Polygon":
        for i, ring in enumerate(coords):
            b = child(shape, "outerBoundaryIs" if i == 0 else "innerBoundaryIs")
            child(child(b, "LinearRing"), "coordinates", " ".join(",".join(map(str, p)) for p in ring))
    else:
        points = [coords] if kind == "Point" else coords
        child(shape, "coordinates", " ".join(",".join(map(str, p)) for p in points))


def wkt(g):
    if g is None:
        return ""
    kind, coords = g["type"], g["coordinates"]
    if kind == "Point":
        body = " ".join(map(str, coords))
    elif kind == "LineString":
        body = coordinates(coords, " ")
    elif kind in ("Polygon", "MultiLineString"):
        body = ",".join("(" + coordinates(ring, " ") + ")" for ring in coords)
    else:
        body = ",".join(
            "(" + ",".join("(" + coordinates(ring, " ") + ")" for ring in poly) + ")" for poly in coords
        )
    return kind.upper() + " (" + body + ")"


def kml(rows, title, attribution):
    doc = ET.Element("{" + NS + "}kml")
    layer = child(doc, "Document")
    child(layer, "name", title)
    child(layer, "description", attribution)
    for r in rows:
        props = r["properties"]
        mark = child(layer, "Placemark", attrs={"id": r["id"]})
        child(mark, "name", props["name"]["fa"] + " | " + props["name"]["en"])
        extended = child(mark, "ExtendedData")
        for k, v in props.items():
            item = child(extended, "Data", attrs={"name": k})
            child(item, "value", compact(v) if not isinstance(v, str) else v)
        kml_shape(mark, r["geometry"])
    return ET.tostring(doc, encoding="utf-8", xml_declaration=True)


def safe_cell(value):
    # Prevent spreadsheet formula evaluation in human-readable columns.
    return (
        "'" + value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) else value
    )


def csv_bytes(rows):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(
        (
            "id",
            "entity",
            "name_fa",
            "name_en",
            "line_ids",
            "status",
            "confidence",
            "longitude",
            "latitude",
            "WKT",
            "source_ids",
            "source_urls",
            "dataset",
            "version",
            "attribution",
            "metadata_json",
        )
    )
    for r in rows:
        p, g = r["properties"], r["geometry"]
        xy = g["coordinates"] if g and g["type"] == "Point" else ("", "")
        fields = (
            r["id"],
            p["entity"],
            p["name"]["fa"],
            p["name"]["en"],
            "|".join(p["lineIds"]),
            p["status"],
            p["confidence"],
            *xy,
            wkt(g),
            "|".join(p["sourceIds"]),
            "|".join(p["sourceUrls"]),
            p["dataset"],
            p["version"],
            p["attribution"],
            compact(p),
        )
        writer.writerow(map(safe_cell, fields))
    return buf.getvalue().encode("utf-8-sig")


def compress_kml(content):
    buf = io.BytesIO()
    member = zipfile.ZipInfo("doc.kml", (1980, 1, 1, 0, 0, 0))
    member.compress_type = zipfile.ZIP_DEFLATED
    member.create_system = 3
    member.external_attr = 0o100644 << 16
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(member, content)
    return buf.getvalue()


def release_exports(data):
    files, manifest = {}, {"version": data["version"], "updated": data["updated"], "datasets": {}}
    source_by_id = {s["id"]: s for s in data["sources"]}
    for group, credit in CREDITS.items():
        rows = []
        for key in SPATIAL:
            for record in data[key]:
                if record["dataset"] != group:
                    continue
                props = {k: v for k, v in record.items() if k != "geometry"}
                props.update(
                    entity=key,
                    version=data["version"],
                    attribution=credit,
                    sourceUrls=[source_by_id[i]["url"] for i in record["sourceIds"]],
                )
                rows.append(
                    {
                        "type": "Feature",
                        "id": record["id"],
                        "geometry": record["geometry"],
                        "properties": props,
                    }
                )
        prefix = Path("exports") / group
        geo = {
            "type": "FeatureCollection",
            "version": data["version"],
            "attribution": credit,
            "features": rows,
        }
        content = kml(rows, "Tehran Metro Atlas / " + group + " / " + data["version"], credit)
        formats = {
            "geojson": json_bytes(geo),
            "csv": csv_bytes(rows),
            "kml": content,
            "kmz": compress_kml(content),
        }
        for ext, payload in formats.items():
            files[prefix / ("atlas." + ext)] = payload
        subset = {
            key: [r for r in data[key] if r.get("dataset") == group]
            for key in ("sources", "services", "history")
        }
        used = {i for row in rows for i in row["properties"]["sourceIds"]}
        used |= {i for key in ("services", "history") for row in subset[key] for i in row["sourceIds"]}
        subset["sources"] = [s for s in data["sources"] if s.get("dataset") == group or s["id"] in used]
        if group == "research":
            subset["stationEvidence"] = data.get("stationEvidence", [])
            subset["placeEvidence"] = data.get("placeEvidence", [])
        files[prefix / "references.json"] = json_bytes(
            dict(version=data["version"], attribution=credit, **subset)
        )
        manifest["datasets"][group] = {
            "features": len(rows),
            "located": sum(r["geometry"] is not None for r in rows),
            "attribution": credit,
            "files": {
                ext: {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
                for ext, payload in formats.items()
            },
        }
    files[Path("exports/manifest.json")] = json_bytes(manifest)
    return files
