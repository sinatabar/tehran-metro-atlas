"""Reviewed inputs, normalized public entities, release metrics and offline validation."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "data/schemas/atlas.schema.json").read_text())
STATUSES = frozenset(SCHEMA["$defs"]["status"]["enum"])
CONFIDENCES = frozenset(SCHEMA["$defs"]["confidence"]["enum"])
ALIGNMENTS = frozenset(SCHEMA["$defs"]["alignment"]["enum"])
SPATIAL = (
    "lines",
    "stations",
    "segments",
    "projects",
    "places",
    "complexes",
    "platforms",
    "entrances",
    "interchanges",
    "alternatives",
)
RELATED = ("services", "history", "sources")
ACTIVE_FUTURE = {"under_construction", "contract_awarded", "approved", "in_planning", "proposed"}
# Geographic import envelope includes Tehran's surrounding passenger rail destinations.
WEST, SOUTH, EAST, NORTH = 49.5, 34.7, 52.5, 36.4


class DataError(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise DataError(message)


def read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError) as error:
        raise DataError(f"{path}: {error}") from error


def strings(value):
    return isinstance(value, list) and all(isinstance(v, str) and v for v in value)


def bilingual(value):
    return isinstance(value, dict) and all(
        isinstance(value.get(lang), str) and value[lang].strip() for lang in ("fa", "en")
    )


def canonical_date(value, label):
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    raise DataError(f"{label}: expected an ISO Gregorian calendar day, got {value!r}")


def normalize_name(text):
    text = text.casefold().translate(str.maketrans("يىك", "ییک"))
    return "".join(c for c in text if c.isalnum())


def distance(a, b):
    """Great-circle separation in metres, sufficient for grouping and quality screens."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    hav = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 12_742_017.6 * math.asin(math.sqrt(min(1, hav)))


def point(coords, label):
    require(
        isinstance(coords, (list, tuple))
        and len(coords) == 2
        and all(type(v) in (float, int) and math.isfinite(v) for v in coords),
        f"{label}: invalid position",
    )
    lon, lat = coords
    require(
        WEST <= lon <= EAST and SOUTH <= lat <= NORTH,
        f"{label}: outside Tehran region or reversed axes {coords}",
    )


def path_coords(coords, label, ring=False):
    require(isinstance(coords, list) and len(coords) >= (4 if ring else 2), f"{label}: short path")
    for c in coords:
        point(c, label)
    require(len(set(map(tuple, coords))) >= (3 if ring else 2), f"{label}: degenerate path")
    if ring:
        require(coords[0] == coords[-1], f"{label}: polygon ring is open")
        # Signed area also rejects collapsed linear rings.
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(coords, coords[1:]))
        require(abs(area) > 1e-13, f"{label}: degenerate polygon")


def geometry(g, label):
    if g is None:
        return
    require(isinstance(g, dict), f"{label}: geometry object required")
    kind, coords = g.get("type"), g.get("coordinates")
    if kind == "Point":
        point(coords, label)
    elif kind == "LineString":
        path_coords(coords, label)
    elif kind in ("MultiLineString", "Polygon", "MultiPolygon"):
        require(isinstance(coords, list) and len(coords) > 0, f"{label}: empty geometry")
        if kind == "MultiPolygon":
            for poly in coords:
                geometry({"type": "Polygon", "coordinates": poly}, label)
        else:
            for part in coords:
                path_coords(part, label, ring=kind == "Polygon")
    else:
        raise DataError(f"{label}: unsupported geometry {kind}")


def normalize_feature(row, table, group):
    record = dict(row, dataset=group)
    # Missing optional evidence remains explicitly unknown.
    for key in (
        "geometry",
        "notes",
        "uncertaintyM",
        "constructionStatus",
        "effectiveFrom",
        "effectiveTo",
        "lastVerified",
    ):
        record.setdefault(key, None)
    record.setdefault("lineIds", [])
    if table == "stations":
        for key in (
            "opened",
            "expected",
            "dateConfidence",
            "district",
            "neighborhood",
            "accessibility",
            "complexId",
        ):
            record.setdefault(key, None)
        for key in ("aliases", "landmarkIds"):
            record.setdefault(key, [])
        record.setdefault("interchange", None)
    if table == "segments":
        for key in ("startStationId", "endStationId"):
            record.setdefault(key, None)
    return record


