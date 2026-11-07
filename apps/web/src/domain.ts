import { parseM3uAsync } from './source-worker'

declare global { interface Window { OrangeDesktop?: { fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>; mediaUrl(url: string): Promise<string> }; OrangePlayer?: { play(url: string, key: string, parentKey: string): void; stop(): void; requestText(url: string, id: string): void }; onOrangeFetchResult?: (id: string, status: number, text: string) => void } }

async function fetchSource(url: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; text: string }> {
  if (window.OrangeDesktop) return window.OrangeDesktop.fetchText(url)
  if (window.OrangePlayer) return new Promise((resolve, reject) => {
    const id = crypto.randomUUID(), timeout = window.setTimeout(() => { delete pendingAndroidFetches[id]; reject(new Error('Tempo limite ao consultar a fonte.')) }, 30_000)
    pendingAndroidFetches[id] = (status, text) => { window.clearTimeout(timeout); delete pendingAndroidFetches[id]; resolve({ ok: status >= 200 && status < 300, status, text }) }
    window.OrangePlayer!.requestText(url, id)
  })
  const response = await fetch(url, { signal })
  return { ok: response.ok, status: response.status, text: await response.text() }
}
const pendingAndroidFetches: Record<string, (status: number, text: string) => void> = {}
if (typeof window !== 'undefined' && window.OrangePlayer) window.onOrangeFetchResult = (id, status, text) => pendingAndroidFetches[id]?.(status, text)

export type MediaKind = 'live' | 'movie' | 'series' | 'episode'

export type Episode = {
  id: string
  title: string
  url: string
  season: number
  episode: number
  duration?: number
  progress?: number
}

export type MediaItem = {
  id: string
  sourceId: string
  kind: MediaKind
  title: string
  url: string
  poster?: string
  backdrop?: string
  description?: string
  category?: string
  year?: string
  duration?: number
  rating?: string
  seriesId?: string
  season?: number
  episode?: number
  externalId?: string
  episodes?: Episode[]
  watched?: boolean
}

export type Source = {
  id: string
  name: string
  type: 'xtream' | 'm3u'
  server: string
  username?: string
  secret: string
  createdAt: number
}
export type StoredSource = Omit<Source, 'secret'> & { secret: { iv: number[]; ciphertext: number[] } }

export type XtreamInput = { server: string; username: string; password: string }
export type EpgProgram = { title: string; description: string; start: number; end: number }

export function stableId(value: string): string {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

function extInfAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1].toLowerCase()] = match[2]
  return attrs
}

function classifyM3u(title: string, group: string, url: string): MediaKind {
  const haystack = `${title} ${group}`.toLocaleLowerCase()
  if (/series|série|season|temporada|epis[oó]dio|\bs\d{1,2}e\d{1,2}\b/.test(haystack)) return 'series'
  if (/movie|filme|cinema|vod/.test(haystack) || /\.(mp4|mkv|avi|mov)(\?|$)/i.test(url)) return 'movie'
  return 'live'
}

