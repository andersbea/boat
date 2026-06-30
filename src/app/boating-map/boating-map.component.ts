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
            attributionControl: false, // Private use: keep the chart clean
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
      attributionControl: false, // Private use: keep the chart clean
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

    // --- Base layers (pick one) ---
    // This is a boating app, so land is intentionally de-emphasised: the
    // default base is a light, muted basemap where the water reads clearly and
    // the land recedes into the background.

    // Muted "sea-focused" base (CARTO Positron): light land, clean water.
    const seaBaseLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    );

    // Full-detail street/land base, kept available as an option.
    const openStreetMapLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19 }
    );

    // Depth-shaded nautical base: atlas-style colouring where shallow water is
    // clearly distinguished from deep water.
    const emodnetDepthBase = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:mean_atlas_land',
      format: 'image/png',
      transparent: false,
      version: '1.3.0',
    });

    // --- Overlay layers ---

    // OpenSeaMap seamarks: rocks, wrecks, obstructions, buoys, beacons, etc.
    // (rendered from the OpenStreetMap seamark:* tagging scheme).
    const seaMarkLayer = L.tileLayer(
      'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
      { maxZoom: 18 }
    );

    // Numbered depth contours from EMODnet, drawn transparently on top of the
    // chosen base so you can read the depth of the water you are crossing.
    const depthContourLayer = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:contours',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
    });

    // Multi-colour depth shading as a transparent overlay. EMODnet's grid is
    // coarse (~115 m), so it looks blocky when zoomed right in; it is therefore
    // an opt-in overlay rather than on by default, handy for a quick read of
    // where the shallow water lies when planning a passage.
    const depthShadingLayer = L.tileLayer.wms(emodnetWmsUrl, {
      layers: 'emodnet:mean_multicolour',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: 0.6,
    });

    // Default view: muted sea base (land de-emphasised) + seamarks + depth
    // contours, so the water, the dangers and the depths are the focus while
    // the chart stays clean.
    seaBaseLayer.addTo(this.map);
    seaMarkLayer.addTo(this.map);
    depthContourLayer.addTo(this.map);

    const baseMaps: L.Control.LayersObject = {
      'Sea (light)': seaBaseLayer,
      'Sea depth (EMODnet)': emodnetDepthBase,
      OpenStreetMap: openStreetMapLayer,
    };

    const overlayMaps: L.Control.LayersObject = {
      'Nautical markers (rocks, wrecks)': seaMarkLayer,
      'Depth contours': depthContourLayer,
      'Depth shading': depthShadingLayer,
    };

    // Layer switcher so the user can toggle bases and overlays.
    L.control.layers(baseMaps, overlayMaps).addTo(this.map);

    // Collapsible attribution: a small "i" button that toggles the data
    // credits. This keeps the chart clean while still crediting the sources,
    // which the OpenStreetMap / OpenSeaMap / EMODnet / CARTO licences require.
    this.addAttributionMenu();

    // The map now exists, so it is safe to attach the move handlers.
    this.setupMapEventHandlers();
  }

  private addAttributionMenu(): void {
    if (!this.map) {
      return;
    }

    const AttributionMenu = L.Control.extend({
      options: { position: 'bottomleft' as L.ControlPosition },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-control attribution-menu'
        );

        const button = L.DomUtil.create(
          'a',
          'attribution-menu__button',
          container
        );
        button.href = '#';
        button.title = 'Map data sources';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Map data sources');
        button.textContent = 'i';

        const panel = L.DomUtil.create(
          'div',
          'attribution-menu__panel',
          container
        );
        panel.innerHTML = [
          'Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
          'Nautical marks &copy; <a href="https://www.openseamap.org/" target="_blank" rel="noopener">OpenSeaMap</a>',
          'Depths &copy; <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a>',
          'Basemap &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
        ].join('<br>');

        L.DomEvent.on(button, 'click', (event) => {
          L.DomEvent.preventDefault(event);
          container.classList.toggle('attribution-menu--open');
        });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
      },
    });

    this.map.addControl(new AttributionMenu());
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