def load_release(root=ROOT):
    data = read(root / "data/releases/current.json")
    for key in (*SPATIAL, *RELATED, "networks"):
        data[key] = []
    data["sources"] = [dict(s, dataset="research") for s in read(root / "data/sources/registry.json")]
    for group in ("research", "osm"):
        inputs = read(root / f"data/reviewed/{group}/network.json")
        for table in (*SPATIAL, *RELATED, "networks"):
            for record in inputs.get(table, []):
                if table in SPATIAL:
                    record = normalize_feature(record, table, group)
                else:
                    record = dict(record, dataset=group)
                data[table].append(record)
    roster = read(root / "data/reviewed/research/roster.json")
    data["stationEvidence"] = roster["stationEvidence"]
    data["placeEvidence"] = roster["placeEvidence"]
    data["services"].extend(dict(row, dataset="research") for row in roster["services"])
    # A multi-line station becomes a transfer only after the reviewed station
    # explicitly confirms the operating interchange. Keep relationship geometry null.
    complex_ids = {r["id"] for r in data["complexes"]}
    for station in data["stations"]:
        if not station.get("interchange") or station["dataset"] != "osm":
            continue
        uid = station["id"]
        cid = station.get("complexId") or "complex-" + uid
        station["complexId"] = cid
        common = dict(
            name=station["name"],
            stationIds=[uid],
            lineIds=station["lineIds"],
            sourceIds=station["sourceIds"],
            status=station["status"],
            geometry=None,
            confidence="unknown",
            lastVerified=station.get("lastVerified"),
        )
        if cid not in complex_ids:
            data["complexes"].append(normalize_feature(dict(common, id=cid), "complexes", "osm"))
            complex_ids.add(cid)
        rid = "interchange-" + uid
        if not any(r["id"] == rid for r in data["interchanges"]):
            data["interchanges"].append(
                normalize_feature(dict(common, id=rid, complexId=cid), "interchanges", "osm")
            )
    if not data["networks"]:
        data["networks"] = [
            {
                "id": "network-tehran",
                "name": {"fa": "متروی تهران و حومه", "en": "Tehran Metro and suburban railway"},
                "lineIds": [line["id"] for line in data["lines"]],
            }
        ]
    for table in (*SPATIAL, "sources", "services", "networks"):
        data[table].sort(key=lambda r: r["id"])
    data["lines"].sort(key=lambda r: (r.get("number") is None, r.get("number") or 0, r["id"]))
    data["history"].sort(key=lambda r: (r.get("date") or "", r["id"]))
    validate(data)
    return data


