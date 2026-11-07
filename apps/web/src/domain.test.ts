import { describe, expect, it } from 'vitest'
import { normalizeServer, parseM3u } from './domain'

describe('normalizeServer', () => {
  it('normalizes a base server URL without credentials', () => {
    expect(normalizeServer('https://media.example.test:8443/')).toBe('https://media.example.test:8443')
  })

  it.each(['media.example.test', 'file:///tmp/list.m3u', 'https://user:pass@example.test', 'https://example.test/?token=secret'])('rejects unsafe or incomplete server URLs: %s', value => {
    expect(() => normalizeServer(value)).toThrow()
  })
})

describe('parseM3u', () => {
  const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="news.one" tvg-logo="https://img.example.test/news.png" group-title="Notícias",Canal Notícias
https://media.example.test/live/news.m3u8
#EXTINF:-1 group-title="Filmes",Filme de Teste (2024)
https://media.example.test/vod/test.mp4
#EXTINF:-1 group-title="Séries",Série Teste S01E01 Piloto
https://media.example.test/series/test-s01e01.mp4
#EXTINF:-1 group-title="Séries",Série Teste S01E02 Retorno
https://media.example.test/series/test-s01e02.mp4
`

  it('normalizes live, VOD, and grouped series without duplicate episode cards', () => {
    const result = parseM3u(playlist, 'source')
    expect(result.map(item => item.kind)).toEqual(['live', 'movie', 'series'])
    expect(result[0].poster).toBe('https://img.example.test/news.png')
    expect(result[1].year).toBeUndefined()
    expect(result[2].episodes?.map(episode => `${episode.season}x${episode.episode}`)).toEqual(['1x1', '1x2'])
  })

  it('ignores malformed rows while retaining valid HTTP media', () => {
    const result = parseM3u('#EXTM3U\n#EXTINF:-1,Ok\nhttps://media.example.test/ok.ts\n#EXTINF:-1,Local\nfile:///movie.mp4', 'source')
    expect(result.map(item => item.title)).toEqual(['Ok'])
  })

  it('requires an M3U header', () => {
    expect(() => parseM3u('https://media.example.test/playlist', 'source')).toThrow('cabeçalho M3U')
  })
})
