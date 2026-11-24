"""Regression tests use a small synthetic fixture. Release files must also pass off-line."""

import csv
import io
import json
import sys
import unittest
import xml.etree.ElementTree as ET
import zipfile
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from atlas_exports import NS, release_exports
from atlas_model import (
    RELATED,
    SPATIAL,
    DataError,
    assemble_view,
    documented_length,
    geometry,
    metrics,
    normalize_feature,
    validate,
)
from build import artifacts, topology_report
from review_changes import compare


def fixture():
    data = {k: [] for k in (*SPATIAL, *RELATED, "networks", "revisions", "stationEvidence")}
    data.update(version="test.1", updated="2026-11-24")
    data["sources"] = [
        dict(
            id="test-source",
            title="Synthetic fixture",
            publisher="Test",
            type="test",
            license="test",
            url="https://example.org/record",
            published=None,
            retrieved="2026-11-23",
            reliability="test",
            dataset="osm",
        )
    ]

    def entity(uid, g=None, **more):
        return dict(
            id=uid,
            name={"en": uid, "fa": uid},
            lineIds=["line-a"],
            status="operational",
            confidence="high" if g else "unknown",
            geometry=g,
            sourceIds=["test-source"],
            **more,
        )

    data["lines"] = [normalize_feature(entity("line-a", number=1, color="#123456"), "lines", "research")]
    a, b = [51.39, 35.67], [51.395, 35.67]
    data["stations"] = [
        normalize_feature(entity(uid, {"type": "Point", "coordinates": xy}), "stations", "osm")
        for uid, xy in (("station-a", a), ("station-b", b))
    ]
    data["segments"] = [
        normalize_feature(
            entity(
                "segment-ab",
                {"type": "LineString", "coordinates": [a, b]},
                startStationId="station-a",
                endStationId="station-b",
                alignmentType="actual",
            ),
            "segments",
            "osm",
        )
    ]
    data["services"] = [
        {
            "id": "test-service",
            "lineId": "line-a",
            "stationIds": ["station-a", "station-b"],
            "sourceIds": ["test-source"],
            "dataset": "osm",
        }
    ]
    return data


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture()

    def test_valid_and_metrics(self):
        validate(self.data)
        m = metrics(self.data)
        self.assertEqual((m["operationalLines"], m["operationalStations"], m["futureLines"]), (1, 2, 0))
        self.assertIsNone(m["operationalLengthKm"])
        self.assertEqual(topology_report(self.data)[0]["components"], 1)

    def test_coordinates_order_bounds_and_validity(self):
        for coords in ([35.7, 51.4], [50, 20], [float("nan"), 35.7], [True, 35.7], [51.4, 35.7, 12]):
            with self.subTest(coords=coords), self.assertRaises(DataError):
                geometry({"type": "Point", "coordinates": coords}, "fixture")
        with self.assertRaisesRegex(DataError, "degenerate"):
            geometry({"type": "LineString", "coordinates": [[51.4, 35.7]] * 3}, "fixture")
        with self.assertRaisesRegex(DataError, "open"):
            geometry(
                {
                    "type": "Polygon",
                    "coordinates": [[[51.4, 35.7], [51.5, 35.7], [51.5, 35.8], [51.4, 35.8]]],
                },
                "fixture",
            )

    def test_duplicate_station_ids_and_physical_duplicates(self):
        self.data["stations"].append(deepcopy(self.data["stations"][0]))
        with self.assertRaisesRegex(DataError, "duplicate ID"):
            validate(self.data)
        self.data["stations"][-1]["id"] = "station-c"
        with self.assertRaisesRegex(DataError, "duplicate physical"):
            validate(self.data)

    def test_invalid_opened_status_and_confidence(self):
        st = self.data["stations"][0]
        for field, value, msg in (
            ("opened", "2026-02-29", "calendar"),
            ("opened", "2050-01-01", "future"),
            ("confidence", "probably_exact", "confidence"),
            ("sourceIds", [], "missing references"),
            ("status", "open", "status"),
            ("lineIds", ["ghost"], "unresolved"),
        ):
            original = st[field]
            st[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(DataError, msg):
                validate(self.data)
            st[field] = original
        st["geometry"] = None
        with self.assertRaisesRegex(DataError, "located confidence"):
            validate(self.data)

    def test_unresolved_or_duplicate_service_stops(self):
        service = self.data["services"][0]
        for order in (["station-b", "station-b"], ["station-c"]):
            service["stationIds"] = order
            with self.assertRaises(DataError):
                validate(self.data)

    def test_unexplained_geometry_gap_blocks_promotion(self):
        self.data["segments"].clear()
        with self.assertRaisesRegex(DataError, "unmapped or incorrect station sequence"):
            validate(self.data)
        self.data["services"][0]["unmappedPairs"] = [["station-a", "station-b"]]
        validate(self.data)

    def test_operator_roster_order_and_branch_corroboration(self):
        service = dict(
            self.data["services"][0],
            id="operator-pattern",
            dataset="research",
            corroboratesServiceId="test-service",
            stationIds=["station-b", "station-a"],
        )
        self.data["services"].append(service)
        self.assertEqual(len(assemble_view(self.data)["services"]), 1)
        service["stationIds"] = ["station-a"]
        with self.assertRaisesRegex(DataError, "service order differ"):
            assemble_view(self.data)

    def test_disconnected_segment_and_endpoints(self):
        self.data["segments"][0]["geometry"]["coordinates"][0] = [51.1, 35.68]
        with self.assertRaisesRegex(DataError, "disconnected"):
            validate(self.data)
        self.data["segments"][0]["startStationId"] = "station-other"
        with self.assertRaisesRegex(DataError, "invalid startStationId"):
            validate(self.data)

    def test_reversed_route_vertices_are_detected(self):
        self.data["segments"][0]["geometry"]["coordinates"].reverse()
        with self.assertRaisesRegex(DataError, "declared direction"):
            validate(self.data)

    def test_history_reversal_requires_evidence_and_rationale(self):
        self.data["history"] = [
            dict(id=uid, entityId="station-a", status=status, date=day, sourceIds=["test-source"])
            for uid, status, day in (("e1", "operational", "2009-01-01"), ("e2", "proposed", "2026-01-02"))
        ]
        with self.assertRaisesRegex(DataError, "reversal"):
            validate(self.data)

    def test_research_assertions_preserve_spatial_source(self):
        self.data["stationEvidence"] = [
            dict(
                stationId="station-a",
                sourceIds=["test-source"],
                aliases=["A"],
                opened="2015-02-07",
                dateConfidence="verified",
            )
        ]
        view = assemble_view(self.data)
        self.assertEqual(view["stations"][0]["opened"], "2015-02-07")
        self.assertEqual(view["stations"][0]["geometrySourceIds"], ["test-source"])
        self.assertIsNone(self.data["stations"][0]["opened"])
        self.assertEqual(metrics(view)["knownOpeningsByDate"], {"2015-02-07": 1})

    def test_deduplicate_reverse_edges_in_complete_review(self):
        first = self.data["segments"][0]
        second = deepcopy(first)
        second.update(id="reverse")
        second["geometry"]["coordinates"].reverse()
        self.data["segments"].append(second)
        self.data["lengthCoverage"] = {
            "operational": {
                "complete": True,
                "segmentIds": [first["id"], second["id"]],
                "sourceIds": ["test-source"],
            }
        }
        self.assertAlmostEqual(documented_length(self.data, "operational"), 0.45, delta=0.02)

    def test_review_detects_status_and_geometry_changes(self):
        before = deepcopy(self.data)
        self.data["stations"][0].update(status="temporarily_closed", geometry=None)
        self.assertEqual(
            compare(before, self.data),
            [
                {
                    "table": "stations",
                    "id": "station-a",
                    "change": "modified",
                    "fields": ["geometry", "status"],
                    "statusChange": ["operational", "temporarily_closed"],
                    "spatialReview": True,
                }
            ],
        )


class ExportTests(unittest.TestCase):
    def test_kml_kmz_csv_geojson_roundtrip_and_group_separation(self):
        allfiles = release_exports(fixture())
        self.assertEqual(allfiles, release_exports(fixture()))
        for group, count in (("osm", 3), ("research", 1)):
            directory = Path("exports") / group
            payload = allfiles[directory / "atlas.kml"]
            with zipfile.ZipFile(io.BytesIO(allfiles[directory / "atlas.kmz"])) as kmz:
                self.assertEqual(kmz.namelist(), ["doc.kml"])
                self.assertEqual(kmz.read("doc.kml"), payload)
            marks = ET.fromstring(payload).findall(".//k:Placemark", {"k": NS})
            geo = json.loads(allfiles[directory / "atlas.geojson"])
            rows = list(csv.DictReader(io.StringIO(allfiles[directory / "atlas.csv"].decode("utf-8-sig"))))
            self.assertEqual(len(marks), count)
            ids = [item["id"] for item in geo["features"]]
            self.assertEqual(ids, [m.get("id") for m in marks])
            self.assertEqual(ids, [r["id"] for r in rows])
            for f, row in zip(geo["features"], rows):
                self.assertEqual(f["properties"]["dataset"], group)
                self.assertEqual(json.loads(row["metadata_json"]), f["properties"])
                self.assertEqual(bool(row["WKT"]), bool(f["geometry"]))


class ReleaseTests(unittest.TestCase):
    def test_products_match_reviewed_inputs_and_roundtrip(self):
        files = artifacts()
        for name, expected in files.items():
            self.assertEqual((ROOT / name).read_bytes(), expected, f"{name}: run python3 scripts/build.py")
        atlas = json.loads(files[Path("data/published/atlas.json")])
        self.assertGreater(len(atlas["stations"]), 0)
        self.assertGreater(len(atlas["segments"]), 0)
        for group in ("osm", "research"):
            prefix = Path("exports") / group
            features = json.loads(files[prefix / "atlas.geojson"])["features"]
            ids = [f["id"] for f in features]
            rows = list(csv.DictReader(io.StringIO(files[prefix / "atlas.csv"].decode("utf-8-sig"))))
            self.assertEqual(ids, [r["id"] for r in rows])
            xml = ET.fromstring(files[prefix / "atlas.kml"])
            self.assertEqual(ids, [f.get("id") for f in xml.findall(".//k:Placemark", {"k": NS})])
            with zipfile.ZipFile(io.BytesIO(files[prefix / "atlas.kmz"])) as z:
                self.assertEqual(files[prefix / "atlas.kml"], z.read("doc.kml"))


if __name__ == "__main__":
    unittest.main()
