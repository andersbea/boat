# Satellite-Derived Bathymetry → danger datapoints

Turns free **Sentinel-2** imagery over an area (default: **Gräskö**) into
candidate **rock / shoal datapoints** in the same GeoJSON format the app's
"Dangers" layer uses. This is Phase 2 of the self-mapping roadmap: convert
imagery to *datapoints* (not a raster overlay) so each point can be verified
and, if trusted, shipped in the app or uploaded to OpenStreetMap.

> ⚠️ Satellite-derived bathymetry only works in **clear, shallow** water and is
> **uncalibrated** here — treat every output as a *candidate to verify*, never
> as a surveyed depth. Not a substitute for official charts.

## One-time setup

1. Create a free **[Copernicus Data Space](https://dataspace.copernicus.eu)**
   account (done ✅).
2. In the dashboard: **Sentinel Hub → User settings → OAuth clients → Create
   new**. Copy the **client id** and **client secret**.
3. Configure secrets locally (this file is gitignored):
   ```bash
   cp tools/sdb/.env.example tools/sdb/.env
   # edit tools/sdb/.env and paste your SH_CLIENT_ID / SH_CLIENT_SECRET
   ```
4. Install dependencies:
   ```bash
   pip install -r tools/sdb/requirements.txt
   ```

## Run

```bash
python tools/sdb/sdb_pipeline.py            # defaults to Gräskö, summer 2024
# or a custom area / window:
python tools/sdb/sdb_pipeline.py \
  --bbox 18.985 59.660 19.065 59.702 \
  --from 2024-06-01 --to 2024-09-15
```

Output: `tools/sdb/out/dangers.candidates.geojson`.

## Review & use the candidates

1. Open the file (or drop it into `public/` and add a candidates overlay — see
   "Next steps") and eyeball the points against satellite imagery.
2. Copy the points you trust into `public/dangers.geojson` so they ship to the
   app, **or** upload verified rocks to OpenStreetMap as
   `seamark:type=rock`.

## How it works

| Step | Method |
|------|--------|
| Imagery | Sentinel-2 L2A, 10 m, least-cloud mosaic via the CDSE Sentinel Hub Process API (bands B02/B03/B04/B08 + dataMask) |
| Water mask | NDWI (green vs NIR) |
| Relative depth | Stumpf log band-ratio `ln(blue)/ln(green)` (higher = deeper) |
| Shoals | shallowest water pixels, clustered → points (`type: shoal`) |
| Above-water rocks | tiny non-water blobs ringed by water → points (`type: rock_above`) |

Tunables live as keyword args in `derive_dangers.detect_dangers` (NDWI
threshold, shallow percentile, min/max blob sizes).

## Next steps (not yet built)
- A "Dangers (candidates)" overlay in the app that loads this file and lets you
  accept/reject each point in-browser, writing accepted ones into the main
  layer (the data model already carries `source` and `verified`).
- Depth **calibration** against a few known soundings (or free ICESat-2 lidar)
  to turn relative depth into metres.
