"""
Fetch a small Sentinel-2 reflectance image for an area of interest from the
Copernicus Data Space Ecosystem (CDSE) Sentinel Hub Process API.

Auth uses OAuth2 client credentials. Create them once in the CDSE dashboard:
  https://dataspace.copernicus.eu  ->  Sentinel Hub  ->  User settings  ->
  OAuth clients  ->  "Create new" -> copy the client id and secret.

Provide them via environment variables (e.g. a local, gitignored .env):
  SH_CLIENT_ID, SH_CLIENT_SECRET

Nothing here is boat- or account-specific beyond those two secrets, which stay
on your machine.
"""

from __future__ import annotations

import io
import os

import numpy as np
import requests
import tifffile

TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/"
    "openid-connect/token"
)
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

# Reflectances for blue, green, red, NIR, plus the data mask.
EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    output: { bands: 5, sampleType: "FLOAT32" },
  };
}
function evaluatePixel(s) {
  return [s.B02, s.B03, s.B04, s.B08, s.dataMask];
}
"""


def get_token(client_id: str, client_secret: str) -> str:
    response = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def fetch_reflectance(
    token: str,
    bbox,
    time_from: str,
    time_to: str,
    *,
    size: int = 1024,
    max_cloud: int = 20,
) -> np.ndarray:
    """Return a (5, H, W) float32 reflectance array for the bbox (EPSG:4326).

    A least-cloud mosaic over [time_from, time_to] is used, so pick a summer
    window with clear days for the best shallow-water visibility.
    """
    payload = {
        "input": {
            "bounds": {
                "bbox": list(bbox),
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": time_from, "to": time_to},
                        "maxCloudCoverage": max_cloud,
                        "mosaickingOrder": "leastCC",
                    },
                }
            ],
        },
        "output": {
            "width": size,
            "height": size,
            "responses": [
                {"identifier": "default", "format": {"type": "image/tiff"}}
            ],
        },
        "evalscript": EVALSCRIPT,
    }
    response = requests.post(
        PROCESS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=180,
    )
    if not response.ok:
        raise RuntimeError(f"Process API error {response.status_code}: {response.text[:500]}")

    image = tifffile.imread(io.BytesIO(response.content))
    # tifffile returns (H, W, bands); move bands first.
    if image.ndim == 3 and image.shape[2] == 5:
        image = np.moveaxis(image, 2, 0)
    return image.astype(np.float32)


def credentials_from_env() -> tuple[str, str]:
    client_id = os.environ.get("SH_CLIENT_ID")
    client_secret = os.environ.get("SH_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit(
            "Set SH_CLIENT_ID and SH_CLIENT_SECRET (see tools/sdb/.env.example)."
        )
    return client_id, client_secret
