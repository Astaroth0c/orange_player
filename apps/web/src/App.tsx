import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { Episode, EpgProgram, MediaItem, Source, StoredSource } from './domain'
import { loadM3u, loadXtreamCatalog, loadXtreamEpisodes, loadXtreamEpg, normalizeServer } from './domain'
import { parseM3uAsync } from './source-worker'
import { allCatalogs, decryptSecret, deriveVaultKey, encryptSecret, getAllProgress, getCatalog, getFavorites, getProgress, getSetting, getSources, removeSource as deleteStoredSource, saveCatalog, saveSource, setFavorite, setProgress, setSetting } from './storage'

type ResolvedSource = Omit<Source, 'secret'> & { secret: string }
type PlayState = { item: MediaItem; episode?: Episode; queue: Episode[]; index: number }
type ProgressRecord = { position: number; duration: number; completed?: boolean }
declare global { interface Window { OrangeDesktop?: { fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }>; mediaUrl(url: string): Promise<string> }; OrangePlayer?: { play(url: string, key: string, parentKey: string): void; stop(): void; requestText(url: string, id: string): void }; onOrangeFetchResult?: (id: string, status: number, text: string) => void } }
const FAVORITE_KEY = (sourceId: string, itemId: string) => `${sourceId}:${itemId}`