def assemble_view(data):
    """Join reviewed passenger assertions in the browser view. Separate exports keep their original lineage."""
    view = dict(data)
    by_id = {row["id"]: dict(row) for row in data["stations"]}
    known_sources = {s["id"] for s in data["sources"]}
    for claim in data.get("stationEvidence", []):
        uid = claim["stationId"]
        require(uid in by_id, f"{uid}: station evidence has no target")
        valid_refs(claim.get("sourceIds"), known_sources, uid, True)
        station = by_id[uid]
        station.setdefault("geometrySourceIds", list(station["sourceIds"]) if station["geometry"] else [])
        station["sourceIds"] = list(dict.fromkeys(station["sourceIds"] + claim["sourceIds"]))
        station["aliases"] = list(dict.fromkeys(station["aliases"] + claim.get("aliases", [])))
        for key in ("opened", "dateConfidence", "notes", "lastVerified"):
            if claim.get(key) is not None:
                require(
                    station.get(key) in (None, claim[key]) or bool(claim.get("supersedes")),
                    f"{uid}: conflicting {key} needs reviewed supersession",
                )
                station[key] = claim[key]
    view["stations"] = list(by_id.values())
    places = {r["id"]: dict(r) for r in data["places"]}
    for claim in data.get("placeEvidence", []):
        uid = claim["placeId"]
        require(uid in places, f"{uid}: place evidence has no target")
        valid_refs(claim.get("sourceIds"), known_sources, uid, True)
        place = places[uid]
        place.setdefault("geometrySourceIds", list(place["sourceIds"]) if place["geometry"] else [])
        place["sourceIds"] = list(dict.fromkeys(place["sourceIds"] + claim["sourceIds"]))
        require(bilingual(claim.get("notes")), f"{uid}: place evidence needs bilingual notes")
        place["notes"] = claim["notes"]
    view["places"] = list(places.values())
    services = {r["id"]: dict(r) for r in data["services"] if not r.get("corroboratesServiceId")}
    for comparison in data["services"]:
        reference = comparison.get("corroboratesServiceId")
        if not reference:
            continue
        original = services.get(reference)
        require(
            original and original["lineId"] == comparison["lineId"],
            f"{reference}: missing service comparison",
        )
        ordered = original["stationIds"]
        require(
            comparison["stationIds"] in (ordered, ordered[::-1]),
            f"{reference}: operator and OSM service order differ",
        )
        original["sourceIds"] = list(dict.fromkeys(original["sourceIds"] + comparison["sourceIds"]))
        original["corroborationId"] = comparison["id"]
        if comparison.get("name"):
            original["name"] = comparison["name"]
    if data.get("coveragePolicy", {}).get("requireIndependentOperatingRoster"):
        observed = [
            r
            for r in services.values()
            if r.get("dataset") == "osm" and r.get("status", "operational") == "operational"
        ]
        require(
            observed and all(r.get("corroborationId") for r in observed), "unreviewed operating service"
        )
        checked_ids = {c["stationId"] for c in data["stationEvidence"]}
        require(
            all(uid in checked_ids for r in observed for uid in r["stationIds"]),
            "operating stop missing independent evidence",
        )
    view["services"] = list(services.values())
    validate(view)
    view["metrics"] = metrics(view)
    return view


def metrics(data):
    lines, stations = data["lines"], data["stations"]
    opening_series = defaultdict(int)
    for row in stations:
        if row.get("opened") and row["status"] == "operational":
            opening_series[row["opened"]] += 1
    return {
        "operationalLines": sum(r["status"] == "operational" for r in lines),
        "operationalStations": sum(r["status"] == "operational" for r in stations),
        "futureLines": sum(r["status"] in ACTIVE_FUTURE for r in lines),
        "stationsUnderConstruction": sum(r["status"] == "under_construction" for r in stations),
        "approvedStations": sum(r["status"] == "approved" for r in stations),
        "operationalLengthKm": documented_length(data, "operational"),
        "plannedLengthKm": documented_length(data, "planned"),
        "mappedPassengerLengthKm": mapped_length(data),
        "knownOpeningsByDate": dict(sorted(opening_series.items())),
        "operationalStationsWithOpeningDate": sum(opening_series.values()),
    }


def mapped_length(data):
    """Measured coverage only, counting reviewed unique physical track edges once."""
    rows = [
        r
        for r in data["segments"]
        if r["geometry"] and r.get("status") == "operational" and r["alignmentType"] == "actual"
    ]
    if not rows or any(type(r.get("countedLengthKm")) not in (float, int) for r in rows):
        return None
    require(
        all(0 <= r["countedLengthKm"] <= r["lengthKm"] + 0.01 for r in rows),
        "invalid mapped length allocation",
    )
    return round(sum(r["countedLengthKm"] for r in rows), 2)


