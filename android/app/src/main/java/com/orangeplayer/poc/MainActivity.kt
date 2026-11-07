package com.orangeplayer.poc

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

class MainActivity : Activity() {
    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF101419.toInt())
            isFocusableInTouchMode = true
        }
        playerView = PlayerView(this).apply {
            useController = true
            controllerAutoShow = true
            setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            isFocusable = true
            contentDescription = "Player de demonstração Orange Player"
        }
        root.addView(playerView, FrameLayout.LayoutParams(-1, -1))

        val label = TextView(this).apply {
            text = "ORANGE PLAYER  •  PROVA DE CONCEITO MEDIA3"
            textSize = 14f
            setTextColor(0xFFFF963F.toInt())
            setPadding(28, 22, 28, 22)
            isFocusable = false
        }
        root.addView(label, FrameLayout.LayoutParams(-2, -2))
        setContentView(root)

        playerView.requestFocus()
    }

    override fun onStart() {
        super.onStart()
        player = ExoPlayer.Builder(this).build().also { exoPlayer ->
            playerView.player = exoPlayer
            exoPlayer.setMediaItem(MediaItem.fromUri(DEMO_MEDIA_URL))
            exoPlayer.playWhenReady = false
            exoPlayer.prepare()
        }
    }

    override fun onStop() {
        playerView.player = null
        player?.release()
        player = null
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        window.decorView.systemUiVisibility = if (hasFocus) {
            (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
        } else 0
    }

    private companion object {
        // Stream público de demonstração; substitua por mídia de teste autorizada no ensaio de hardware.
        const val DEMO_MEDIA_URL =
            "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    }
}