function readableError(error: unknown) {
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
  const [search, setSearch] = useState('')
  const [selectedSource, setSelectedSource] = useState('all')
  const [selected, setSelected] = useState<MediaItem | undefined>(undefined)
  const [detailsEpisodes, setDetailsEpisodes] = useState<Episode[]>([])
  const [detailsEpg, setDetailsEpg] = useState<EpgProgram[]>([])
  const [epgNow, setEpgNow] = useState<number | null>(null)
  const [episodeBusy, setEpisodeBusy] = useState(false)
  const [play, setPlay] = useState<PlayState | undefined>(undefined)
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
    const catalog = source.type === 'xtream'
      ? await loadXtreamCatalog({ server: source.server, username: source.username || '', password: source.secret }, source.id)
      : source.secret.startsWith('file:')
        ? await parseM3uAsync(source.secret.slice(5), source.id)
        : await loadM3u(source.secret, source.id)
    await saveCatalog(source.id, catalog)
    setItems(current => [...current.filter(item => item.sourceId !== source.id), ...catalog])
    notify(`${catalog.length.toLocaleString('pt-BR')} itens sincronizados.`)
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
    if (page === 'Minha lista') list = list.filter(item => favorites.includes(FAVORITE_KEY(item.sourceId, item.id)))
    if (page === 'Continuar') list = list.filter(item => Boolean(progress[FAVORITE_KEY(item.sourceId, item.id)]?.position))
    if (search.trim()) {
      const query = search.toLocaleLowerCase()
      list = list.filter(item => `${item.title} ${item.category || ''} ${item.year || ''}`.toLocaleLowerCase().includes(query))
    }
    return list
  }, [items, selectedSource, kind, category, page, favorites, progress, search])

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
    if (item.kind === 'series' && item.externalId) {
      if (source) {
        setEpisodeBusy(true)
        try {
          const episodes = await loadXtreamEpisodes({ server: source.server, username: source.username || '', password: source.secret }, item)
          setDetailsEpisodes(episodes)
          const stored = await getCatalog(item.sourceId)
          await saveCatalog(item.sourceId, stored.map(value => value.id === item.id ? { ...value, episodes } : value))
          setItems(current => current.map(value => value.id === item.id ? { ...value, episodes } : value))
        } catch { notify('Não foi possível carregar os episódios desta série.') }
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
    const activeQueue = queue.length ? queue : item.episodes || []
    const resumeEpisode = activeQueue.find(value => progress[FAVORITE_KEY(item.sourceId, value.id)]?.position)
    const firstUnfinished = activeQueue.find(value => !progress[FAVORITE_KEY(item.sourceId, value.id)]?.completed)
    const selectedEpisode = episode || (item.kind === 'series' ? resumeEpisode || firstUnfinished || activeQueue[0] : undefined)
    const index = selectedEpisode ? Math.max(0, activeQueue.findIndex(value => value.id === selectedEpisode.id)) : 0
    setPlay({ item, episode: selectedEpisode, queue: activeQueue, index })
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
      const progressEvent = (event: Event) => {
        const row = (event as CustomEvent<{ key: string; parentKey: string; position: number; duration: number; ended: boolean }>).detail
        void setProgress(row.key, row.position, row.duration)
        if (row.parentKey !== row.key) void setProgress(row.parentKey, row.position, row.duration)
        setProgressState(current => ({ ...current, [row.key]: { position: row.ended ? 0 : row.position / 1000, duration: row.duration / 1000, completed: row.ended }, [row.parentKey]: { position: row.ended ? 0 : row.position / 1000, duration: row.duration / 1000, completed: row.ended } }))
      }
      window.addEventListener('orange-ended', ended); window.addEventListener('orange-progress', progressEvent)
      return () => { window.removeEventListener('orange-ended', ended); window.removeEventListener('orange-progress', progressEvent) }
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
      if (/\.m3u8($|\?)/i.test(url) && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: HlsPlayer } = await import('hls.js')
        if (disposed) return
        if (HlsPlayer.isSupported()) {
          const hls = new HlsPlayer({ enableWorker: true, lowLatencyMode: play.item.kind === 'live', backBufferLength: 30 })
          hlsRef.current = hls
          hls.loadSource(playableUrl); hls.attachMedia(video)
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) notify('Falha ao abrir o stream. Confira a fonte ou tente novamente.') })
        } else video.src = playableUrl
      } else video.src = playableUrl
      const row = await getProgress(key)
      if (!disposed && row.position > 10) video.currentTime = row.position
      if (!disposed) progressTimer.current = window.setInterval(() => void persistCurrentProgress(), 15_000)
    })()
    return () => { disposed = true; window.clearInterval(progressTimer.current); hlsRef.current?.destroy(); hlsRef.current = undefined }
  }, [play, persistCurrentProgress])

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

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" onClick={event => { event.preventDefault(); setPage('Início'); setRenderCount(80); setKind('all') }}><span className="brand-icon">▶</span><span>ORANGE<span> PLAYER</span></span></a>
      <label className="search"><span>⌕</span><input aria-label="Buscar no catálogo" placeholder="Buscar canais, filmes e séries" value={search} onChange={event => { setSearch(event.target.value); setRenderCount(80) }} /></label>
      <div className="top-actions"><select aria-label="Fonte ativa" value={selectedSource} onChange={event => { setSelectedSource(event.target.value); setRenderCount(80) }}><option value="all">Todas as fontes</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select><button className="profile-button" title="Bloquear o cofre" onClick={() => { if (play) closePlayer(); setVault('unlock'); setVaultKey(undefined); setSources([]) }}>R</button></div>
    </header>
    <aside className="sidebar"><span className="side-label">MENU PRINCIPAL</span>{['Início', 'TV ao vivo', 'Filmes', 'Séries', 'Continuar', 'Minha lista'].map((item, index) => <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => { setPage(item); setRenderCount(80); setKind(item === 'TV ao vivo' ? 'live' : item === 'Filmes' ? 'movie' : item === 'Séries' ? 'series' : 'all') }}><span className="nav-icon">{['◈', '▣', '▰', '▤', '◷', '♡'][index]}</span>{item}{page === item && <i />}</button>)}<div className="sidebar-bottom"><span className="side-label">SUA BIBLIOTECA</span><button className="nav-item" onClick={() => setSourceModal(true)}><span className="nav-icon">＋</span>Adicionar fonte</button>{sources.map(source => <div key={source.id} className="source-entry"><span className="source-dot" />{source.name}<button title="Sincronizar fonte" onClick={() => void refreshSource(source).catch(error => notify(readableError(error)))}>↻</button><button title="Remover fonte" onClick={() => void deleteSource(source)}>×</button></div>)}</div><div className="sidebar-footer"><span className="online-dot" />{items.length.toLocaleString('pt-BR')} itens disponíveis</div></aside>
    <main className="main-content">
      {page === 'Início' && <section className="welcome-hero"><div className="hero-art" /><div className="hero-copy"><span className="eyebrow"><i /> ORANGE GLASS · SEU UNIVERSO</span><h1>Boas histórias<br /><em>merecem um play.</em></h1><p>Seu catálogo, seus canais e sua próxima maratona em um só lugar.</p><div className="hero-actions"><button className="btn-primary" onClick={() => setSourceModal(true)}>＋ Adicionar fonte</button><button className="btn-ghost" onClick={() => { setPage('TV ao vivo'); setRenderCount(80); setKind('live') }}>▣ Ver TV ao vivo</button></div><div className="hero-stats"><span><b>{items.filter(item => item.kind === 'live').length}</b> canais</span><span><b>{items.filter(item => item.kind === 'movie').length}</b> filmes</span><span><b>{items.filter(item => item.kind === 'series').length}</b> séries</span></div></div><div className="hero-orbit" /><span className="hero-index">01 <i /> ORANGE PLAYER</span></section>}
      {page === 'Início' && <section className="section-block"><div className="section-title"><div><span className="eyebrow">RETOME DE ONDE PAROU</span><h2>Continue assistindo</h2></div><button className="link-button" onClick={() => { setPage('Continuar'); setRenderCount(80) }}>Ver tudo →</button></div><div className="continue-row">{items.filter(item => progress[FAVORITE_KEY(item.sourceId, item.id)]?.position).slice(0, 6).map(item => <MediaCard key={item.id} item={item} progress={progress[FAVORITE_KEY(item.sourceId, item.id)]?.position} onOpen={() => item.kind === 'series' ? startPlay(item) : item.kind === 'live' ? void openDetails(item) : startPlay(item)} onFavorite={() => void toggleFavorite(item)} favorite={favorites.includes(FAVORITE_KEY(item.sourceId, item.id))} />)}{!items.some(item => progress[FAVORITE_KEY(item.sourceId, item.id)]?.position) && <div className="empty-inline"><span>◷</span><b>Sua próxima sessão começa aqui</b><p>Quando você começar um filme ou episódio, ele aparecerá nesta área.</p></div>}</div></section>}
      <section className="section-block catalog-block">
        <div className="section-title"><div><span className="eyebrow">{page === 'Início' ? 'DO SEU CATÁLOGO' : page.toLocaleUpperCase('pt-BR')}</span><h2>{page === 'Início' ? 'Explore o catálogo' : page}</h2></div><div className="catalog-controls"><select aria-label="Categoria" onChange={event => { setCategory(event.target.value); setRenderCount(80) }} value={category}><option value="all">Todas as categorias</option>{[...new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))].sort().map(value => <option key={value}>{value}</option>)}</select><div className="view-filters">{[['all', 'Tudo'], ['live', 'TV'], ['movie', 'Filmes'], ['series', 'Séries']].map(([value, label]) => <button key={value} className={kind === value ? 'selected' : ''} onClick={() => { setKind(value as typeof kind); setRenderCount(80) }}>{label}</button>)}</div></div></div>
        {visibleItems.length ? <><div className="media-grid">{visibleItems.slice(0, renderCount).map(item => <MediaCard key={item.id} item={item} progress={progress[FAVORITE_KEY(item.sourceId, item.id)]?.position} onOpen={() => item.kind === 'series' || item.kind === 'live' ? void openDetails(item) : startPlay(item)} onDetails={() => void openDetails(item)} onFavorite={() => void toggleFavorite(item)} favorite={favorites.includes(FAVORITE_KEY(item.sourceId, item.id))} />)}</div>{renderCount < visibleItems.length && <button className="load-more" onClick={() => setRenderCount(value => value + 80)}>Carregar mais {Math.min(80, visibleItems.length - renderCount)} itens</button>}</> : <div className="empty-state"><div className="empty-symbol">{items.length ? '⌕' : '＋'}</div><h3>{items.length ? 'Nada por aqui ainda' : 'Adicione sua primeira fonte'}</h3><p>{items.length ? 'Tente outro filtro ou atualize a fonte selecionada.' : 'Conecte uma lista M3U/M3U8 ou uma conta Xtream autorizada.'}</p><button className="btn-primary" onClick={() => items.length ? setKind('all') : setSourceModal(true)}>{items.length ? 'Limpar filtros' : 'Configurar fonte'}</button></div>}
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
    {selected && <DetailsDialog key={selected.id} item={selected} episodes={detailsEpisodes} epg={detailsEpg} epgNow={epgNow || 0} busy={episodeBusy} progress={progress} favorite={favorites.includes(FAVORITE_KEY(selected.sourceId, selected.id))} onClose={closeDetails} onFavorite={() => void toggleFavorite(selected)} onPlay={() => { const resume = detailsEpisodes.find(episode => progress[FAVORITE_KEY(selected.sourceId, episode.id)]?.position); const firstUnfinished = detailsEpisodes.find(episode => !progress[FAVORITE_KEY(selected.sourceId, episode.id)]?.completed); startPlay(selected, resume || firstUnfinished || detailsEpisodes[0], detailsEpisodes) }} onPlayEpisode={episode => startPlay({ ...selected, episodes: detailsEpisodes }, episode, detailsEpisodes)} />}
    {play && <div className="player-modal" role="dialog" aria-modal="true" aria-label="Reprodutor de mídia"><button className="player-close" aria-label="Fechar player" onClick={closePlayer}>×</button><div className="player-video-wrap"><video ref={videoRef} controls playsInline autoPlay onEnded={() => void onEnded()} onPause={() => void persistCurrentProgress()} aria-label={play.episode?.title || play.item.title} />{showNext && play.episode && play.index + 1 < play.queue.length && !autoplay && <div className="next-manual"><span>PRÓXIMO EPISÓDIO</span><b>{play.queue[play.index + 1].title}</b><button onClick={playNext}>▶ Assistir agora</button><button className="cancel-next" onClick={() => setShowNext(false)}>Fechar</button></div>}{showNext && play.episode && play.index + 1 < play.queue.length && autoplay && <div className="next-countdown"><span>PRÓXIMO EPISÓDIO · {countdown}s</span><b>{play.queue[play.index + 1].title}</b><div className="countdown-track"><i style={{ transform: `scaleX(${countdown / 7})` }} /></div><button onClick={playNext}>▶ Próximo agora</button><button className="cancel-next" onClick={() => { window.clearTimeout(autoTimer.current); setShowNext(false) }}>Cancelar</button></div>}</div><div className="player-caption"><div><span>{play.item.kind === 'live' ? 'TV AO VIVO' : play.item.kind === 'series' ? play.item.title : 'ORANGE PLAYER'}</span><h2>{play.episode ? `${String(play.episode.season).padStart(2, '0')} × ${String(play.episode.episode).padStart(2, '0')} · ${play.episode.title}` : play.item.title}</h2></div><span className="auto-toggle"><label><input type="checkbox" checked={autoplay} onChange={event => { setAutoplay(event.target.checked); void setSetting('autoplay', event.target.checked) }} /><i /> Autoplay</label></span></div></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
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

function DetailsDialog({ item, episodes, epg, epgNow, busy, progress, favorite, onClose, onFavorite, onPlay, onPlayEpisode }: { item: MediaItem; episodes: Episode[]; epg: EpgProgram[]; epgNow: number; busy: boolean; progress: Record<string, ProgressRecord>; favorite: boolean; onClose: () => void; onFavorite: () => void; onPlay: () => void; onPlayEpisode: (episode: Episode) => void }) {
  const seasons = [...new Set(episodes.map(episode => episode.season))].sort((a, b) => a - b)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const season = seasons.includes(selectedSeason) ? selectedSeason : seasons[0] || 1
  const filtered = episodes.filter(episode => episode.season === season)
  return <div className="modal-scrim details-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="details-dialog" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.title}`}><button className="modal-close" onClick={onClose} aria-label="Fechar">×</button><div className="details-art" style={item.backdrop || item.poster ? { backgroundImage: `linear-gradient(0deg,#111419 0%,transparent 90%), url("${item.backdrop || item.poster}")` } : undefined} /><div className="details-copy"><span className="eyebrow">{item.kind === 'series' ? 'SÉRIE' : item.kind === 'live' ? 'TV AO VIVO' : 'FILME'}{item.category ? ` · ${item.category}` : ''}</span><h2>{item.title}</h2><div className="metadata-line">{item.year && <span>{item.year}</span>}{item.rating && <span>★ {item.rating}</span>}{item.duration && <span>{formatTime(item.duration)}</span>}</div><p>{item.description || 'A fonte não forneceu uma sinopse para este título.'}</p><div className="hero-actions"><button className="btn-primary" disabled={item.kind === 'series' && episodes.length === 0} onClick={onPlay}>▶ {item.kind === 'series' ? 'Assistir série' : 'Assistir agora'}</button><button className="btn-ghost" onClick={onFavorite}>{favorite ? '♥ Na minha lista' : '♡ Minha lista'}</button></div></div>{item.kind === 'live' && <div className="episode-section"><div className="episode-title"><div><span className="eyebrow">GUIA DE PROGRAMAÇÃO</span><h3>Programação</h3></div></div>{busy ? <p className="muted">Carregando EPG…</p> : epg.length ? <div className="epg-list">{epg.map(program => { const now = epgNow, current = now >= program.start && now < program.end, percent = Math.min(100, Math.max(0, (now - program.start) / (program.end - program.start) * 100)); return <div className={`epg-row ${current ? 'current' : ''}`} key={`${program.start}-${program.title}`}><time>{new Date(program.start * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><div><b>{program.title}{current && <i> · AGORA</i>}</b><small>{program.description || 'Sem descrição disponível.'}</small>{current && <div className="epg-progress"><i style={{ width: `${percent}%` }} /></div>}</div></div> })}</div> : <p className="muted">Este canal não fornece dados EPG.</p>}</div>}{item.kind === 'series' && <div className="episode-section"><div className="episode-title"><div><span className="eyebrow">TEMPORADAS E EPISÓDIOS</span><h3>Episódios</h3></div>{seasons.length > 0 && <select aria-label="Selecionar temporada" value={season} onChange={event => setSelectedSeason(Number(event.target.value))}>{seasons.map(value => <option key={value} value={value}>Temporada {value}</option>)}</select>}</div>{busy ? <p className="muted">Carregando episódios…</p> : episodes.length ? <div className="episode-list">{filtered.map(episode => { const watched = progress[FAVORITE_KEY(item.sourceId, episode.id)]?.completed; return <button key={episode.id} className="episode-row" onClick={() => onPlayEpisode(episode)}><span className={`episode-state ${watched ? 'done' : ''}`}>{watched ? '✓' : `${episode.episode}`}</span><span className="episode-detail"><b>{episode.title}</b><small>Temporada {episode.season} · Episódio {episode.episode}{episode.duration ? ` · ${formatTime(episode.duration)}` : ''}</small></span><i>▶</i></button> })}</div> : <p className="muted">Esta série não trouxe episódios pela fonte. Atualize a lista ou confira o serviço.</p>}</div>}</section></div>
}

export default App