export function parseM3u(text: string, sourceId: string): MediaItem[] {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('O arquivo não tem um cabeçalho M3U válido.')
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const items: MediaItem[] = []
  let meta = ''
  for (const raw of rows) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF:')) { meta = line; continue }
    if (line.startsWith('#') || !meta) continue
    let url: URL
    try { url = new URL(line) } catch { meta = ''; continue }
    if (!['http:', 'https:'].includes(url.protocol)) { meta = ''; continue }
    const attrs = extInfAttributes(meta)
    const title = meta.slice(meta.lastIndexOf(',') + 1).trim() || attrs['tvg-name'] || 'Sem título'
    const category = attrs['group-title'] || 'Sem categoria'
    const kind = classifyM3u(title, category, line)
    const idKey = attrs['tvg-id'] || `${kind}|${category}|${title}`
    items.push({
      id: stableId(`${sourceId}|${idKey}`), sourceId, kind, title, url: line,
      poster: attrs['tvg-logo'] || undefined, category, externalId: attrs['tvg-id'] || undefined,
    })
    meta = ''
  }
  const grouped = new Map<string, MediaItem>()
  const standalone: MediaItem[] = []
  for (const item of items) {
    if (item.kind !== 'series') { standalone.push(item); continue }
    const match = item.title.match(/\bS(\d{1,2})[ ._-]*E(\d{1,2})\b|\b(\d{1,2})[xX](\d{1,2})\b|\b(?:temporada|temp\.?)\s*(\d{1,2})\s*[ .,:-]*(?:epis[oó]dio|ep\.?)\s*(\d{1,2})\b/i)
    if (!match) { standalone.push(item); continue }
    const seasonNumber = Number(match[1] || match[3] || match[5]), episodeNumber = Number(match[2] || match[4] || match[6])
    const seriesName = item.title.slice(0, match.index).replace(/[ ._:-]+$/, '').replace(/[._-]+/g, ' ').trim() || item.title
    const seriesId = stableId(`${sourceId}|series|${item.category}|${seriesName}`)
    const series = grouped.get(seriesId) || {
      ...item, id: seriesId, title: seriesName, kind: 'series' as const,
      url: item.url, episodes: [],
    }
    series.episodes!.push({ id: item.id, title: item.title, url: item.url, season: seasonNumber, episode: episodeNumber })
    grouped.set(seriesId, series)
  }
  for (const series of grouped.values()) series.episodes!.sort((a, b) => a.season - b.season || a.episode - b.episode)
  return [...standalone, ...grouped.values()]
}

export function normalizeServer(server: string): string {
  const value = server.trim().replace(/\/+$/, '')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Informe um endereço de servidor válido, incluindo http:// ou https://.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Use um endereço HTTP(S) sem credenciais embutidas.')
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

async function xtreamRequest<T>(input: XtreamInput, action: string, params: Record<string, string> = {}): Promise<T> {
  const server = normalizeServer(input.server)
  const query = new URLSearchParams({ username: input.username, password: input.password, action, ...params })
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetchSource(`${server}/player_api.php?${query}`, controller.signal)
    if (!response.ok) throw new Error(`Servidor respondeu ${response.status}.`)
    const body = JSON.parse(response.text) as T | { user_info?: { auth?: number; status?: string } }
    const account = body as { user_info?: { auth?: number; status?: string } }
    if (account.user_info?.auth === 0) throw new Error('Usuário ou senha inválidos.')
    return body as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('O servidor demorou para responder (20 s).')
    throw error
  } finally { window.clearTimeout(timeout) }
}

type XtreamCategory = { category_id: string; category_name: string }
type XtreamStream = { stream_id: number; name: string; stream_icon?: string; cover?: string; plot?: string; category_id?: string; year?: string; rating?: string; episode_run_time?: string; container_extension?: string }

function xtreamVodUrl(input: XtreamInput, type: 'movie' | 'series', id: number, extension = 'mp4') {
  const server = normalizeServer(input.server)
  const path = type === 'movie' ? 'movie' : 'series'
  return `${server}/${path}/${encodeURIComponent(input.username)}/${encodeURIComponent(input.password)}/${id}.${extension}`
}

