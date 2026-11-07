import { openDB } from 'idb'
import type { MediaItem, StoredSource } from './domain'

export type ProgressRow = { key: string; position: number; duration: number; completed: boolean; updatedAt: number }

const dbPromise = openDB('orange-player', 1, {
  upgrade(db) {
    db.createObjectStore('sources', { keyPath: 'id' })
    db.createObjectStore('catalogs', { keyPath: 'sourceId' })
    db.createObjectStore('favorites', { keyPath: 'key' })
    db.createObjectStore('progress', { keyPath: 'key' })
    db.createObjectStore('settings')
  },
})

export async function getSources(): Promise<StoredSource[]> { return (await dbPromise).getAll('sources') }
export async function saveSource(source: StoredSource): Promise<void> { await (await dbPromise).put('sources', source) }
export async function removeSource(id: string): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['sources', 'catalogs', 'favorites', 'progress'], 'readwrite')
  const favorites = tx.objectStore('favorites'), progress = tx.objectStore('progress')
  const [favoriteKeys, progressKeys] = await Promise.all([favorites.getAllKeys(), progress.getAllKeys()])
  await Promise.all([
    tx.objectStore('sources').delete(id), tx.objectStore('catalogs').delete(id),
    ...favoriteKeys.filter(key => String(key).startsWith(`${id}:`)).map(key => favorites.delete(key)),
    ...progressKeys.filter(key => String(key).startsWith(`${id}:`)).map(key => progress.delete(key)),
    tx.done,
  ])
}
export async function getCatalog(sourceId: string): Promise<MediaItem[]> { return (await dbPromise).get('catalogs', sourceId) || [] }
export async function saveCatalog(sourceId: string, items: MediaItem[]): Promise<void> { await (await dbPromise).put('catalogs', { sourceId, items }) }
export async function allCatalogs(): Promise<MediaItem[]> { return (await dbPromise).getAll('catalogs').then(rows => rows.flatMap(row => row.items as MediaItem[])) }
export async function getFavorites(): Promise<string[]> { return (await dbPromise).getAllKeys('favorites').then(keys => keys.map(String)) }
export async function setFavorite(key: string, enabled: boolean): Promise<void> { const db = await dbPromise; if (enabled) await db.put('favorites', { key }); else await db.delete('favorites', key) }
export async function getProgress(key: string): Promise<ProgressRow> { return (await dbPromise).get('progress', key).then(row => row || { key, position: 0, duration: 0, completed: false, updatedAt: 0 }) }
export async function getAllProgress(): Promise<ProgressRow[]> { return (await dbPromise).getAll('progress') }
export async function setProgress(key: string, position: number, duration: number): Promise<void> {
  const completed = duration > 0 && position / duration >= 0.9
  const db = await dbPromise
  await db.put('progress', { key, position: completed ? 0 : position, duration, completed, updatedAt: Date.now() })
}
export async function getSetting<T>(key: string): Promise<T | undefined> { return (await dbPromise).get('settings', key) }
export async function setSetting<T>(key: string, value: T): Promise<void> { await (await dbPromise).put('settings', value, key) }

export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 310_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptSecret(secret: string, key: CryptoKey): Promise<{ iv: number[]; ciphertext: number[] }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret))
  return { iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] }
}
export async function decryptSecret(value: { iv: number[]; ciphertext: number[] }, key: CryptoKey): Promise<string> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.iv) }, key, new Uint8Array(value.ciphertext))
  return new TextDecoder().decode(bytes)
}
