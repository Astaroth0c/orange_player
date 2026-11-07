package com.orangeplayer.poc

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var playerView: PlayerView
    private var player: ExoPlayer? = null
    private val requests = Executors.newSingleThreadExecutor()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this).apply { setBackgroundColor(0xFF101419.toInt()) }
        val assetLoader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            isFocusable = true
            addJavascriptInterface(OrangeBridge(), "OrangePlayer")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) = assetLoader.shouldInterceptRequest(request.url)
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.host != "appassets.androidplatform.net"
            }
            loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
        }
        playerView = PlayerView(this).apply { useController = true; controllerAutoShow = true; setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING); visibility = View.GONE }
        root.addView(web, FrameLayout.LayoutParams(-1, -1)); root.addView(playerView, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
    }

    private inner class OrangeBridge {
        @JavascriptInterface fun play(url: String, key: String, parentKey: String) = runOnUiThread {
            if (!url.startsWith("http://") && !url.startsWith("https://")) return@runOnUiThread
            web.visibility = View.GONE; playerView.visibility = View.VISIBLE
            val exo = player ?: ExoPlayer.Builder(this@MainActivity).build().also { p ->
                playerView.player = p
                p.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_ENDED) { reportProgress(key, parentKey, true); js("window.dispatchEvent(new Event('orange-ended'))") }
                    }
                    override fun onPlayerError(error: PlaybackException) {
                        runOnUiThread { playerView.visibility = View.GONE; web.visibility = View.VISIBLE }
                        js("window.dispatchEvent(new Event('orange-playback-error'))")
                    }
                })
                player = p
            }
            exo.setMediaItem(MediaItem.fromUri(url)); exo.prepare(); exo.playWhenReady = true
            web.postDelayed(object : Runnable { override fun run() { if (player === exo && exo.isPlaying) { reportProgress(key, parentKey, false); web.postDelayed(this, 15_000) } } }, 15_000)
        }
        @JavascriptInterface fun stop() = runOnUiThread { player?.stop(); playerView.visibility = View.GONE; web.visibility = View.VISIBLE }
        @JavascriptInterface fun requestText(url: String, id: String) {
            requests.execute {
                val (status, body) = try {
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 20_000; connection.readTimeout = 30_000
                    require(connection.url.protocol == "http" || connection.url.protocol == "https")
                    val status = connection.responseCode
                    val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                    val bytes = stream?.use { input ->
                        val output = ByteArrayOutputStream(); val buffer = ByteArray(8192); var total = 0; var count: Int
                        while (input.read(buffer).also { count = it } >= 0) { total += count; require(total <= 64 * 1024 * 1024) { "Source response exceeds 64 MB" }; output.write(buffer, 0, count) }
                        output.toByteArray()
                    } ?: ByteArray(0)
                    require(bytes.size <= 64 * 1024 * 1024) { "Source response exceeds 64 MB" }
                    status to bytes.toString(Charsets.UTF_8)
                } catch (error: Exception) { 0 to "" }
                val literal = JSONObject.quote(body)
                runOnUiThread { js("window.onOrangeFetchResult && window.onOrangeFetchResult(${JSONObject.quote(id)},$status,$literal)") }
            }
        }
    }

    private fun reportProgress(key: String, parentKey: String, ended: Boolean) {
        val p = player ?: return
        val payload = JSONObject().put("key", key).put("parentKey", parentKey).put("position", p.currentPosition.coerceAtLeast(0) / 1000.0).put("duration", p.duration.coerceAtLeast(0) / 1000.0).put("ended", ended)
        js("window.dispatchEvent(new CustomEvent('orange-progress',{detail:${payload}}))")
    }

    private fun js(code: String) { runOnUiThread { web.evaluateJavascript(code, null) } }
    override fun onBackPressed() { if (playerView.visibility == View.VISIBLE) { player?.stop(); playerView.visibility = View.GONE; web.visibility = View.VISIBLE } else if (web.canGoBack()) web.goBack() else super.onBackPressed() }
    override fun onDestroy() { playerView.player = null; player?.release(); player = null; requests.shutdownNow(); web.destroy(); super.onDestroy() }
}
