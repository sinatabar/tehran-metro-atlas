#!/usr/bin/env python3
"""Compare two same-shape reviewed snapshots without promoting either."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from atlas_model import RELATED, SPATIAL, read


def compare(before, after):
    report = []
    for table in (*SPATIAL, *RELATED, "networks", "stationEvidence", "placeEvidence"):
        identifier = {"stationEvidence": "stationId", "placeEvidence": "placeId"}.get(table, "id")
        old, new = ({row[identifier]: row for row in snap.get(table, [])} for snap in (before, after))
        for uid in sorted(set(old) | set(new)):
            if uid not in old or uid not in new:
                report.append({"table": table, "id": uid, "change": "added" if uid in new else "removed"})
            elif old[uid] != new[uid]:
                changed = sorted(
                    k for k in old[uid].keys() | new[uid].keys() if old[uid].get(k) != new[uid].get(k)
                )
                entry = {"table": table, "id": uid, "change": "modified", "fields": changed}
                if "status" in changed:
                    entry["statusChange"] = [old[uid].get("status"), new[uid].get("status")]
                if "geometry" in changed:
                    entry["spatialReview"] = True
                report.append(entry)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(read(args.baseline), read(args.candidate)), ensure_ascii=False, indent=2))
