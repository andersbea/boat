import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type SignalKStatus = 'disconnected' | 'connecting' | 'connected';

/** A vessel (own ship or an AIS target) as tracked from the Signal K stream. */
export interface VesselState {
  /** Signal K context id, e.g. vessels.urn:mrn:signalk:uuid:... */
  id: string;
  mmsi?: string;
  name?: string;
  isSelf: boolean;
  latitude?: number;
  longitude?: number;
  /** Radians, true. */
  headingTrue?: number;
  /** Radians, true. */
  courseOverGround?: number;
  /** Metres per second. */
  speedOverGround?: number;
  /** Metres (own vessel depth sounder). */
  depth?: number;
  lastUpdate: number;
}

/**
 * Minimal Signal K streaming client. Connects to a Signal K server's WebSocket
 * delta stream and maintains live state for own vessel and AIS targets. This is
 * the integration spine: anything a Signal K server publishes (GPS, AIS, depth,
 * later radar/autopilot/sonar) arrives here as JSON deltas and can be rendered.
 *
 * Defaults to the public demo server so the app works with no hardware; point
 * `connect()` at a boat's own server (e.g. an OpenPlotter Raspberry Pi) to get
 * real own-vessel position and local AIS traffic.
 */
@Injectable({ providedIn: 'root' })
export class SignalKService {
  readonly vessels$ = new BehaviorSubject<VesselState[]>([]);
  readonly status$ = new BehaviorSubject<SignalKStatus>('disconnected');

  private socket?: WebSocket;
  private selfId?: string;
  private readonly vessels = new Map<string, VesselState>();

  connect(host = 'demo.signalk.org'): void {
    this.disconnect();
    this.status$.next('connecting');

    const socket = new WebSocket(
      `wss://${host}/signalk/v1/stream?subscribe=all`
    );
    this.socket = socket;
    socket.onopen = () => this.status$.next('connected');
    socket.onclose = () => this.status$.next('disconnected');
    socket.onerror = () => this.status$.next('disconnected');
    socket.onmessage = (event) => this.handleMessage(event.data);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = undefined;
    }
    this.status$.next('disconnected');
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    // The first frame is a "hello" identifying which context is us.
    if (message.self) {
      this.selfId = message.self;
      return;
    }
    if (!message.context || !Array.isArray(message.updates)) {
      return;
    }

    const context: string = message.context;
    if (!context.startsWith('vessels.')) {
      return; // ignore atons/aircraft for now
    }

    const isSelf = context === 'vessels.self' || context === this.selfId;
    const id = isSelf && this.selfId ? this.selfId : context;
    const vessel: VesselState = this.vessels.get(id) ?? {
      id,
      isSelf,
      lastUpdate: 0,
    };
    vessel.isSelf = isSelf;

    const mmsi = context.match(/mmsi:(\d+)/);
    if (mmsi) {
      vessel.mmsi = mmsi[1];
    }

    for (const update of message.updates) {
      for (const item of update.values ?? []) {
        this.applyValue(vessel, item.path, item.value);
      }
    }

    vessel.lastUpdate = Date.now();
    this.vessels.set(id, vessel);
    this.vessels$.next([...this.vessels.values()]);
  }

  private applyValue(vessel: VesselState, path: string, value: any): void {
    switch (path) {
      case 'navigation.position':
        if (value && typeof value.latitude === 'number') {
          vessel.latitude = value.latitude;
          vessel.longitude = value.longitude;
        }
        break;
      case 'navigation.headingTrue':
        vessel.headingTrue = value;
        break;
      case 'navigation.courseOverGroundTrue':
        vessel.courseOverGround = value;
        break;
      case 'navigation.speedOverGround':
        vessel.speedOverGround = value;
        break;
      case 'environment.depth.belowTransducer':
      case 'environment.depth.belowKeel':
      case 'environment.depth.belowSurface':
        vessel.depth = value;
        break;
      case 'name':
        if (typeof value === 'string') {
          vessel.name = value;
        }
        break;
      default:
        // Some servers send the vessel name as a bare delta with empty path.
        if (path === '' && value && typeof value.name === 'string') {
          vessel.name = value.name;
        }
        break;
    }
  }
}
