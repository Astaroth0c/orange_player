import { parseM3u } from './domain'

self.onmessage = (event: MessageEvent<{ text: string; sourceId: string }>) => {
  try { self.postMessage({ items: parseM3u(event.data.text, event.data.sourceId) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Falha ao interpretar a lista.' }) }
}
