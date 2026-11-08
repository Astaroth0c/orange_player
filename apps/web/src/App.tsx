import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { Episode, EpgProgram, MediaItem, Source, StoredSource } from './domain'
import { loadM3u, loadXtreamCatalog, loadXtreamEpisodes, loadXtreamEpg, normalizeServer } from './domain'
import { parseM3uAsync } from './source-worker'
import { allCatalogs, decryptSecret, deriveVaultKey, encryptSecret, getAllProgress, getFavorites, getProgress, getSetting, getSources, removeSource as deleteStoredSource, saveCatalog, saveSource, setFavorite, setProgress, setSetting } from './storage'

type ResolvedSource = Omit<Source, 'secret'> & { secret: string }
type PlayState = { item: MediaItem; episode?: Episode; queue: Episode[]; index: number }
type ProgressRecord = { position: number; duration: number; completed?: boolean }
declare global { interface Window { OrangeDesktop?: { fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>; mediaUrl(url: string): Promise<string> }; OrangePlayer?: { play(url: string, key: string, parentKey: string): void; stop(): void; requestText(url: string, id: string): void }; onOrangeFetchResult?: (id: string, status: number, text: string) => void } }
const FAVORITE_KEY = (sourceId: string, itemId: string) => `${sourceId}:${itemId}`