export async function loadXtreamCatalog(input: XtreamInput, sourceId: string): Promise<MediaItem[]> {
  await xtreamRequest(input, '')
  const [liveCats, live, movieCats, movies, seriesCats, series] = await Promise.all([
    xtreamRequest<XtreamCategory[]>(input, 'get_live_categories'), xtreamRequest<XtreamStream[]>(input, 'get_live_streams'),
    xtreamRequest<XtreamCategory[]>(input, 'get_vod_categories'), xtreamRequest<XtreamStream[]>(input, 'get_vod_streams'),
    xtreamRequest<XtreamCategory[]>(input, 'get_series_categories'), xtreamRequest<XtreamStream[]>(input, 'get_series'),
  ])
  const liveMap = new Map(liveCats.map(x => [String(x.category_id), x.category_name]))
  const movieMap = new Map(movieCats.map(x => [String(x.category_id), x.category_name]))
  const seriesMap = new Map(seriesCats.map(x => [String(x.category_id), x.category_name]))
  const mapStream = (entry: XtreamStream, kind: 'live' | 'movie' | 'series', categories: Map<string, string>): MediaItem => {
    const id = String(entry.stream_id)
    return {
      id: stableId(`${sourceId}|${kind}|${id}`), sourceId, kind, title: entry.name,
      url: kind === 'live' ? `${normalizeServer(input.server)}/live/${encodeURIComponent(input.username)}/${encodeURIComponent(input.password)}/${id}.m3u8` : xtreamVodUrl(input, kind, entry.stream_id, entry.container_extension || 'mp4'),
      poster: entry.stream_icon || entry.cover, backdrop: entry.cover, description: entry.plot,
      category: categories.get(String(entry.category_id)) || 'Sem categoria', year: entry.year,
      rating: entry.rating, duration: Number(entry.episode_run_time) || undefined, externalId: id,
    }
  }
  const seriesItems = await Promise.all(series.map(async entry => {
    return { ...mapStream(entry, 'series', seriesMap), externalId: String(entry.stream_id) }
  }))
  return [
    ...live.map(x => mapStream(x, 'live', liveMap)),
    ...movies.map(x => mapStream(x, 'movie', movieMap)),
    ...seriesItems,
  ]
}

export async function loadXtreamEpisodes(input: XtreamInput, series: MediaItem): Promise<Episode[]> {
  if (!series.externalId) return series.episodes || []
  const info = await xtreamRequest<{ episodes?: Record<string, Array<{ id: number; title?: string; info?: { duration_secs?: number }; container_extension?: string }>> }>(input, 'get_series_info', { series_id: series.externalId })
  return Object.entries(info.episodes || {}).flatMap(([season, episodes]) => episodes.map((episode, index) => ({
    id: stableId(`${series.id}|${season}|${episode.id}`),
    title: episode.title || `Episódio ${index + 1}`,
    url: xtreamVodUrl(input, 'series', episode.id, episode.container_extension || 'mp4'),
    season: Number(season) || 1,
    episode: index + 1,
    duration: episode.info?.duration_secs,
  }))).sort((a, b) => a.season - b.season || a.episode - b.episode)
}

function decodeXtreamText(value = ''): string {
  try { return decodeURIComponent(escape(atob(value))) } catch { return value }
}

export async function loadXtreamEpg(input: XtreamInput, channel: MediaItem): Promise<EpgProgram[]> {
  if (!channel.externalId) return []
  const result = await xtreamRequest<{ epg_listings?: Array<{ title?: string; description?: string; start_timestamp?: string | number; stop_timestamp?: string | number; start?: string; end?: string }> }>(input, 'get_short_epg', { stream_id: channel.externalId, limit: '8' })
  return (result.epg_listings || []).map(row => {
    const start = Number(row.start_timestamp) || Date.parse(row.start || '') / 1000
    const end = Number(row.stop_timestamp) || Date.parse(row.end || '') / 1000
    return { title: decodeXtreamText(row.title), description: decodeXtreamText(row.description), start, end }
  }).filter(program => program.title && Number.isFinite(program.start) && Number.isFinite(program.end))
}

export async function loadM3u(url: string, sourceId: string): Promise<MediaItem[]> {
  let parsed: URL
  try { parsed = new URL(url.trim()) } catch { throw new Error('Informe uma URL M3U válida.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use uma URL HTTP(S).')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetchSource(parsed.href, controller.signal)
    if (!response.ok) throw new Error(`Não foi possível baixar a lista (${response.status}).`)
    return parseM3uAsync(response.text, sourceId)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('O download da lista excedeu 25 s.')
    throw error
  } finally { window.clearTimeout(timeout) }
}

export function mediaUrl(item: MediaItem | { url: string }): string { return item.url }
