#!/usr/bin/env python3
"""Check validators only for registry URLs explicitly opted into monitoring."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from atlas_model import ROOT, read


def probe(source, prior):
    # Conditional HEAD only. Monitoring does not collect copyrighted page content.
    headers = {"User-Agent": "TehranMetroAtlas/1.0 (source availability monitor)"}
    if prior.get("etag"):
        headers["If-None-Match"] = prior["etag"]
    if prior.get("lastModified"):
        headers["If-Modified-Since"] = prior["lastModified"]
    request = urllib.request.Request(source["url"], headers=headers, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=12) as res:
            etag, modified = res.headers.get("ETag"), res.headers.get("Last-Modified")
            state = {"etag": etag, "lastModified": modified}
            result = "no-validator"
            if etag or modified:
                result = "unchanged" if state == prior else ("review" if prior else "baseline")
            return {"id": source["id"], "result": result, "validators": state}
    except urllib.error.HTTPError as error:
        if error.code == 304:
            return {"id": source["id"], "result": "unchanged", "validators": prior}
        return {"id": source["id"], "result": "unavailable", "status": error.code, "validators": prior}
    except OSError:
        return {"id": source["id"], "result": "unavailable", "validators": prior}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, help="previous monitor output")
    args = parser.parse_args()
    old = {r["id"]: r.get("validators", {}) for r in read(args.baseline)} if args.baseline else {}
    sources = [s for s in read(ROOT / "data/sources/registry.json") if s.get("monitor") is True]
    sources += read(ROOT / "data/sources/monitoring.json")
    reports = []
    for source in sources:
        result = probe(source, old.get(source["id"], {}))
        result["checkedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        reports.append(result)
    print(json.dumps(reports, ensure_ascii=False, indent=2))
