package com.grengin.community

import android.content.Intent
import android.content.pm.PackageManager
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts

private const val MAIN_WEBVIEW_LABEL = "main"

class MainActivity : TauriActivity() {
    private var nativeSpeechBridge: NativeSpeechBridge? = null
    private var nativeArtifactPreview: NativeArtifactPreview? = null
    private var nativeArtifactDownloadBridge: NativeArtifactDownloadBridge? = null
    private val artifactDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        nativeArtifactDownloadBridge?.onDocumentResult(result.resultCode, result.data?.data)
    }

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

        val artifactPreview = NativeArtifactPreview(this, webView)
        nativeArtifactPreview = artifactPreview
        webView.addJavascriptInterface(artifactPreview, "GrenginArtifactPreview")

        val artifactDownloadBridge = NativeArtifactDownloadBridge(this, webView)
        nativeArtifactDownloadBridge = artifactDownloadBridge
        webView.addJavascriptInterface(artifactDownloadBridge, "GrenginArtifactDownload")
    }

    internal fun openArtifactDocument(fileName: String, mimeType: String) {
        artifactDocumentLauncher.launch(
            Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = mimeType
                putExtra(Intent.EXTRA_TITLE, fileName)
            }
        )
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
        nativeArtifactPreview?.destroy()
        nativeArtifactPreview = null
        nativeArtifactDownloadBridge?.destroy()
        nativeArtifactDownloadBridge = null
        super.onDestroy()
    }
}
