// src/lib/offline.js - 独立离线存储与网络重试引擎
let idb = null;

export function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('b2b_offline_db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_orders')) {
        db.createObjectStore('offline_orders', { keyPath: 'client_temp_id' });
      }
    };
    req.onsuccess = (e) => {
      idb = e.target.result;
      resolve(idb);
    };
    req.onerror = (e) => reject(e);
  });
}

export async function cacheProducts(items) {
  if (!idb) return;
  const tx = idb.transaction('products', 'readwrite');
  items.forEach((it) => tx.objectStore('products').put(it));
}

export async function getLocalProducts() {
  if (!idb) return [];
  return new Promise((resolve) => {
    const req = idb.transaction('products', 'readonly').objectStore('products').getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

export async function saveOfflineOrder(payload) {
  if (!idb) return;
  const tx = idb.transaction('offline_orders', 'readwrite');
  payload.client_temp_id = 'OFF_' + Date.now();
  tx.objectStore('offline_orders').put(payload);
}

export async function getOfflineOrders() {
  if (!idb) return [];
  return new Promise((resolve) => {
    const req = idb.transaction('offline_orders', 'readonly').objectStore('offline_orders').getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

export async function clearOfflineOrder(tempId) {
  if (!idb) return;
  const tx = idb.transaction('offline_orders', 'readwrite');
  tx.objectStore('offline_orders').delete(tempId);
}
