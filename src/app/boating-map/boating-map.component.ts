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
    this.initMap();
    this.addBaseAndOverlayLayers();
    this.setupMapEventHandlers();
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

    // Define OpenStreetMap as the base layer
    const openStreetMapLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      // {
      //   attribution:
      //     '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      // }
    );

    // Define OpenSeaMap layer for nautical markers
    const openSeaMapLayer = L.tileLayer(
      'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
      // {
      //   attribution:
      //     '&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors',
      // }
    );

    // Define bathymetry (depth contours) layer from OpenSeaMap
    // const depthContourLayer = L.tileLayer(
    //   'https://tiles.openseamap.org/bathymetry/{z}/{x}/{y}.png',
    //   // {
    //   //   attribution:
    //   //     '&copy; <a href="https://www.openseamap.org/">OpenSeaMap Bathymetry</a> contributors',
    //   // }
    // );

    // Add OpenStreetMap as the base layer
    openStreetMapLayer.addTo(this.map);

    // Define overlay layers
    const overlayMaps: L.Control.LayersObject = {
      'Nautical Markers': openSeaMapLayer,
      // 'Depth Contours': depthContourLayer,
    };

    // Add layer control to toggle overlays
    L.control.layers({}, overlayMaps).addTo(this.map);

    // Optionally, add one or both overlays initially
    openSeaMapLayer.addTo(this.map);
    // depthContourLayer.addTo(this.map);
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