def documented_length(data, scope):
    """Only an explicitly reviewed set of unique passenger corridors is countable."""
    coverage = data.get("lengthCoverage", {}).get(scope)
    if not coverage or not coverage.get("complete"):
        return None
    ids = coverage["segmentIds"]
    require(strings(ids) and ids and len(ids) == len(set(ids)), f"{scope}: invalid length coverage")
    require(
        coverage.get("sourceIds") and set(coverage["sourceIds"]) <= {r["id"] for r in data["sources"]},
        f"{scope}: unsourced corridor review",
    )
    by_id = {s["id"]: s for s in data["segments"]}
    total = 0.0
    seen = set()
    for uid in ids:
        row = by_id.get(uid)
        require(
            row
            and row["status"] in ({"operational"} if scope == "operational" else ACTIVE_FUTURE)
            and row["alignmentType"] in {"actual", "official_planned"}
            and row["geometry"],
            f"{uid}: ineligible countable corridor",
        )
        geom = row["geometry"]
        parts = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        for part in parts:
            for a, b in zip(part, part[1:]):
                edge = tuple(sorted((tuple(a), tuple(b))))
                if a != b and edge not in seen:
                    total += distance(a, b)
                    seen.add(edge)
    return round(total / 1000, 2)


def valid_refs(refs, targets, label, nonempty=False):
    require(strings(refs) and len(refs) == len(set(refs)), f"{label}: duplicate or malformed references")
    require(not nonempty or refs, f"{label}: missing references")
    missing = set(refs) - targets
    require(not missing, f"{label}: unresolved {sorted(missing)}")


def validate(data):
    updated = canonical_date(data["updated"], "release")
    require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]+", data["version"])), "release: invalid version")
    tables = {}
    seen = set()
    for table in (*SPATIAL, *RELATED, "networks", "revisions"):
        require(isinstance(data[table], list), f"{table}: expected array")
        rows = {}
        for row in data[table]:
            uid = row.get("id")
            require(
                isinstance(uid, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9._:-]*", uid),
                f"{table}: bad identifier {uid!r}",
            )
            require(uid not in seen, f"{table}: duplicate ID {uid}")
            rows[uid] = row
            seen.add(uid)
        tables[table] = rows
    source_ids, line_ids = set(tables["sources"]), set(tables["lines"])
    for src in data["sources"]:
        uid = src["id"]
        require("published" in src, f"{uid}: record publication day or explicit null")
        for field in ("title", "publisher", "url", "retrieved", "type", "reliability", "license"):
            require(
                isinstance(src.get(field), str) and src[field].strip(), f"{uid}: missing source {field}"
            )
        require(
            urlsplit(src["url"]).scheme in ("http", "https") and urlsplit(src["url"]).netloc,
            f"{uid}: invalid source URL",
        )
        retrieved = canonical_date(src["retrieved"], uid)
        require(retrieved <= updated, f"{uid}: retrieval after release")
        valid_refs(src.get("lineIds", []), line_ids, uid)
        valid_refs(src.get("stationIds", []), set(tables["stations"]), uid)
        if src.get("published"):
            require(canonical_date(src["published"], uid) <= retrieved, f"{uid}: published after retrieval")
    for revision in data["revisions"]:
        uid = revision["id"]
        require(
            canonical_date(revision["date"], uid) <= updated and bilingual(revision.get("notes")),
            f"{uid}: invalid revision date or notes",
        )
        valid_refs(revision.get("entityIds", []), seen, uid)
    if data.get("coveragePolicy"):
        require(
            any(
                r["version"] == data["version"] and r["date"] == data["updated"] for r in data["revisions"]
            ),
            "release version/date missing from revision history",
        )
    for alternative in data["alternatives"]:
        require(
            alternative.get("projectId") in tables["projects"],
            f"{alternative['id']}: missing alternative project",
        )
        require(
            alternative.get("alignmentType") in ALIGNMENTS,
            f"{alternative['id']}: invalid alternative alignment",
        )
    for net in data["networks"]:
        valid_refs(net["lineIds"], line_ids, net["id"], True)
    for table in SPATIAL:
        for row in data[table]:
            validate_feature(row, table, source_ids, line_ids, updated)
            valid_refs(row.get("revisionIds", []), set(tables["revisions"]), row["id"])
    for line in data["lines"]:
        require(
            line.get("color") is None or re.fullmatch(r"#[a-fA-F0-9]{6}", line["color"]),
            f"{line['id']}: invalid color",
        )
    station_ids = set(tables["stations"])
    for service in data["services"]:
        uid = service["id"]
        require(service.get("lineId") in line_ids, f"{uid}: missing service line")
        valid_refs(service.get("sourceIds"), source_ids, uid, True)
        if "stationIds" in service:
            valid_refs(service["stationIds"], station_ids, uid, True)
            for station_id in service["stationIds"]:
                station = tables["stations"][station_id]
                require(
                    service["lineId"] in station["lineIds"] or service.get("status") in ACTIVE_FUTURE,
                    f"{uid}: station membership {station_id}",
                )
        elif service.get("stationId"):
            require(service["stationId"] in station_ids, f"{uid}: missing service station")
        else:
            raise DataError(f"{uid}: no service stations")
        if "status" in service:
            require(service["status"] in STATUSES, f"{uid}: invalid service status")
    for station in data["stations"]:
        if station["complexId"] is not None:
            require(station["complexId"] in tables["complexes"], f"{station['id']}: missing complex")
        valid_refs(station.get("landmarkIds", []), set(tables["places"]), station["id"])
    for table in ("complexes", "platforms", "entrances", "interchanges"):
        for row in data[table]:
            refs = row.get("stationIds") or [row.get("stationId")]
            valid_refs(refs, station_ids, row["id"], True)
    mapped_pairs = set()
    for seg in data["segments"]:
        validate_segment(seg, tables["stations"])
        if seg["geometry"] and seg["alignmentType"] == "actual":
            mapped_pairs.update(
                (line, frozenset([seg["startStationId"], seg["endStationId"]])) for line in seg["lineIds"]
            )
    for service in data["services"]:
        if service.get("dataset") != "osm" or "stationIds" not in service:
            continue
        order = service["stationIds"]
        gaps = {frozenset(pair) for pair in service.get("unmappedPairs", [])}
        for a, b in zip(order, order[1:]):
            pair = frozenset([a, b])
            require(
                (service["lineId"], pair) in mapped_pairs or pair in gaps,
                f"{service['id']}: unmapped or incorrect station sequence {a}, {b}",
            )
    check_stations(data["stations"])
    check_history(data, seen, source_ids, updated)


