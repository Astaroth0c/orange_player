/* Samsung TV AVPlay adapter. The TV supplies webapis through its WebAPI runtime. */
(() => {
  if (!window.webapis?.avplay) return
  const av = window.webapis.avplay
  let avplayObject
  let current = { key: '', parentKey: '' }
  const publishProgress = ended => {
    try {
      const duration = Math.max(0, av.getDuration()) / 1000
      const position = Math.max(0, av.getCurrentTime()) / 1000
      window.dispatchEvent(new CustomEvent('orange-progress', { detail: { ...current, position, duration, ended } }))
    } catch { /* The AVPlay state may not expose a time before media is ready. */ }
  }
  window.OrangePlayer = {
    play(url, key, parentKey) {
      if (!/^https?:\/\//i.test(url)) return
      if (!avplayObject) {
        avplayObject = document.createElement('object')
        avplayObject.type = 'application/avplayer'
        avplayObject.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9999;pointer-events:none'
        document.body.appendChild(avplayObject)
      }
      current = { key, parentKey }
      try { av.stop(); av.close() } catch { /* Nothing is open yet. */ }
      av.open(url)
      av.setDisplayRect(0, 0, 1920, 1080)
      av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')
      av.setListener({
        onstreamcompleted() { publishProgress(true); try { av.stop() } catch { /* Already stopped. */ } window.dispatchEvent(new Event('orange-ended')) },
        oncurrentplaytime() { publishProgress(false) },
        onerror() { window.dispatchEvent(new CustomEvent('orange-playback-error')) },
      })
      av.prepareAsync(() => av.play(), () => window.dispatchEvent(new CustomEvent('orange-playback-error')))
    },
    stop() { try { av.stop(); av.close() } catch { /* AVPlay was already closed. */ } },
    requestText(url, id) {
      fetch(url).then(async response => window.onOrangeFetchResult?.(id, response.status, await response.text()))
        .catch(() => window.onOrangeFetchResult?.(id, 0, ''))
    },
  }
})()
