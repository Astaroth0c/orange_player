import type { MediaItem } from './domain'

export function parseM3uAsync(text: string, sourceId: string): Promise<MediaItem[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parse-m3u.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ items?: MediaItem[]; error?: string }>) => {
      worker.terminate()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.items || [])
    }
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Falha ao processar a lista.')) }
    worker.postMessage({ text, sourceId })
  })
}