def validate_feature(row, table, sources, lines, updated):
    uid = row["id"]
    require(bilingual(row.get("name")), f"{uid}: both names required")
    require(row.get("status") in STATUSES, f"{uid}: invalid status")
    require(row.get("confidence") in CONFIDENCES, f"{uid}: invalid confidence")
    valid_refs(row.get("sourceIds"), sources, uid, True)
    valid_refs(row.get("lineIds"), lines, uid, table in ("stations", "segments"))
    geometry(row.get("geometry"), uid)
    if row.get("geometry") is None:
        require(row["confidence"] == "unknown", f"{uid}: located confidence on unmapped record")
    else:
        require(row["confidence"] != "unknown", f"{uid}: unknown geometry should be null")
    if row.get("notes") is not None:
        require(bilingual(row["notes"]), f"{uid}: notes must be bilingual")
    if row.get("geometrySourceIds"):
        valid_refs(row["geometrySourceIds"], sources, uid)
    if row.get("uncertaintyM") is not None:
        require(
            type(row["uncertaintyM"]) in (float, int) and row["uncertaintyM"] > 0,
            f"{uid}: invalid uncertainty",
        )
    construction = row.get("constructionStatus")
    require(construction is None or construction in STATUSES, f"{uid}: invalid construction status")
    for field in ("opened", "lastVerified", "effectiveFrom", "effectiveTo"):
        if row.get(field):
            day = canonical_date(row[field], f"{uid}.{field}")
            if field in ("opened", "lastVerified"):
                require(day <= updated, f"{uid}: future {field}")
    if row.get("effectiveFrom") and row.get("effectiveTo"):
        require(row["effectiveFrom"] <= row["effectiveTo"], f"{uid}: inverted effective dates")
    expected = row.get("expected")
    if isinstance(expected, dict):
        days = [
            canonical_date(expected[k], f"{uid}.expected.{k}") for k in ("start", "end") if expected.get(k)
        ]
        require(days and days == sorted(days), f"{uid}: invalid expected range")
    elif expected is not None:
        canonical_date(expected, uid)
    if table == "stations":
        require(
            row["geometry"] is None or row["geometry"]["type"] == "Point",
            f"{uid}: station must use representative point",
        )
        require(strings(row.get("aliases", [])), f"{uid}: bad aliases")
        if row.get("opened") and row["status"] in ACTIVE_FUTURE:
            raise DataError(f"{uid}: opened station has pre-opening status")
    if row.get("uncertaintyGeometry") is not None:
        require(row["confidence"] in ("approximate", "indicative"), f"{uid}: unexpected uncertainty area")
        geometry(row["uncertaintyGeometry"], f"{uid}.uncertainty")
        require(
            row["uncertaintyGeometry"]["type"] in ("Polygon", "MultiPolygon"),
            f"{uid}: invalid uncertainty area",
        )


