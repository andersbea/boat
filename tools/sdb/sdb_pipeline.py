"""
End-to-end: Sentinel-2 imagery over Gräskö -> candidate danger datapoints.

Usage:
  pip install -r tools/sdb/requirements.txt
  # put SH_CLIENT_ID / SH_CLIENT_SECRET in tools/sdb/.env (gitignored)
  python tools/sdb/sdb_pipeline.py

Writes tools/sdb/out/dangers.candidates.geojson — review it, then copy the
points you trust into public/dangers.geojson (or upload to OpenStreetMap).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from derive_dangers import detect_dangers
from fetch_imagery import credentials_from_env, fetch_reflectance, get_token

# Gräskö, outer Stockholm archipelago: [min_lon, min_lat, max_lon, max_lat].
GRASKO_BBOX = [18.985, 59.660, 19.065, 59.702]

HERE = Path(__file__).resolve().parent


def load_dotenv(path: Path) -> None:
    """Tiny .env loader (no dependency) — sets vars that aren't already set."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, default=GRASKO_BBOX,
                        metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"))
    parser.add_argument("--from", dest="time_from", default="2024-06-01")
    parser.add_argument("--to", dest="time_to", default="2024-09-15")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--max-cloud", type=int, default=20)
    parser.add_argument("--out", default=str(HERE / "out" / "dangers.candidates.geojson"))
    args = parser.parse_args()

    load_dotenv(HERE / ".env")
    client_id, client_secret = credentials_from_env()

    print(f"Authenticating with Copernicus Data Space…")
    token = get_token(client_id, client_secret)

    print(f"Fetching Sentinel-2 over bbox {args.bbox} ({args.time_from}…{args.time_to})…")
    reflectance = fetch_reflectance(
        token, args.bbox, args.time_from, args.time_to,
        size=args.size, max_cloud=args.max_cloud,
    )

    print("Detecting shoals and above-water rocks…")
    collection = detect_dangers(reflectance, args.bbox)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(collection, indent=2))

    print(f"Wrote {len(collection['features'])} candidate datapoints -> {out_path}")
    print("Review them, then merge trusted points into public/dangers.geojson.")


if __name__ == "__main__":
    main()
