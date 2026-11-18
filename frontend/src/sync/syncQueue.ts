import { db } from '../db/schema';
import type { LocalPurchaseDocument } from '../db/types';
import { BackendApiError, createOrRecoverPurchaseOrder } from './backendClient';
import { connectivityMonitor } from './connectivity';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 15000;
const POLL_INTERVAL_MS = 2000;

interface RetryState {
  attempts: number;
  nextRetryAt: number;
}

// Per-document backoff state, kept in memory only (never persisted): it only needs to survive
// for the lifetime of this tab's queue processor, and losing it on reload just means the next
// retry happens immediately instead of waiting out the backoff, which is harmless.
const retryState = new Map<string, RetryState>();

function isDueForRetry(localId: string): boolean {
  const state = retryState.get(localId);
  return !state || Date.now() >= state.nextRetryAt;
}

function scheduleBackoff(localId: string): void {
  const attempts = (retryState.get(localId)?.attempts ?? 0) + 1;
  const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), RETRY_MAX_DELAY_MS);
  retryState.set(localId, { attempts, nextRetryAt: Date.now() + delay });
}

function clearBackoff(localId: string): void {
  retryState.delete(localId);
}

let isProcessing = false;

// Processes every pending/failed document independently (FR-005, data-model.md transitions):
// one document's rejection is caught and recorded without ever stopping the loop, so it can
// never block the rest of the queue.
export async function processQueueOnce(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const candidates = await db.localPurchaseDocuments
      .where('syncStatus')
      .anyOf('pending', 'failed')
      .toArray();
    for (const doc of candidates) {
      if (isDueForRetry(doc.localId)) {
        await syncDocument(doc);
      }
    }
  } finally {
    isProcessing = false;
  }
}

// Purchase receipts are out of scope for this sprint (Historia 4/5); only orders are synced.
async function syncDocument(doc: LocalPurchaseDocument): Promise<void> {
  if (doc.documentType !== 'purchase_order') return;

  await db.localPurchaseDocuments.update(doc.localId, { syncStatus: 'syncing' });
  try {
    const result = await createOrRecoverPurchaseOrder(doc);
    clearBackoff(doc.localId);
    await db.localPurchaseDocuments.update(doc.localId, {
      syncStatus: 'synced',
      erpnextName: result.erpnextName,
      erpnextStatus: result.status,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await handleSyncFailure(doc, error);
  }
}

// ERPNEXT_UNREACHABLE means the lost-response/network case (contracts/backend-api.md): the
// document goes back to 'pending' (not 'failed') so it keeps retrying automatically and the
// user never sees it as a dead end. Any other error is a real rejection from ERPNext.
async function handleSyncFailure(doc: LocalPurchaseDocument, error: unknown): Promise<void> {
  const message = error instanceof BackendApiError ? error.message : String(error);
  const isTransient = error instanceof BackendApiError && error.errorCode === 'ERPNEXT_UNREACHABLE';
  scheduleBackoff(doc.localId);
  await db.localPurchaseDocuments.update(doc.localId, {
    syncStatus: isTransient ? 'pending' : 'failed',
    errorMessage: message,
  });
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeConnectivity: (() => void) | null = null;

// Wires the queue to connectivity: fires once as soon as the connection is confirmed, then
// polls at a short interval while online to pick up newly created documents and
// backoff-scheduled retries without requiring the user to reload (SC-003: <10s to sync).
export function startSyncQueue(): () => void {
  unsubscribeConnectivity = connectivityMonitor.subscribe((isOnline) => {
    if (isOnline) {
      void processQueueOnce();
      if (!pollTimer) {
        pollTimer = setInterval(() => void processQueueOnce(), POLL_INTERVAL_MS);
      }
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  return () => {
    unsubscribeConnectivity?.();
    unsubscribeConnectivity = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

// Lets UI actions (e.g. creating an order while already online) nudge the queue immediately
// instead of waiting for the next poll tick.
export function triggerImmediateSync(): void {
  if (connectivityMonitor.getStatus()) {
    void processQueueOnce();
  }
}
