import { useSyncExternalStore } from 'react';
import { connectivityMonitor } from './connectivity';

// useSyncExternalStore is the idiomatic React way to subscribe to a store that lives outside
// React (connectivityMonitor), avoiding the tearing issues of a manual useEffect+useState pair.
export function useConnectivity(): boolean {
  return useSyncExternalStore(
    (callback) => connectivityMonitor.subscribe(() => callback()),
    () => connectivityMonitor.getStatus(),
  );
}
