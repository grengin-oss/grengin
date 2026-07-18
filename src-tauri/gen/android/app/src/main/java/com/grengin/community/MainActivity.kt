package com.grengin.community

import android.content.pm.PackageManager
import android.webkit.WebView

private const val MAIN_WEBVIEW_LABEL = "main"

class MainActivity : TauriActivity() {
    private var nativeSpeechBridge: NativeSpeechBridge? = null

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)

        val rustWebView = webView as? RustWebView
        if (rustWebView?.id != MAIN_WEBVIEW_LABEL) {
            return
        }

        configureMainWebView(webView)

        val speechBridge = NativeSpeechBridge(this, webView)
        nativeSpeechBridge = speechBridge
        webView.addJavascriptInterface(speechBridge, "GrenginSpeech")
    }

    private fun configureMainWebView(webView: WebView) {
        webView.settings.apply {
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        if (requestCode == NATIVE_SPEECH_PERMISSION_REQUEST_CODE) {
            nativeSpeechBridge?.onRecordAudioPermissionResult(
                grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            )
            return
        }

        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    override fun onDestroy() {
        nativeSpeechBridge?.destroy()
        nativeSpeechBridge = null
        super.onDestroy()
    }
}
