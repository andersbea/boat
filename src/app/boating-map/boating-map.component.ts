import { Component, OnInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-boating-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './boating-map.component.html',
  styleUrls: ['./boating-map.component.css'],
})
export class BoatingMapComponent implements OnInit, OnDestroy {
  private map: L.Map | undefined;
  private userMarker: L.Marker | undefined;
  private locationWatchId: number | undefined;
  followMode: boolean = false;

  ngOnInit(): void {
    // initMap() initialises the map asynchronously (it waits for geolocation)
    // and wires up the layers/handlers itself once the map exists, so we must
    // not touch this.map here while it is still undefined.
    this.initMap();
  }

  ngOnDestroy(): void {
    this.stopFollowingUser();
  }

  private initMap(): void {
    if (navigator.geolocation) {
      // Attempt to get the user's current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Initialize the map with the user's current location
          this.map = L.map('map', {
            center: [lat, lng],
            zoom: 13, // Start with a more zoomed-in level when user's location is found
          });

          // Add a marker to indicate user's current location
          this.userMarker = L.marker([lat, lng])
            .addTo(this.map)
            .bindPopup('You are here')
            .openPopup();

          // Add base and overlay layers
          this.addBaseAndOverlayLayers();
        },
        (error) => {
          console.error(
            'Could not get user position, using default location:',
            error
          );
          // Fall back to default location if geolocation fails
          this.initializeMapWithDefaultLocation();
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      // If geolocation is not supported, initialize with default location
      this.initializeMapWithDefaultLocation();
    }
  }

  private initializeMapWithDefaultLocation(): void {
    // Initialize the map with a default location (Stockholm, Sweden)
    this.map = L.map('map', {
      center: [59.3293, 18.0686],
      zoom: 10,
    });

    // Add base and overlay layers
    this.addBaseAndOverlayLayers();
  }

  private addBaseAndOverlayLayers(): void {
    if (!this.map) {
      return;
    }

    // EMODnet Bathymetry is a free, OGC-standard WMS covering all European
    // seas (including the Baltic / Swedish archipelago) under an open licence.
    // It supplies the depth shading and depth contours that reveal shoals and
    // shallow ground that a plain street map cannot show.
    const emodnetWmsUrl = 'https://ows.emodnet-bathymetry.eu/wms';
    const emodnetAttribution =
      '&copy; <a href="https://emodnet.ec.europa.eu/en/bathymetry">EMODnet Bathymetry</a>';

    // --- Base layers (pick one) ---

    // Plain street/land base.
    const openStreetMapLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    );

    // Depth-shaded nautical base: atlas-style colouring where shallow water is
    // clearly distinguished from deep water, with land drawn in.
    const emodnetDepthBase = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:mean_atlas_land',
      format: 'image/png',
      transparent: false,
      version: '1.3.0',
      attribution: emodnetAttribution,
    });

    // --- Overlay layers ---

    // OpenSeaMap seamarks: rocks, wrecks, obstructions, buoys, beacons, etc.
    // (rendered from the OpenStreetMap seamark:* tagging scheme).
    const seaMarkLayer = L.tileLayer(
      'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors',
        maxZoom: 18,
      }
    );

    // Numbered depth contours from EMODnet, drawn transparently on top of the
    // chosen base so you can read the depth of the water you are crossing.
    const depthContourLayer = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:contours',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: emodnetAttribution,
    });

    // Multi-colour depth shading as a transparent overlay, so it can be laid on
    // top of the OpenStreetMap base instead of replacing it.
    const depthShadingLayer = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:mean_multicolour',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: emodnetAttribution,
    });

    // Default view: street base + seamarks (familiar) plus depth contours so
    // shallow ground and dangers are visible out of the box.
    openStreetMapLayer.addTo(this.map);
    seaMarkLayer.addTo(this.map);
    depthContourLayer.addTo(this.map);

    const baseMaps: L.Control.LayersObject = {
      OpenStreetMap: openStreetMapLayer,
      'Sea depth (EMODnet)': emodnetDepthBase,
    };

    const overlayMaps: L.Control.LayersObject = {
      'Nautical markers (rocks, wrecks)': seaMarkLayer,
      'Depth contours': depthContourLayer,
      'Depth shading': depthShadingLayer,
    };

    // Layer switcher so the user can toggle bases and overlays.
    L.control.layers(baseMaps, overlayMaps).addTo(this.map);

    // The map now exists, so it is safe to attach the move handlers.
    this.setupMapEventHandlers();
  }

  private setupMapEventHandlers(): void {
    this.map?.on('movestart', () => {
      // If the user manually starts moving the map, stop following mode
      if (this.followMode) {
        this.stopFollowingUser();
      }
    });
  }

  toggleFollowMode(): void {
    if (this.followMode) {
      // If currently following, stop
      this.stopFollowingUser();
    } else {
      // Start following
      this.startFollowingUser();
    }
  }

  private startFollowingUser(): void {
    if (navigator.geolocation && this.map) {
      this.followMode = true;

      // Start watching the user's location
      this.locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Update marker position or create it if it doesn't exist
          if (this.userMarker) {
            this.userMarker.setLatLng([lat, lng]);
          } else {
            this.userMarker = L.marker([lat, lng])
              .addTo(this.map!)
              .bindPopup('You are here');
          }

          // Center the map on the user's new location if follow mode is enabled
          if (this.followMode) {
            this.map!.setView([lat, lng], this.map!.getZoom());
          }
        },
        (error) => {
          console.error('Error watching position:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
    }
  }

  private stopFollowingUser(): void {
    this.followMode = false;
    if (this.locationWatchId) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = undefined;
    }
  }
}