function readableError(error: unknown) {
  if (error instanceof Error && /write blobs|ioerror|quota|storage/i.test(error.message)) return `O catálogo não coube no armazenamento local. Libere espaço em disco e tente novamente. (${error.message})`
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return 'Falha de rede. O servidor pode estar indisponível ou bloquear conexões do navegador (CORS).'
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), seconds = Math.floor(value % 60)
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function App() {
  const [vault, setVault] = useState<'loading' | 'create' | 'unlock' | 'ready'>('loading')
  const [vaultKey, setVaultKey] = useState<CryptoKey | undefined>(undefined)
  const [vaultError, setVaultError] = useState('')
  const [vaultBusy, setVaultBusy] = useState(false)
  const [sources, setSources] = useState<ResolvedSource[]>([])
  const [items, setItems] = useState<MediaItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [progress, setProgressState] = useState<Record<string, ProgressRecord>>({})
  const [page, setPage] = useState('Início')
  const [kind, setKind] = useState<'all' | 'live' | 'movie' | 'series'>('all')
  const [category, setCategory] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [expandedSection, setExpandedSection] = useState<'live' | 'movie' | 'series' | null>('live')
  const [search, setSearch] = useState('')
  const [selectedSource, setSelectedSource] = useState('all')
  const [selected, setSelected] = useState<MediaItem | undefined>(undefined)
  const [detailsEpisodes, setDetailsEpisodes] = useState<Episode[]>([])
  const [detailsEpg, setDetailsEpg] = useState<EpgProgram[]>([])
  const [epgNow, setEpgNow] = useState<number | null>(null)
  const [episodeBusy, setEpisodeBusy] = useState(false)
  const [play, setPlay] = useState<PlayState | undefined>(undefined)
  const [playbackError, setPlaybackError] = useState('')
  const [sourceModal, setSourceModal] = useState(false)
  const [autoplay, setAutoplay] = useState(true)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | undefined>(undefined)
  const autoTimer = useRef<number | undefined>(undefined)
  const progressTimer = useRef<number | undefined>(undefined)
  const [countdown, setCountdown] = useState(7)
  const [showNext, setShowNext] = useState(false)
  const [renderCount, setRenderCount] = useState(80)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [refreshingSource, setRefreshingSource] = useState('')
  const [subtitle, setSubtitle] = useState<{ url: string; name: string }>()
  const subtitleInput = useRef<HTMLInputElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const onEndedRef = useRef<() => void>(() => {})
  const persistProgressRef = useRef<(completed?: boolean) => Promise<void>>(async () => {})

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200) }

  useEffect(() => {
    void (async () => {
      const salt = await getSetting<number[]>('vaultSalt')
      setVault(salt ? 'unlock' : 'create')
      setAutoplay((await getSetting<boolean>('autoplay')) ?? true)
      const [all, savedFavorites] = await Promise.all([allCatalogs(), getFavorites()])
      setItems(all)
      setFavorites(savedFavorites)
      const rows = await getAllProgress()
      setProgressState(Object.fromEntries(rows.map(row => [row.key, row])))
    })().catch(() => notify('Não foi possível abrir o armazenamento local.'))
  }, [])

  async function unlockSources(key: CryptoKey) {
    const locked = await getSources()
    const open = await Promise.all(locked.map(async stored => {
      const secret = await decryptSecret(stored.secret, key)
      return { ...stored, secret } as ResolvedSource
    }))
    setSources(open)
    setVaultKey(key)
    setVault('ready')
  }

  async function createVault(passphrase: string, confirm: string) {
    if (passphrase.length < 10) throw new Error('Use uma senha do cofre com pelo menos 10 caracteres.')
    if (passphrase !== confirm) throw new Error('As duas senhas do cofre não conferem.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveVaultKey(passphrase, salt)
    await setSetting('vaultSalt', [...salt])
    await unlockSources(key)
  }

  async function unlockVault(passphrase: string) {
    const salt = await getSetting<number[]>('vaultSalt')
    if (!salt) throw new Error('Não foi possível localizar a configuração do cofre.')
    const key = await deriveVaultKey(passphrase, new Uint8Array(salt))
    await unlockSources(key)
  }

  async function saveNewSource(source: Source, catalog: MediaItem[]) {
    if (!vaultKey) throw new Error('Desbloqueie o cofre antes de adicionar uma fonte.')
    const secret = await encryptSecret(source.secret, vaultKey)
    const { secret: _secret, ...publicFields } = source
    const stored: StoredSource = { ...publicFields, secret }
    await saveSource(stored)
    await saveCatalog(source.id, catalog)
    setSources(current => [...current, source as ResolvedSource])
    setItems(current => [...current.filter(item => item.sourceId !== source.id), ...catalog])
  }

  async function refreshSource(source: ResolvedSource) {
    setRefreshingSource(source.id)
    try {
      const catalog = source.type === 'xtream'
        ? await loadXtreamCatalog({ server: source.server, username: source.username || '', password: source.secret }, source.id)
        : source.secret.startsWith('file:')
          ? await parseM3uAsync(source.secret.slice(5), source.id)
          : await loadM3u(source.secret, source.id)
      await saveCatalog(source.id, catalog)
      setItems(current => [...current.filter(item => item.sourceId !== source.id), ...catalog])
      notify(`${catalog.length.toLocaleString('pt-BR')} itens sincronizados.`)
    } finally { setRefreshingSource('') }
  }

  async function deleteSource(source: ResolvedSource) {
    if (!window.confirm(`Remover “${source.name}” e os dados locais dessa fonte?`)) return
    await deleteStoredSource(source.id)
    setSources(current => current.filter(item => item.id !== source.id))
    setItems(current => current.filter(item => item.sourceId !== source.id))
    setFavorites(current => current.filter(key => !key.startsWith(`${source.id}:`)))
    setProgressState(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${source.id}:`))))
    if (selectedSource === source.id) setSelectedSource('all')
    notify('Fonte e dados locais removidos.')
  }

  const visibleItems = useMemo(() => {
    let list = items
    if (selectedSource !== 'all') list = list.filter(item => item.sourceId === selectedSource)
    if (kind !== 'all') list = list.filter(item => item.kind === kind)
    if (category !== 'all') list = list.filter(item => item.category === category)
    if (favoritesOnly || page === 'Minha lista') list = list.filter(item => favorites.includes(FAVORITE_KEY(item.sourceId, item.id)))
    if (page === 'Continuar') list = list.filter(item => Boolean(progress[FAVORITE_KEY(item.sourceId, item.id)]?.position))
    if (search.trim()) {
      const query = search.toLocaleLowerCase()
      list = list.filter(item => `${item.title} ${item.category || ''} ${item.year || ''}`.toLocaleLowerCase().includes(query))
    }
    return list
  }, [items, selectedSource, kind, category, favoritesOnly, page, favorites, progress, search])

  const catchupChannels = useMemo(() => items.filter(item => item.kind === 'live' && item.archive && (selectedSource === 'all' || item.sourceId === selectedSource)), [items, selectedSource])
  const mediaNavs = useMemo(() => ([
    { key: 'live' as const, title: 'Canais', icon: '▣', categories: [...new Set(items.filter(item => item.kind === 'live').map(item => item.category || 'Sem categoria'))].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
    { key: 'movie' as const, title: 'Filmes', icon: '▰', categories: [...new Set(items.filter(item => item.kind === 'movie').map(item => item.category || 'Sem categoria'))].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
    { key: 'series' as const, title: 'Séries', icon: '▤', categories: [...new Set(items.filter(item => item.kind === 'series').map(item => item.category || 'Sem categoria'))].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
  ]), [items])

  function openMediaSection(section: 'live' | 'movie' | 'series', title: string, filter: { category?: string; sourceId?: string; favorites?: boolean } = {}) {
    setPage(title); setKind(section); setCategory(filter.category || 'all'); setSelectedSource(filter.sourceId || 'all'); setFavoritesOnly(Boolean(filter.favorites)); setRenderCount(80)
  }

  const visibleGroups = useMemo(() => {
    const groups = new Map<string, MediaItem[]>()
    for (const item of visibleItems.slice(0, renderCount)) {
      const heading = kind === 'all' ? `${item.kind === 'live' ? 'Canais' : item.kind === 'movie' ? 'Filmes' : 'Séries'} · ${item.category || 'Sem categoria'}` : item.category || 'Sem categoria'
      groups.set(heading, [...(groups.get(heading) || []), item])
    }
    return [...groups]
  }, [visibleItems, renderCount, kind])

  async function toggleFavorite(item: MediaItem) {
    const key = FAVORITE_KEY(item.sourceId, item.id), enabled = !favorites.includes(key)
    await setFavorite(key, enabled)
    setFavorites(current => enabled ? [...current, key] : current.filter(value => value !== key))
  }

  function closeDetails() {
    setSelected(undefined)
    window.setTimeout(() => lastFocus.current?.focus(), 0)
  }

  async function openDetails(item: MediaItem) {
    lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEpgNow(Date.now() / 1000)
    setSelected(item)
    setDetailsEpisodes(item.episodes || [])
    setDetailsEpg([])
    const source = sources.find(value => value.id === item.sourceId)
    if (item.kind === 'live' && source?.type === 'xtream') {
      setEpisodeBusy(true)
      try { setDetailsEpg(await loadXtreamEpg({ server: source.server, username: source.username || '', password: source.secret }, item)) }
      catch { notify('O guia de programação não está disponível para este canal.') }
      finally { setEpisodeBusy(false) }
    }
    if (item.kind === 'series' && item.externalId && source?.type === 'xtream') {
      {
        setEpisodeBusy(true)
        try {
          const cacheKey = `episodes:${item.sourceId}:${item.id}`
          const cached = item.episodes?.length ? item.episodes : await getSetting<Episode[]>(cacheKey)
          const episodes = cached?.length ? cached : await loadXtreamEpisodes({ server: source.server, username: source.username || '', password: source.secret }, item)
          setDetailsEpisodes(episodes)
          if (episodes.length && !cached) await setSetting(cacheKey, episodes)
        } catch (error) { notify(`Falha ao consultar episódios: ${readableError(error)}`) }
        finally { setEpisodeBusy(false) }
      }
    }
  }

  useEffect(() => {
    if (selected?.kind !== 'live') return
    const timer = window.setInterval(() => setEpgNow(Date.now() / 1000), 60_000)
    return () => window.clearInterval(timer)
  }, [selected?.id, selected?.kind])

  function startPlay(item: MediaItem, episode?: Episode, queue: Episode[] = []) {
    setSubtitle(undefined)
    const activeQueue = queue.length ? queue : item.episodes || []
    const resumeEpisode = activeQueue.find(value => progress[FAVORITE_KEY(item.sourceId, value.id)]?.position)
    const firstUnfinished = activeQueue.find(value => !progress[FAVORITE_KEY(item.sourceId, value.id)]?.completed)
    const selectedEpisode = episode || (item.kind === 'series' ? resumeEpisode || firstUnfinished || activeQueue[0] : undefined)
    const index = selectedEpisode ? Math.max(0, activeQueue.findIndex(value => value.id === selectedEpisode.id)) : 0
    setPlay({ item, episode: selectedEpisode, queue: activeQueue, index })
    setPlaybackError('')
    setSelected(undefined)
    if (window.OrangePlayer) window.OrangePlayer.play(selectedEpisode?.url || item.url, FAVORITE_KEY(item.sourceId, selectedEpisode?.id || item.id), FAVORITE_KEY(item.sourceId, item.id))
    setTimeout(() => videoRef.current?.play().catch(() => {}), 80)
  }

  const closePlayer = useCallback(() => {
    window.OrangePlayer?.stop()
    window.clearTimeout(autoTimer.current)
    window.clearInterval(progressTimer.current)
    hlsRef.current?.destroy(); hlsRef.current = undefined
    setPlay(undefined)
    setShowNext(false)
  }, [setShowNext])

  const playNext = useCallback(() => {
    if (!play) return
    const next = play.queue[play.index + 1]
    if (!next) { closePlayer(); return }
    window.clearTimeout(autoTimer.current)
    setShowNext(false)
    setPlay({ ...play, episode: next, index: play.index + 1 })
    setPlaybackError('')
    window.OrangePlayer?.play(next.url, FAVORITE_KEY(play.item.sourceId, next.id), FAVORITE_KEY(play.item.sourceId, play.item.id))
    setCountdown(7)
    setTimeout(() => videoRef.current?.play().catch(() => {}), 100)
  }, [play, closePlayer])

  async function onEnded() {
    if (!play || !play.episode) { await persistProgressRef.current(true); closePlayer(); return }
    await persistProgressRef.current(true)
    if (play.index + 1 >= play.queue.length) { closePlayer(); return }
    setCountdown(7); setShowNext(true)
  }

  useEffect(() => { onEndedRef.current = () => { void onEnded() } })

  const persistCurrentProgress = useCallback(async (completed = false) => {
    const video = videoRef.current
    if (!video || !play || !Number.isFinite(video.duration)) return
    const value = completed || video.currentTime / video.duration >= 0.9
    const position = value ? 0 : video.currentTime
    const key = FAVORITE_KEY(play.item.sourceId, play.episode?.id || play.item.id)
    const parentKey = FAVORITE_KEY(play.item.sourceId, play.item.id)
    await setProgress(key, completed ? video.duration : video.currentTime, video.duration)
    if (play.episode) await setProgress(parentKey, completed ? video.duration : video.currentTime, video.duration)
    const row = { position, duration: video.duration, completed: value }
    setProgressState(current => ({ ...current, [key]: row, ...(play.episode ? { [parentKey]: row } : {}) }))
  }, [play])

  useEffect(() => { persistProgressRef.current = persistCurrentProgress }, [persistCurrentProgress])

  useEffect(() => {
    if (window.OrangePlayer) {
      const ended = () => onEndedRef.current()
      const playbackFailed = () => setPlaybackError('A TV não conseguiu abrir esse stream. Confira se a URL, o formato e as permissões da fonte funcionam em outro player.')
      const progressEvent = (event: Event) => {
        const row = (event as CustomEvent<{ key: string; parentKey: string; position: number; duration: number; ended: boolean }>).detail
        void setProgress(row.key, row.position, row.duration)
        if (row.parentKey !== row.key) void setProgress(row.parentKey, row.position, row.duration)
        setProgressState(current => ({ ...current, [row.key]: { position: row.ended ? 0 : row.position, duration: row.duration, completed: row.ended }, [row.parentKey]: { position: row.ended ? 0 : row.position, duration: row.duration, completed: row.ended } }))
      }
      window.addEventListener('orange-ended', ended); window.addEventListener('orange-progress', progressEvent); window.addEventListener('orange-playback-error', playbackFailed)
      return () => { window.removeEventListener('orange-ended', ended); window.removeEventListener('orange-progress', progressEvent); window.removeEventListener('orange-playback-error', playbackFailed) }
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!play || !video || window.OrangePlayer) return
    let disposed = false
    hlsRef.current?.destroy(); hlsRef.current = undefined
    const url = play.episode?.url || play.item.url
    const key = FAVORITE_KEY(play.item.sourceId, play.episode?.id || play.item.id)
    void (async () => {
      const playableUrl = window.OrangeDesktop ? await window.OrangeDesktop.mediaUrl(url) : url
      const requestPlay = () => { void video.play().then(() => setPlaybackError('')).catch(error => {
        if (disposed) return
        if (error instanceof DOMException && error.name === 'NotAllowedError') setPlaybackError('A reprodução automática foi bloqueada. Pressione “Tocar agora”.')
        else setPlaybackError('O navegador bloqueou a reprodução. Pressione “Tentar novamente” ou confira o formato do stream.')
      }) }
      if (/\.m3u8($|\?)/i.test(url) && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: HlsPlayer } = await import('hls.js')
        if (disposed) return
        if (HlsPlayer.isSupported()) {
          const hls = new HlsPlayer({ enableWorker: true, lowLatencyMode: play.item.kind === 'live', backBufferLength: 30 })
          hlsRef.current = hls
          hls.loadSource(playableUrl); hls.attachMedia(video)
          hls.on(HlsPlayer.Events.MANIFEST_PARSED, requestPlay)
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            const status = data.response?.code ? ` HTTP ${data.response.code}.` : ''
            setPlaybackError(`Falha HLS (${data.type}/${data.details}).${status} Confira a fonte, a rede e o formato.`)
          })
        } else { video.src = playableUrl; video.addEventListener('loadeddata', requestPlay, { once: true }) }
      } else {
        video.src = playableUrl
        video.addEventListener('loadeddata', requestPlay, { once: true })
      }
      const row = await getProgress(key)
      if (!disposed && row.position > 10) video.currentTime = row.position
      if (!disposed) progressTimer.current = window.setInterval(() => void persistCurrentProgress(), 15_000)
    })().catch(error => {
      if (disposed) return
      setPlaybackError(error instanceof Error ? `Falha ao preparar a reprodução: ${error.message}` : 'Falha ao preparar a reprodução. Confira a rede e tente novamente.')
    })
    return () => { disposed = true; window.clearInterval(progressTimer.current); hlsRef.current?.destroy(); hlsRef.current = undefined }
  }, [play, persistCurrentProgress])

  function retryPlayback() {
    setPlaybackError('')
    if (window.OrangePlayer && play) {
      window.OrangePlayer.play(play.episode?.url || play.item.url, FAVORITE_KEY(play.item.sourceId, play.episode?.id || play.item.id), FAVORITE_KEY(play.item.sourceId, play.item.id))
      return
    }
    if (hlsRef.current) hlsRef.current.startLoad(-1)
    const video = videoRef.current
    if (!hlsRef.current) video?.load()
    if (video) void video.play().then(() => setPlaybackError('')).catch(error => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') setPlaybackError('O Windows bloqueou o início automático. Pressione “Tocar agora” mais uma vez.')
      else setPlaybackError('O stream ainda não iniciou. Confira a conexão e o formato da fonte.')
    })
  }

  function describeVideoError(video: HTMLVideoElement) {
    const code = video.error?.code
    if (code === MediaError.MEDIA_ERR_NETWORK) return 'Erro de rede ao receber o stream. Confirme a conexão e se o servidor permite a reprodução no seu aparelho.'
    if (code === MediaError.MEDIA_ERR_DECODE) return 'O aparelho recebeu o stream, mas não conseguiu decodificar áudio/vídeo. O codec pode não ser compatível.'
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'Formato de stream não suportado por este aparelho ou extensão do endereço incorreta.'
    return video.error?.message || 'A reprodução foi interrompida. Tente novamente.'
  }

  useEffect(() => {
    if (!showNext) return
    if (!autoplay) return
    autoTimer.current = window.setTimeout(playNext, 7000)
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000)
    return () => { window.clearTimeout(autoTimer.current); window.clearInterval(timer) }
  }, [showNext, autoplay, playNext])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        if (play) closePlayer()
        else if (selected) setSelected(undefined)
        else if (sourceModal) setSourceModal(false)
      }
      if (play && (event.key === ' ' || event.key === 'Enter') && (event.target as HTMLElement).tagName !== 'BUTTON') {
        event.preventDefault(); const video = videoRef.current
        if (video) { if (video.paused) void video.play(); else video.pause() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, selected, sourceModal, closePlayer])

  const subtitleUrl = subtitle?.url
  useEffect(() => { if (!subtitleUrl) return; return () => URL.revokeObjectURL(subtitleUrl) }, [subtitleUrl])
  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <header className="topbar">
      <a className="brand" href="#home" onClick={event => { event.preventDefault(); setPage('Início'); setRenderCount(80); setKind('all') }}><span className="brand-icon">▶</span><span>ORANGE<span> PLAYER</span></span></a>
      <label className="search"><span>⌕</span><input aria-label="Buscar no catálogo" placeholder="Buscar canais, filmes e séries" value={search} onChange={event => { setSearch(event.target.value); setRenderCount(80) }} /></label>
      <div className="top-actions"><select aria-label="Fonte ativa" value={selectedSource} onChange={event => { setSelectedSource(event.target.value); setRenderCount(80) }}><option value="all">Todas as fontes</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button className="profile-button" title="Bloquear o cofre" onClick={() => { if (play) closePlayer(); setVault('unlock'); setVaultKey(undefined); setSources([]) }}>R</button></div>
    </header>
    <aside className="sidebar">
      <button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? '»' : '«'}</button>
      <span className="side-label">MENU PRINCIPAL</span>
      <button className={page === 'Início' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('Início'); setKind('all'); setCategory('all'); setSelectedSource('all'); setFavoritesOnly(false); setRenderCount(80) }}><span className="nav-icon">◈</span><span className="nav-label">Início</span></button>
      {mediaNavs.map(section => {
        const sectionItems = items.filter(item => item.kind === section.key)
        const sectionSources = sources.filter(source => sectionItems.some(item => item.sourceId === source.id))
        const expanded = expandedSection === section.key && !sidebarCollapsed
        return <div className="nav-group" key={section.key}>
          <button className={page === section.title ? 'nav-item active' : 'nav-item'} title={sidebarCollapsed ? section.title : undefined} aria-expanded={expanded} onClick={() => { openMediaSection(section.key, section.title); setExpandedSection(current => current === section.key ? null : section.key) }}><span className="nav-icon">{section.icon}</span><span className="nav-label">{section.title}</span><i className="nav-chevron">{expanded ? '⌄' : '›'}</i></button>
          {expanded && <div className="nav-submenu">
            <button onClick={() => openMediaSection(section.key, section.title)} className={category === 'all' && !favoritesOnly && selectedSource === 'all' ? 'selected' : ''}>Todos <small>{sectionItems.length.toLocaleString('pt-BR')}</small></button>
            <button onClick={() => openMediaSection(section.key, section.title, { favorites: true })} className={favoritesOnly ? 'selected' : ''}>Favoritos <small>{sectionItems.filter(item => favorites.includes(FAVORITE_KEY(item.sourceId, item.id))).length.toLocaleString('pt-BR')}</small></button>
            {section.categories.length > 0 && <span className="nav-submenu-label">CATEGORIAS</span>}
            {section.categories.map(value => <button key={value} title={value} onClick={() => openMediaSection(section.key, section.title, { category: value })} className={category === value ? 'selected' : ''}>{value}<small>{sectionItems.filter(item => (item.category || 'Sem categoria') === value).length.toLocaleString('pt-BR')}</small></button>)}
            {sectionSources.length > 0 && <span className="nav-submenu-label">FONTES</span>}
            {sectionSources.map(source => <button key={source.id} title={source.name} onClick={() => openMediaSection(section.key, section.title, { sourceId: source.id })} className={selectedSource === source.id ? 'selected' : ''}>{source.name}<small>{sectionItems.filter(item => item.sourceId === source.id).length.toLocaleString('pt-BR')}</small></button>)}
          </div>}
        </div>
      })}
      <button className={page === 'Catch Up' ? 'nav-item active' : 'nav-item'} title={sidebarCollapsed ? 'Catch Up' : undefined} onClick={() => { setPage('Catch Up'); setKind('live'); setCategory('all'); setSelectedSource('all'); setFavoritesOnly(false); setExpandedSection('live') }}><span className="nav-icon">↶</span><span className="nav-label">Catch Up</span></button>
      <button className={page === 'Continuar' ? 'nav-item active' : 'nav-item'} title={sidebarCollapsed ? 'Continuar' : undefined} onClick={() => { setPage('Continuar'); setKind('all'); setCategory('all'); setFavoritesOnly(false); setSelectedSource('all'); setRenderCount(80) }}><span className="nav-icon">◷</span><span className="nav-label">Continuar</span></button>
      <div className="sidebar-bottom"><span className="side-label">SUA BIBLIOTECA</span><button className="nav-item" onClick={() => setSourceModal(true)}><span className="nav-icon">＋</span><span className="nav-label">Adicionar fonte</span></button>{sources.map(source => <div key={source.id} className="source-entry" title={source.name}><span className="source-dot" /><span className="source-name">{source.name}</span><button disabled={refreshingSource === source.id} title={refreshingSource === source.id ? 'Sincronizando…' : 'Sincronizar fonte'} onClick={() => void refreshSource(source).catch(error => notify(readableError(error)))}>{refreshingSource === source.id ? '…' : '↻'}</button><button title="Remover fonte" onClick={() => void deleteSource(source)}>×</button></div>)}</div>
      <div className="sidebar-footer"><span className="online-dot" /><span className="sidebar-count">{items.length.toLocaleString('pt-BR')} itens disponíveis</span></div>
    </aside>
    <main className="main-content">
      {page === 'Catch Up' && <CatchUpGuide channels={catchupChannels} sources={sources} onPlay={(channel, program) => startPlay({ ...channel, title: `${channel.title} · ${program.title}`, url: program.archiveUrl! })} />}
      {page === 'Início' && <section className="welcome-hero"><div className="hero-art" /><div className="hero-copy"><span className="eyebrow"><i /> ORANGE GLASS · SEU UNIVERSO</span><h1>Boas histórias<br /><em>merecem um play.</em></h1><p>Seu catálogo, seus canais e sua próxima maratona em um só lugar.</p><div className="hero-actions"><button className="btn-primary" onClick={() => setSourceModal(true)}>＋ Adicionar fonte</button><button className="btn-ghost" onClick={() => { setPage('TV ao vivo'); setRenderCount(80); setKind('live') }}>▣ Ver TV ao vivo</button></div><div className="hero-stats"><span><b>{items.filter(item => item.kind === 'live').length}</b> canais</span><span><b>{items.filter(item => item.kind === 'movie').length}</b> filmes</span><span><b>{items.filter(item => item.kind === 'series').length}</b> séries</span></div></div><div className="hero-orbit" /><span className="hero-index">01 <i /> ORANGE PLAYER</span></section>}
      {page === 'Início' && <section className="section-block"><div className="section-title"><div><span className="eyebrow">RETOME DE ONDE PAROU</span><h2>Continue assistindo</h2></div><button className="link-button" onClick={() => { setPage('Continuar'); setRenderCount(80) }}>Ver tudo →</button></div><div className="continue-row">{items.filter(item => progress[FAVORITE_KEY(item.sourceId, item.id)]?.position).slice(0, 6).map(item => <MediaCard key={item.id} item={item} progress={progress[FAVORITE_KEY(item.sourceId, item.id)]?.position} onOpen={() => item.kind === 'series' ? startPlay(item) : item.kind === 'live' ? void openDetails(item) : startPlay(item)} onFavorite={() => void toggleFavorite(item)} favorite={favorites.includes(FAVORITE_KEY(item.sourceId, item.id))} />)}{!items.some(item => progress[FAVORITE_KEY(item.sourceId, item.id)]?.position) && <div className="empty-inline"><span>◷</span><b>Sua próxima sessão começa aqui</b><p>Quando você começar um filme ou episódio, ele aparecerá nesta área.</p></div>}</div></section>}
      <section hidden={page === 'Catch Up'} className="section-block catalog-block">
        <div className="section-title"><div><span className="eyebrow">{page === 'Início' ? 'DO SEU CATÁLOGO' : page.toLocaleUpperCase('pt-BR')}</span><h2>{page === 'Início' ? 'Explore o catálogo' : page}</h2></div><div className="catalog-controls"><select aria-label="Categoria" onChange={event => { setCategory(event.target.value); setRenderCount(80) }} value={category}><option value="all">Todas as categorias</option>{[...new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))].sort().map(value => <option key={value}>{value}</option>)}</select><div className="view-filters">{[['all', 'Tudo'], ['live', 'TV'], ['movie', 'Filmes'], ['series', 'Séries']].map(([value, label]) => <button key={value} className={kind === value ? 'selected' : ''} onClick={() => { setKind(value as typeof kind); setRenderCount(80) }}>{label}</button>)}</div></div></div>
        {visibleItems.length ? <>{visibleGroups.map(([heading, group]) => <section className="category-section" key={heading}><h3 className="category-heading">{heading}<span>{group.length}</span></h3><div className="media-grid">{group.map(item => <MediaCard key={item.id} item={item} progress={progress[FAVORITE_KEY(item.sourceId, item.id)]?.position} onOpen={() => item.kind === 'series' || item.kind === 'live' ? void openDetails(item) : startPlay(item)} onDetails={() => void openDetails(item)} onFavorite={() => void toggleFavorite(item)} favorite={favorites.includes(FAVORITE_KEY(item.sourceId, item.id))} />)}</div></section>)}{renderCount < visibleItems.length && <button className="load-more" onClick={() => setRenderCount(value => value + 80)}>Carregar mais {Math.min(80, visibleItems.length - renderCount)} itens</button>}</> : <div className="empty-state"><div className="empty-symbol">{items.length ? '⌕' : '＋'}</div><h3>{items.length ? 'Nada por aqui ainda' : 'Adicione sua primeira fonte'}</h3><p>{items.length ? 'Tente outro filtro ou atualize a fonte selecionada.' : 'Conecte uma lista M3U/M3U8 ou uma conta Xtream autorizada.'}</p><button className="btn-primary" onClick={() => items.length ? setKind('all') : setSourceModal(true)}>{items.length ? 'Limpar filtros' : 'Configurar fonte'}</button></div>}
      </section>
      <footer className="content-footer"><span className="brand-icon small">▶</span><span>ORANGE PLAYER</span><i /><span>O conteúdo e as fontes são fornecidos pelo usuário.</span><button onClick={() => setSourceModal(true)}>Gerenciar fontes</button></footer>
    </main>

    {vault !== 'ready' && vault !== 'loading' && <VaultDialog mode={vault} busy={vaultBusy} error={vaultError} onSubmit={async (pass, confirm) => { setVaultBusy(true); setVaultError(''); try { if (vault === 'create') await createVault(pass, confirm); else await unlockVault(pass) } catch { setVaultError(vault === 'unlock' ? 'Senha incorreta ou cofre inválido.' : 'Não foi possível criar o cofre.') } finally { setVaultBusy(false) } }} />}
    {sourceModal && <SourceDialog busy={busy} onClose={() => setSourceModal(false)} onSubmit={async form => {
      setBusy(true)
      try {
        const id = crypto.randomUUID()
        let source: Source, catalog: MediaItem[]
        if (form.type === 'xtream') {
          const server = normalizeServer(form.server)
          if (!form.username.trim() || !form.password) throw new Error('Informe usuário e senha.')
          const input = { server, username: form.username.trim(), password: form.password }
          catalog = await loadXtreamCatalog(input, id)
          source = { id, name: form.name || new URL(server).hostname, type: 'xtream', server, username: input.username, secret: form.password, createdAt: Date.now() }
        } else {
          const secret = form.file ? `file:${await form.file.text()}` : form.url.trim()
          catalog = form.file ? await parseM3uAsync(secret.slice(5), id) : await loadM3u(secret, id)
          if (!catalog.length) throw new Error('A lista foi lida, mas não contém canais, filmes ou séries reconhecíveis.')
          let server = 'arquivo local'
          if (!form.file) { const url = new URL(secret); server = url.origin }
          source = { id, name: form.name || (form.file?.name.replace(/\.m3u8?$/i, '') || new URL(secret).hostname), type: 'm3u', server, secret, createdAt: Date.now() }
        }
        await saveNewSource(source, catalog)
        setSourceModal(false); setSelectedSource(id); notify(`Fonte adicionada: ${catalog.length.toLocaleString('pt-BR')} itens.`)
      } catch (error) { notify(readableError(error)) }
      finally { setBusy(false) }
    }} />}
    {selected && <DetailsDialog key={selected.id} item={selected} episodes={detailsEpisodes} epg={detailsEpg} epgNow={epgNow || 0} busy={episodeBusy} progress={progress} favorite={favorites.includes(FAVORITE_KEY(selected.sourceId, selected.id))} canReloadEpisodes={sources.some(source => source.id === selected.sourceId && source.type === 'xtream')} onClose={closeDetails} onFavorite={() => void toggleFavorite(selected)} onReloadEpisodes={() => void openDetails(selected)} onPlay={() => { const resume = detailsEpisodes.find(episode => progress[FAVORITE_KEY(selected.sourceId, episode.id)]?.position); const firstUnfinished = detailsEpisodes.find(episode => !progress[FAVORITE_KEY(selected.sourceId, episode.id)]?.completed); startPlay(selected, resume || firstUnfinished || detailsEpisodes[0], detailsEpisodes) }} onPlayEpisode={episode => startPlay({ ...selected, episodes: detailsEpisodes }, episode, detailsEpisodes)} />}
    {play && <div className="player-modal" role="dialog" aria-modal="true" aria-label="Reprodutor de mídia"><button className="player-close" aria-label="Fechar player" onClick={closePlayer}>×</button><div className="player-video-wrap"><video ref={videoRef} controls playsInline autoPlay onError={event => setPlaybackError(describeVideoError(event.currentTarget))} onPlaying={() => setPlaybackError('')} onEnded={() => void onEnded()} onPause={() => void persistCurrentProgress()} aria-label={play.episode?.title || play.item.title}>{subtitleUrl && <track key={subtitleUrl} kind="subtitles" src={subtitleUrl} srcLang="pt-BR" label={`Legenda: ${subtitle?.name}`} default />}</video>{playbackError && <div className="playback-error" role="alert"><b>Não foi possível reproduzir</b><p>{playbackError}</p><button className="btn-primary" onClick={retryPlayback}>{playbackError.includes('Tocar agora') ? '▶ Tocar agora' : '▶ Tentar novamente'}</button></div>}{showNext && play.episode && play.index + 1 < play.queue.length && !autoplay && <div className="next-manual"><span>PRÓXIMO EPISÓDIO</span><b>{play.queue[play.index + 1].title}</b><button onClick={playNext}>▶ Assistir agora</button><button className="cancel-next" onClick={() => setShowNext(false)}>Fechar</button></div>}{showNext && play.episode && play.index + 1 < play.queue.length && autoplay && <div className="next-countdown"><span>PRÓXIMO EPISÓDIO · {countdown}s</span><b>{play.queue[play.index + 1].title}</b><div className="countdown-track"><i style={{ transform: `scaleX(${countdown / 7})` }} /></div><button onClick={playNext}>▶ Próximo agora</button><button className="cancel-next" onClick={() => { window.clearTimeout(autoTimer.current); setShowNext(false) }}>Cancelar</button></div>}</div><div className="player-caption"><div><span>{play.item.kind === 'live' ? 'TV AO VIVO' : play.item.kind === 'series' ? play.item.title : 'ORANGE PLAYER'}</span><h2>{play.episode ? `${String(play.episode.season).padStart(2, '0')} × ${String(play.episode.episode).padStart(2, '0')} · ${play.episode.title}` : play.item.title}</h2></div><div className="player-actions"><button className="subtitle-button" onClick={() => subtitleInput.current?.click()}>{subtitle ? `Legenda: ${subtitle.name}` : '＋ Importar legenda'}</button><input ref={subtitleInput} className="subtitle-input" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { const text = await file.text(); const vtt = file.name.toLowerCase().endsWith('.srt') ? `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}` : text; if (!vtt.trimStart().startsWith('WEBVTT')) throw new Error('O arquivo VTT precisa começar com WEBVTT.'); const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })); setSubtitle({ url, name: file.name }); notify(`Legenda carregada: ${file.name}`) } catch (error) { notify(readableError(error)) } finally { event.currentTarget.value = '' } }} /><span className="auto-toggle"><label><input type="checkbox" checked={autoplay} onChange={event => { setAutoplay(event.target.checked); void setSetting('autoplay', event.target.checked) }} /><i /> Autoplay</label></span></div></div></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}

function CatchUpGuide({ channels, sources, onPlay }: { channels: MediaItem[]; sources: ResolvedSource[]; onPlay: (channel: MediaItem, program: EpgProgram) => void }) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDate, setSelectedDate] = useState('')
  const [visibleCount, setVisibleCount] = useState(12)
  const [catalog, setCatalog] = useState<Record<string, { programs: EpgProgram[]; error?: string }>>({})
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now() / 1000)
  const categories = useMemo(() => [...new Set(channels.map(channel => channel.category || 'Sem categoria'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [channels])
  const filteredChannels = useMemo(() => channels.filter(channel => selectedCategory === 'all' || (channel.category || 'Sem categoria') === selectedCategory), [channels, selectedCategory])
  const visibleChannels = filteredChannels.slice(0, visibleCount)

  useEffect(() => { setCatalog({}); setSelectedDate(''); setVisibleCount(12) }, [channels])
  useEffect(() => {
    const pending = visibleChannels.filter(channel => !catalog[channel.id])
    if (!pending.length) return
    setBusy(true)
    void Promise.all(pending.map(async channel => {
      const source = sources.find(candidate => candidate.id === channel.sourceId && candidate.type === 'xtream')
      if (!source) return [channel.id, { programs: [], error: 'Catch Up exige uma fonte Xtream compatível.' }] as const
      try {
        const programs = await loadXtreamEpg({ server: source.server, username: source.username || '', password: source.secret }, channel, true)
        return [channel.id, { programs }] as const
      } catch (error) {
        return [channel.id, { programs: [], error: readableError(error) }] as const
      }
    })).then(results => setCatalog(current => ({ ...current, ...Object.fromEntries(results) }))).finally(() => setBusy(false))
  }, [visibleChannels, catalog, sources])

  const archivePrograms = useMemo(() => Object.values(catalog).flatMap(row => row.programs).filter(program => program.hasArchive && program.archiveUrl && program.end <= now), [catalog, now])
  const dates = useMemo(() => [...new Set(archivePrograms.map(program => localDateKey(program.start)))].sort().reverse(), [archivePrograms])
  useEffect(() => { if (!dates.includes(selectedDate)) setSelectedDate(dates[0] || '') }, [dates, selectedDate])

  const rows = visibleChannels.map(channel => ({ channel, programs: (catalog[channel.id]?.programs || []).filter(program => program.hasArchive && program.archiveUrl && program.end <= now && localDateKey(program.start) === selectedDate).sort((a, b) => a.start - b.start) })).filter(row => row.programs.length)
  const failed = visibleChannels.filter(channel => catalog[channel.id]?.error).length
  const slots = Array.from({ length: 48 }, (_, index) => {
    const date = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date()
    date.setMinutes(index * 30)
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  })

  return <section className="section-block catchup-page">
    <div className="catchup-heading"><div><span className="eyebrow">PROGRAMAÇÃO DISPONÍVEL</span><h1>Catch Up</h1><p>Volte ao programa que já passou. A disponibilidade depende do arquivo oferecido pela fonte.</p></div><span className="catchup-count">{channels.length.toLocaleString('pt-BR')} canais compatíveis</span></div>
    {!channels.length ? <div className="empty-state"><div className="empty-symbol">↶</div><h3>Nenhum canal com Catch Up nesta fonte</h3><p>O provedor precisa informar o arquivo de TV para cada canal (tv_archive). Selecione uma fonte Xtream compatível ou confira o serviço.</p></div> : <>
      <div className="catchup-categories"><button className={selectedCategory === 'all' ? 'selected' : ''} onClick={() => { setSelectedCategory('all'); setVisibleCount(12) }}>Todos os canais</button>{categories.map(value => <button key={value} className={selectedCategory === value ? 'selected' : ''} onClick={() => { setSelectedCategory(value); setVisibleCount(12) }}>{value}</button>)}</div>
      <div className="catchup-datebar"><b>Dia</b>{dates.length ? dates.map(value => <button key={value} className={selectedDate === value ? 'selected' : ''} onClick={() => setSelectedDate(value)}>{new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</button>) : <span>{busy ? 'Carregando guia e horários…' : 'Nenhum programa passado foi retornado pelo EPG.'}</span>}</div>
      {failed > 0 && <p className="catchup-notice">Não foi possível consultar o EPG de {failed} canal(is). Confira a conexão da fonte.</p>}
      <div className="catchup-grid-scroll"><div className="catchup-grid" style={{ gridTemplateColumns: `220px repeat(48, minmax(104px, 1fr))` }}>
        <div className="catchup-grid-head catchup-channel-head" style={{ gridRow: 1, gridColumn: 1 }}>CANAL</div>
        {slots.map((time, index) => <div className="catchup-grid-head" key={index} style={{ gridRow: 1, gridColumn: index + 2 }}>{time}</div>)}
        {rows.map(({ channel, programs }, rowIndex) => <div className="catchup-grid-row" key={channel.id}>
          <div className="catchup-channel" style={{ gridRow: rowIndex + 2, gridColumn: 1 }}><b>{channel.title}</b><small>{channel.category}</small></div>
          {programs.map(program => {
            const start = new Date(program.start * 1000), minute = start.getHours() * 60 + start.getMinutes()
            const firstSlot = Math.min(47, Math.floor(minute / 30)), span = Math.min(48 - firstSlot, Math.max(1, Math.ceil((program.end - program.start) / 1800)))
            return <button className="catchup-program" key={`${channel.id}:${program.start}`} style={{ gridRow: rowIndex + 2, gridColumn: `${firstSlot + 2} / span ${span}` }} title={`${program.title} · ${formatTime(program.end - program.start)}`} onClick={() => onPlay(channel, program)}><b>{program.title}</b><small>{start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · Assistir</small></button>
          })}
        </div>)}
        {!rows.length && <div className="catchup-grid-empty" style={{ gridRow: 2, gridColumn: '1 / -1' }}>{busy ? 'Buscando programação arquivada…' : 'Não há programas com replay para este dia. Escolha outra data ou atualize a fonte.'}</div>}
      </div></div>
      {visibleCount < filteredChannels.length && <button className="load-more" onClick={() => setVisibleCount(count => count + 12)}>Carregar mais canais</button>}
    </>}
  </section>
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp * 1000), pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function MediaCard({ item, progress = 0, onOpen, onDetails, onFavorite, favorite }: { item: MediaItem; progress?: number; onOpen: () => void; onDetails?: () => void; onFavorite: () => void; favorite: boolean }) {
  return <article className="media-card" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onOpen() }} onClick={onOpen}>
    <div className="poster">{item.poster ? <img loading="lazy" src={item.poster} alt="" onError={event => { event.currentTarget.style.display = 'none' }} /> : <div className="poster-fallback"><span>{item.kind === 'live' ? '◉' : item.kind === 'series' ? '▤' : '▶'}</span><small>{item.title.slice(0, 2).toLocaleUpperCase('pt-BR')}</small></div>}<span className="kind-badge">{item.kind === 'live' ? 'AO VIVO' : item.kind === 'series' ? 'SÉRIE' : 'FILME'}</span><button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={event => { event.stopPropagation(); onFavorite() }}>{favorite ? '♥' : '♡'}</button><button className="card-play" aria-label="Assistir">▶</button>{progress > 0 && <div className="progress"><i style={{ width: `${Math.min(99, Math.round(progress / (item.duration || 3600) * 100))}%` }} /></div>}</div>
    <div className="card-info"><b>{item.title}</b><span>{item.category || (item.kind === 'live' ? 'Canal' : item.kind === 'series' ? `${item.episodes?.length || '—'} episódios` : item.year || 'Filme')}<i>{item.rating ? `★ ${item.rating}` : ''}</i></span>{onDetails && <button className="details-link" onClick={event => { event.stopPropagation(); onDetails() }}>Detalhes →</button>}</div>
  </article>
}

function VaultDialog({ mode, busy, error, onSubmit }: { mode: 'create' | 'unlock' | 'loading' | 'ready'; busy: boolean; error: string; onSubmit: (pass: string, confirm: string) => Promise<void> }) {
  const [pass, setPass] = useState(''), [confirm, setConfirm] = useState('')
  return <div className="modal-scrim vault-scrim"><form className="vault-dialog" onSubmit={event => { event.preventDefault(); void onSubmit(pass, confirm) }}><div className="brand-icon large">▶</div><span className="eyebrow">COFRE LOCAL CRIPTOGRAFADO</span><h2>{mode === 'create' ? 'Proteja suas fontes.' : 'Desbloqueie seu catálogo.'}</h2><p>As credenciais das fontes ficam criptografadas no dispositivo com AES-GCM. A senha do cofre não é enviada a nenhum servidor; se esquecê-la, será preciso remover os dados locais.</p><label>Senha do cofre<input type="password" autoComplete="current-password" autoFocus minLength={10} required value={pass} onChange={event => setPass(event.target.value)} placeholder="Mínimo de 10 caracteres" /></label>{mode === 'create' && <label>Confirme a senha<input type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} /></label>}{error && <div className="form-error">{error}</div>}<button className="btn-primary wide" disabled={busy}>{busy ? 'Abrindo cofre…' : mode === 'create' ? 'Criar cofre e continuar' : 'Desbloquear'}</button></form></div>
}

function SourceDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (form: { type: 'xtream' | 'm3u'; name: string; server: string; username: string; password: string; url: string; file?: File }) => Promise<void> }) {
  const [type, setType] = useState<'xtream' | 'm3u'>('xtream'), [name, setName] = useState(''), [server, setServer] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [url, setUrl] = useState(''), [file, setFile] = useState<File>()
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><form className="source-dialog" onSubmit={event => { event.preventDefault(); void onSubmit({ type, name, server, username, password, url, file }) }}><button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">×</button><span className="eyebrow">CONECTE SUA FONTE AUTORIZADA</span><h2>Adicionar catálogo</h2><p>Use credenciais e conteúdo fornecidos por um serviço ao qual você tenha autorização.</p><div className="source-type"><button type="button" className={type === 'xtream' ? 'selected' : ''} onClick={() => setType('xtream')}>Xtream Codes</button><button type="button" className={type === 'm3u' ? 'selected' : ''} onClick={() => setType('m3u')}>Lista M3U/M3U8</button></div><label>Nome da fonte<input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Sala, Operadora" /></label>{type === 'xtream' ? <><label>Endereço do servidor<input type="url" required value={server} onChange={event => setServer(event.target.value)} placeholder="https://servidor.exemplo:porta" /></label><div className="form-columns"><label>Usuário<input required value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label><label>Senha<input type="password" required value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label></div></> : <><label>URL da lista M3U<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://exemplo.com/lista.m3u" disabled={Boolean(file)} /></label><div className="file-divider"><span>ou importe um arquivo local</span></div><label className="file-picker">Selecionar arquivo .m3u/.m3u8<input type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl" onChange={event => setFile(event.target.files?.[0])} /></label>{file && <span className="picked-file">{file.name}</span>}</>}
      <div className="privacy-note">⌑ Credenciais protegidas no cofre local. Não registramos senhas ou URLs completas em logs.</div><button className="btn-primary wide" disabled={busy || (type === 'm3u' && !url && !file)}>{busy ? 'Testando e carregando catálogo…' : 'Testar conexão e adicionar'}</button></form></div>
}

function DetailsDialog({ item, episodes, epg, epgNow, busy, progress, favorite, canReloadEpisodes, onClose, onFavorite, onReloadEpisodes, onPlay, onPlayEpisode }: { item: MediaItem; episodes: Episode[]; epg: EpgProgram[]; epgNow: number; busy: boolean; progress: Record<string, ProgressRecord>; favorite: boolean; canReloadEpisodes: boolean; onClose: () => void; onFavorite: () => void; onReloadEpisodes: () => void; onPlay: () => void; onPlayEpisode: (episode: Episode) => void }) {
  const seasons = [...new Set(episodes.map(episode => episode.season))].sort((a, b) => a - b)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const season = seasons.includes(selectedSeason) ? selectedSeason : seasons[0] || 1
  const filtered = episodes.filter(episode => episode.season === season)
  return <div className="modal-scrim details-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="details-dialog" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.title}`}><button className="modal-close" onClick={onClose} aria-label="Fechar">×</button><div className="details-art" style={item.backdrop || item.poster ? { backgroundImage: `linear-gradient(0deg,#111419 0%,transparent 90%), url("${item.backdrop || item.poster}")` } : undefined} /><div className="details-copy"><span className="eyebrow">{item.kind === 'series' ? 'SÉRIE' : item.kind === 'live' ? 'TV AO VIVO' : 'FILME'}{item.category ? ` · ${item.category}` : ''}</span><h2>{item.title}</h2><div className="metadata-line">{item.year && <span>{item.year}</span>}{item.rating && <span>★ {item.rating}</span>}{item.duration && <span>{formatTime(item.duration)}</span>}</div><p>{item.description || 'A fonte não forneceu uma sinopse para este título.'}</p><div className="hero-actions"><button className="btn-primary" disabled={item.kind === 'series' && episodes.length === 0} onClick={onPlay}>▶ {item.kind === 'series' ? 'Assistir série' : 'Assistir agora'}</button><button className="btn-ghost" onClick={onFavorite}>{favorite ? '♥ Na minha lista' : '♡ Minha lista'}</button></div></div>{item.kind === 'live' && <div className="episode-section"><div className="episode-title"><div><span className="eyebrow">GUIA DE PROGRAMAÇÃO</span><h3>Programação</h3></div></div>{busy ? <p className="muted">Carregando EPG…</p> : epg.length ? <div className="epg-list">{epg.map(program => { const now = epgNow, current = now >= program.start && now < program.end, percent = Math.min(100, Math.max(0, (now - program.start) / (program.end - program.start) * 100)); return <div className={`epg-row ${current ? 'current' : ''}`} key={`${program.start}-${program.title}`}><time>{new Date(program.start * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><div><b>{program.title}{current && <i> · AGORA</i>}</b><small>{program.description || 'Sem descrição disponível.'}</small>{current && <div className="epg-progress"><i style={{ width: `${percent}%` }} /></div>}</div></div> })}</div> : <p className="muted">Este canal não fornece dados EPG.</p>}</div>}{item.kind === 'series' && <div className="episode-section"><div className="episode-title"><div><span className="eyebrow">TEMPORADAS E EPISÓDIOS</span><h3>Episódios</h3></div>{seasons.length > 0 && <select aria-label="Selecionar temporada" value={season} onChange={event => setSelectedSeason(Number(event.target.value))}>{seasons.map(value => <option key={value} value={value}>Temporada {value}</option>)}</select>}</div>{busy ? <p className="muted">Carregando episódios…</p> : episodes.length ? <div className="episode-list">{filtered.map(episode => { const watched = progress[FAVORITE_KEY(item.sourceId, episode.id)]?.completed; return <button key={episode.id} className="episode-row" onClick={() => onPlayEpisode(episode)}><span className={`episode-state ${watched ? 'done' : ''}`}>{watched ? '✓' : `${episode.episode}`}</span><span className="episode-detail"><b>{episode.title}</b><small>Temporada {episode.season} · Episódio {episode.episode}{episode.duration ? ` · ${formatTime(episode.duration)}` : ''}</small></span><i>▶</i></button> })}</div> : <p className="muted">A fonte não retornou episódios. Em listas M3U, confirme se a playlist inclui os links de episódio S01E01; em Xtream, tente consultar novamente. {canReloadEpisodes && <button className="retry-episodes" onClick={onReloadEpisodes} disabled={busy}>{busy ? "Consultando…" : "↻ Consultar episódios novamente"}</button>}</p>}</div>}</section></div>
}

export default App
