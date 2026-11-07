import type { SaveStore } from './persistence.ts';

const DB_NAME = 'gachapuff';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'player';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
}

/** Opens the IndexedDB-backed store. Rejects when IndexedDB is unusable. */
export async function createIndexedDbStore(): Promise<SaveStore> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB not supported');
  const db = await openDb();
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    kind: 'indexeddb',
    load: () => request(tx('readonly').get(KEY)),
    save: async (state) => {
      await request(tx('readwrite').put(state, KEY));
    },
    clear: async () => {
      await request(tx('readwrite').delete(KEY));
    },
  };
}