def validate_segment(seg, stations):
    uid, g = seg["id"], seg["geometry"]
    require(seg.get("alignmentType") in ALIGNMENTS, f"{uid}: invalid alignment")
    if g is None:
        require(seg["alignmentType"] == "unknown", f"{uid}: missing geometry for alignment")
    elif g["type"] not in ("LineString", "MultiLineString") or seg["alignmentType"] == "unknown":
        raise DataError(f"{uid}: invalid route geometry")
    endpoints = []
    for end, position in (("startStationId", 0), ("endStationId", -1)):
        station_id = seg.get(end)
        if station_id is None:
            continue
        station = stations.get(station_id)
        require(station and set(seg["lineIds"]) & set(station["lineIds"]), f"{uid}: invalid {end}")
        if g and station["geometry"] and seg["alignmentType"] == "actual":
            parts = g["coordinates"]
            endpoint = parts[position] if g["type"] == "LineString" else parts[position][position]
            location = station["geometry"]["coordinates"]
            endpoints.append((endpoint, location))
            require(
                distance(endpoint, location) <= 700,
                f"{uid}: {end} disconnected from physical station",
            )
    if len(endpoints) == 2:
        (first, start), (last, finish) = endpoints
        correct = distance(first, start) + distance(last, finish)
        reversed_order = distance(first, finish) + distance(last, start)
        require(correct <= reversed_order + 30, f"{uid}: route geometry and declared direction disagree")
    if seg.get("startStationId") and seg.get("endStationId"):
        require(seg["startStationId"] != seg["endStationId"], f"{uid}: identical segment endpoints")


def check_stations(stations):
    by_name = defaultdict(list)
    for row in stations:
        if row["geometry"]:
            by_name[normalize_name(row["name"]["fa"])].append(row)
    for rows in by_name.values():
        for i, a in enumerate(rows):
            for b in rows[:i]:
                if distance(a["geometry"]["coordinates"], b["geometry"]["coordinates"]) < 250:
                    raise DataError(f"{a['id']}, {b['id']}: duplicate physical station candidate")


def check_history(data, entities, source_ids, updated):
    last = {}
    # Operational returns to construction may be new extensions. Record them on
    # their project IDs; a genuine same-entity reversal needs an explicit note.
    reversals = {
        "operational": ACTIVE_FUTURE,
        "cancelled": STATUSES - {"cancelled"},
        "approved": {"proposed", "in_planning"},
    }
    history = sorted(data["history"], key=lambda e: (e["date"], e["id"]))
    for event in history:
        uid, entity, status = event["id"], event.get("entityId"), event.get("status")
        require(entity in entities and status in STATUSES, f"{uid}: invalid history target or status")
        require(canonical_date(event["date"], uid) <= updated, f"{uid}: future observed event")
        valid_refs(event.get("sourceIds"), source_ids, uid, True)
        prior = last.get(entity)
        if prior:
            require(
                prior["date"] != event["date"] or prior["status"] == status,
                f"{uid}: conflicting same-day status",
            )
            require(
                status not in reversals.get(prior["status"], ())
                or bilingual(event.get("correctionReason")),
                f"{uid}: unexplained status reversal",
            )
        last[entity] = event
