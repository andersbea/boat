import { Injectable } from '@angular/core';
import type { Feature, FeatureCollection, Point } from 'geojson';

/**
 * The kinds of navigational danger / datapoint the app understands. These map
 * onto OpenStreetMap seamark tagging so points can later be pushed to OSM:
 *   rock_above     -> seamark:type=rock, water_level=always_dry
 *   rock_awash     -> seamark:type=rock, water_level=awash
 *   rock_submerged -> seamark:type=rock, water_level=covers (dangerous)
 *   obstruction    -> seamark:type=obstruction
 *   shoal          -> a shallow area
 *   sounding       -> a single depth measurement (seamark:type=sounding)
 */
export type DangerType =
  | 'rock_above'
  | 'rock_awash'
  | 'rock_submerged'
  | 'obstruction'
  | 'shoal'
  | 'sounding';

export type DangerSource = 'manual' | 'imagery' | 'sensor' | 'osm';

export interface DangerProperties {
  type: DangerType;
  /** Depth in metres at chart datum, when known. */
  depth?: number | null;
  name?: string;
  /** Where the point came from, so imagery/sensor candidates can be verified. */
  source: DangerSource;
  /** Whether a human has confirmed this point (gates OSM upload). */
  verified?: boolean;
  note?: string;
  createdAt?: string;
}

export type DangerFeature = Feature<Point, DangerProperties>;
export type DangerCollection = FeatureCollection<Point, DangerProperties>;

const STORAGE_KEY = 'boat_dangers_v1';

/**
 * Owns the danger datapoints. Curated points ship in /dangers.geojson; points
 * the user adds in the browser are kept in localStorage and merged on top, so
 * the app works on static hosting (GitHub Pages) with no backend. Export
 * produces a single GeoJSON file to commit back to the repo or upload to OSM.
 */
@Injectable({ providedIn: 'root' })
export class DangerService {
  private curated: DangerFeature[] = [];
  private userAdded: DangerFeature[] = this.loadUserAdded();

  /** Load the curated datapoints that ship with the app. */
  async loadCurated(): Promise<void> {
    try {
      const response = await fetch('dangers.geojson', { cache: 'no-cache' });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as DangerCollection;
      this.curated = (data.features ?? []).filter(
        (feature) => feature.geometry?.type === 'Point'
      );
    } catch {
      // No curated file yet (or offline) — start from whatever the user has.
      this.curated = [];
    }
  }

  /** All datapoints: curated plus the user's local additions. */
  collection(): DangerCollection {
    return {
      type: 'FeatureCollection',
      features: [...this.curated, ...this.userAdded],
    };
  }

  /** Add a user point at a location, returning the created feature. */
  add(
    lat: number,
    lng: number,
    properties: Omit<DangerProperties, 'createdAt'>
  ): DangerFeature {
    const feature: DangerFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { ...properties, createdAt: new Date().toISOString() },
    };
    this.userAdded = [...this.userAdded, feature];
    this.persist();
    return feature;
  }

  /** Remove a user-added point (curated points are read-only here). */
  remove(feature: DangerFeature): void {
    this.userAdded = this.userAdded.filter((candidate) => candidate !== feature);
    this.persist();
  }

  /** True if the feature is one the user can edit/delete locally. */
  isUserAdded(feature: DangerFeature): boolean {
    return this.userAdded.includes(feature);
  }

  /** Trigger a download of the full collection as dangers.geojson. */
  export(): void {
    const blob = new Blob([JSON.stringify(this.collection(), null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dangers.geojson';
    link.click();
    URL.revokeObjectURL(url);
  }

  private loadUserAdded(): DangerFeature[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as DangerCollection;
      return parsed.features ?? [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    const collection: DangerCollection = {
      type: 'FeatureCollection',
      features: this.userAdded,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  }
}
