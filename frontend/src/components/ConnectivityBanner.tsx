import { es } from '../i18n/es';
import { useConnectivity } from '../sync/useConnectivity';

// Pure presentation of the connectivity state driven by connectivityMonitor; it never triggers
// sync itself (that is syncQueue's job), it only reflects the state the user needs to see.
export function ConnectivityBanner() {
  const isOnline = useConnectivity();
  return (
    <div
      role="status"
      data-testid="connectivity-banner"
      data-status={isOnline ? 'online' : 'offline'}
      className={`connectivity-banner ${isOnline ? 'is-online' : 'is-offline'}`}
    >
      {isOnline ? es.connectivity.online : es.connectivity.offline}
    </div>
  );
}
