import { openDB } from 'idb'
import type { MediaItem, StoredSource } from './domain'

export type ProgressRow = { key: string; position: number; duration: number; completed: boolean; updatedAt: number }

const dbPromise = openDB('orange-player', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('sources', { keyPath: 'id' })
      db.createObjectStore('catalogs', { keyPath: 'sourceId' })
      db.createObjectStore('favorites', { keyPath: 'key' })
      db.createObjectStore('progress', { keyPath: 'key' })
      db.createObjectStore('settings')
    }
    if (oldVersion < 2) db.createObjectStore('catalogChunks', { keyPath: ['sourceId', 'generation', 'chunk'] })
  },
})

export async function getSources(): Promise<StoredSource[]> { return (await dbPromise).getAll('sources') }
export async function saveSource(source: StoredSource): Promise<void> { await (await dbPromise).put('sources', source) }
export async function removeSource(id: string): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['sources', 'catalogs', 'catalogChunks', 'favorites', 'progress', 'settings'], 'readwrite')
  const favorites = tx.objectStore('favorites'), progress = tx.objectStore('progress'), settings = tx.objectStore('settings'), catalogChunks = tx.objectStore('catalogChunks')
  const [favoriteKeys, progressKeys, settingKeys, catalogKeys] = await Promise.all([favorites.getAllKeys(), progress.getAllKeys(), settings.getAllKeys(), catalogChunks.getAllKeys()])
  await Promise.all([
    tx.objectStore('sources').delete(id), tx.objectStore('catalogs').delete(id),
    ...catalogKeys.filter(key => Array.isArray(key) && key[0] === id).map(key => catalogChunks.delete(key)),
    ...favoriteKeys.filter(key => String(key).startsWith(`${id}:`)).map(key => favorites.delete(key)),
    ...progressKeys.filter(key => String(key).startsWith(`${id}:`)).map(key => progress.delete(key)),
    ...settingKeys.filter(key => String(key).startsWith(`episodes:${id}:`)).map(key => settings.delete(key)),
    tx.done,
  ])
}
export async function getCatalog(sourceId: string): Promise<MediaItem[]> {
  const db = await dbPromise, catalog = await db.get('catalogs', sourceId)
  if (catalog?.items) return catalog.items as MediaItem[]
  if (!catalog?.generation) return []
  const range = IDBKeyRange.bound([sourceId, catalog.generation, 0], [sourceId, catalog.generation, Number.MAX_SAFE_INTEGER])
  return db.getAll('catalogChunks', range).then(rows => rows.flatMap(row => row.items as MediaItem[]))
}
export async function saveCatalog(sourceId: string, items: MediaItem[]): Promise<void> {
  const db = await dbPromise, previous = await db.get('catalogs', sourceId), generation = crypto.randomUUID()
  let written = 0
  try {
    for (let offset = 0, chunk = 0; offset < items.length; offset += 1000, chunk++) {
      await db.put('catalogChunks', { sourceId, generation, chunk, items: items.slice(offset, offset + 1000) })
      written++
    }
    await db.put('catalogs', { sourceId, generation, count: items.length })
  } catch (error) {
    const tx = db.transaction('catalogChunks', 'readwrite')
    await Promise.all([...Array.from({ length: written }, (_, chunk) => tx.store.delete([sourceId, generation, chunk])), tx.done])
    throw error
  }
  if (previous?.generation) {
    const range = IDBKeyRange.bound([sourceId, previous.generation, 0], [sourceId, previous.generation, Number.MAX_SAFE_INTEGER])
    const oldKeys = await db.getAllKeys('catalogChunks', range)
    const tx = db.transaction('catalogChunks', 'readwrite')
    await Promise.all([...oldKeys.map(key => tx.store.delete(key)), tx.done])
  }
}
export async function allCatalogs(): Promise<MediaItem[]> {
  const rows = await (await dbPromise).getAll('catalogs')
  return (await Promise.all(rows.map(row => getCatalog(row.sourceId)))).flat()
}
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
