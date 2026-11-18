import { probeBackendReachable } from './backendClient';

export type ConnectivityListener = (isOnline: boolean) => void;

const PROBE_TIMEOUT_MS = 4000;

// navigator.onLine is known to report false positives (captive portals, link-local-only
// connections) per research.md, so the browser 'online' event is only a trigger to re-probe
// the backend, never trusted by itself to mean "safe to sync".
export class ConnectivityMonitor {
  private listeners = new Set<ConnectivityListener>();
  private isOnline = false;
  private checking = false;

  constructor() {
    window.addEventListener('online', () => void this.recheck());
    window.addEventListener('offline', () => this.setOnline(false));
    void this.recheck();
  }

  private setOnline(value: boolean): void {
    if (value !== this.isOnline) {
      this.isOnline = value;
      this.listeners.forEach((listener) => listener(value));
    }
  }

  // Avoids overlapping probes if 'online' fires repeatedly in a short window.
  async recheck(): Promise<boolean> {
    if (this.checking) return this.isOnline;
    this.checking = true;
    try {
      if (!navigator.onLine) {
        this.setOnline(false);
        return false;
      }
      const reachable = await probeBackendReachable(PROBE_TIMEOUT_MS);
      this.setOnline(reachable);
      return reachable;
    } finally {
      this.checking = false;
    }
  }

  // Calls the listener immediately with the current state, then on every change.
  subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    listener(this.isOnline);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): boolean {
    return this.isOnline;
  }
}

export const connectivityMonitor = new ConnectivityMonitor();
