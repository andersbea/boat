"""
Turn a small Sentinel-2 reflectance image into candidate danger datapoints.

The output is a GeoJSON FeatureCollection in the same shape the app's Dangers
layer consumes (see src/app/dangers/danger.service.ts), with
properties.source = "imagery" and properties.verified = false, so every point
is treated as a *candidate to verify*, never as surveyed truth.

Method (Satellite-Derived Bathymetry, clear shallow water only):
  * Water mask via NDWI (green vs NIR).
  * Relative depth via the Stumpf log band-ratio (ln(blue) / ln(green)) —
    higher ratio = deeper. Uncalibrated, so we keep depths relative.
  * Shoals  = the shallowest water pixels (low ratio), clustered into points.
  * Above-water rocks = tiny non-water blobs completely surrounded by water.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

# Band order produced by fetch_imagery.py: B02 blue, B03 green, B04 red,
# B08 NIR, dataMask.
B02, B03, B04, B08, MASK = range(5)


def _pix_to_lonlat(col: float, row: float, bbox, shape) -> tuple[float, float]:
    """Pixel centre -> lon/lat, assuming an EPSG:4326 bbox raster, north-up."""
    min_lon, min_lat, max_lon, max_lat = bbox
    height, width = shape
    dx = (max_lon - min_lon) / width
    dy = (max_lat - min_lat) / height
    lon = min_lon + (col + 0.5) * dx
    lat = max_lat - (row + 0.5) * dy
    return lon, lat


def _feature(lon, lat, danger_type, depth, note):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
        "properties": {
            "type": danger_type,
            "depth": depth,
            "source": "imagery",
            "verified": False,
            "note": note,
        },
    }


def detect_dangers(
    refl: np.ndarray,
    bbox,
    *,
    ndwi_water: float = 0.0,
    shallow_percentile: float = 12.0,
    min_shoal_pixels: int = 3,
    max_rock_pixels: int = 16,
) -> dict:
    """`refl` is a (5, H, W) float array of reflectances + data mask."""
    if refl.ndim != 3 or refl.shape[0] < 5:
        raise ValueError("expected a (5, H, W) reflectance array")

    shape = refl.shape[1:]
    blue, green, nir, mask = refl[B02], refl[B03], refl[B08], refl[MASK]
    valid = mask > 0
    eps = 1e-6

    ndwi = (green - nir) / (green + nir + eps)
    water = (ndwi > ndwi_water) & valid
    land = (~water) & valid

    features: list[dict] = []

    # --- Shoals: shallowest clusters of water ---
    n = 1000.0
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.log(n * blue) / np.log(n * green)
    ratio = np.where(water, ratio, np.nan)
    finite = water & np.isfinite(ratio)
    water_ratios = ratio[finite]
    if water_ratios.size:
        threshold = np.percentile(water_ratios, shallow_percentile)
        shallow = finite & (ratio <= threshold)
        labels, count = ndimage.label(shallow)
        for index in range(1, count + 1):
            component = labels == index
            if component.sum() < min_shoal_pixels:
                continue
            row, col = ndimage.center_of_mass(component)
            lon, lat = _pix_to_lonlat(col, row, bbox, shape)
            features.append(
                _feature(lon, lat, "shoal", None, "satellite-derived shoal (uncalibrated)")
            )

    # --- Above-water rocks: tiny land blobs ringed by water ---
    labels, count = ndimage.label(land)
    for index in range(1, count + 1):
        component = labels == index
        size = int(component.sum())
        if not 1 <= size <= max_rock_pixels:
            continue
        border = ndimage.binary_dilation(component) & ~component
        if border.any() and water[border].mean() > 0.6:
            row, col = ndimage.center_of_mass(component)
            lon, lat = _pix_to_lonlat(col, row, bbox, shape)
            features.append(
                _feature(lon, lat, "rock_above", None, "satellite-derived rock/skerry")
            )

    return {"type": "FeatureCollection", "features": features}
