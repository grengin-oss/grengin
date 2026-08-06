package com.grengin.community

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Outline
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.Keep
import kotlin.math.roundToInt

/**
 * Hosts an artifact preview in a real Android WebView layered over the Tauri
 * WebView, instead of an <iframe> scaled with a CSS transform.
 *
 * Why: an iframe under a CSS transform forces Chromium to re-rasterise the
 * iframe's content every time the effective scale changes. For a heavy artifact
 * that cannot finish inside a frame, so the gesture either stutters or (with
 * `will-change: transform` pinning the raster scale) goes blurry and snaps crisp
 * at the end. Neither is avoidable from the web side.
 *
 * A WebView zooming *itself* takes a different path entirely: the compositor
 * scales the existing tiles on the GPU and re-rasterises progressively at the
 * new scale, which is what makes native pinch-zoom smooth on heavy pages. That
 * path is only available to a document that owns its own viewport, hence a real
 * WebView rather than a nested frame.
 *
 * The overlay is a sibling of the Tauri WebView, so the rectangles JS sends are
 * already in the same coordinate space — only CSS px -> device px scaling is
 * needed.
 */
/** Matches .desktop-preview-frame's border-radius in ArtifactPanel.svelte. */
private const val CARD_CORNER_RADIUS_DP = 10f

/** Event the host page listens on to learn the preview's current page scale. */
private const val SCALE_EVENT = "grengin-artifact-preview-scale"

@Keep
class NativeArtifactPreview(
    private val activity: MainActivity,
    private val hostWebView: WebView
) {
    private var preview: WebView? = null
    private var lastHtml: String? = null

    /**
     * Reports the preview page's own zoom state back to the host page.
     *
     * The host sizes the preview card from this, so the card grows as you pinch
     * and the frame keeps hugging the rendered page. Reported from inside the
     * preview document (visualViewport.scale) rather than from
     * WebViewClient.onScaleChanged, because that callback's units are
     * density-dependent while visualViewport.scale is in the same CSS-pixel terms
     * the host's layout maths uses.
     */
    @Keep
    inner class ScaleReporter {
        @JavascriptInterface
        fun report(scale: Float, contentWidth: Int, contentHeight: Int) {
            hostWebView.post {
                hostWebView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('$SCALE_EVENT'," +
                        "{detail:{scale:$scale,contentWidth:$contentWidth," +
                        "contentHeight:$contentHeight}}))",
                    null
                )
            }
        }
    }

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    /**
     * Show (creating if needed) the preview at a rect given in CSS pixels
     * relative to the host WebView's viewport.
     */
    @JavascriptInterface
    fun show(html: String, x: Double, y: Double, width: Double, height: Double, dpr: Double) {
        activity.runOnUiThread {
            val view = preview ?: createPreview()?.also { preview = it } ?: return@runOnUiThread
            applyRect(view, x, y, width, height, dpr)

            if (html != lastHtml) {
                lastHtml = html
                // No base URL: the artifact stays in an opaque origin, matching the
                // iframe's sandbox posture (scripts yes, same-origin no).
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
            }

            view.visibility = android.view.View.VISIBLE
        }
    }

    @JavascriptInterface
    fun setRect(x: Double, y: Double, width: Double, height: Double, dpr: Double) {
        activity.runOnUiThread {
            preview?.let { applyRect(it, x, y, width, height, dpr) }
        }
    }

    @JavascriptInterface
    fun hide() {
        activity.runOnUiThread {
            preview?.visibility = android.view.View.GONE
        }
    }

    /** Reset zoom to fit, mirroring the HTML preview's "fit" state. */
    @JavascriptInterface
    fun resetZoom() {
        activity.runOnUiThread {
            val view = preview ?: return@runOnUiThread
            val html = lastHtml ?: return@runOnUiThread
            // reload() does not re-fit a loadDataWithBaseURL document, so re-load
            // the content: with initial scale cleared, loadWithOverviewMode
            // recomputes the fit scale on the next layout.
            view.setInitialScale(0)
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        }
    }

    fun destroy() {
        activity.runOnUiThread {
            preview?.let { view ->
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
            preview = null
            lastHtml = null
        }
    }

    private fun applyRect(
        view: WebView,
        x: Double,
        y: Double,
        width: Double,
        height: Double,
        dpr: Double
    ) {
        val scale = if (dpr > 0) dpr else 1.0
        val params = view.layoutParams as? ViewGroup.MarginLayoutParams ?: return
        params.width = (width * scale).roundToInt().coerceAtLeast(1)
        params.height = (height * scale).roundToInt().coerceAtLeast(1)
        params.leftMargin = (x * scale).roundToInt() + hostWebView.left
        params.topMargin = (y * scale).roundToInt() + hostWebView.top
        view.layoutParams = params
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createPreview(): WebView? {
        val parent = hostWebView.parent as? ViewGroup ?: return null

        val view = WebView(activity)
        view.settings.apply {
            javaScriptEnabled = true
            // The three settings that give us native, GPU-composited pinch zoom.
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            // Lay the artifact out at a desktop width and zoom out to fit, which
            // is what the "desktop preview" mode means.
            useWideViewPort = true
            loadWithOverviewMode = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
        }
        view.setBackgroundColor(Color.WHITE)
        view.isVerticalScrollBarEnabled = false
        view.isHorizontalScrollBarEnabled = false
        view.overScrollMode = WebView.OVER_SCROLL_NEVER

        // A native view is not clipped by the HTML card's border-radius, so round
        // it here to match (.desktop-preview-frame uses 10px).
        val radiusPx = CARD_CORNER_RADIUS_DP * activity.resources.displayMetrics.density
        view.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(v: View, outline: Outline) {
                outline.setRoundRect(0, 0, v.width, v.height, radiusPx)
            }
        }
        view.clipToOutline = true

        view.addJavascriptInterface(ScaleReporter(), "GrenginPreviewReport")

        // Artifacts are inert previews: keep every navigation inside this view.
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean = true
        }

        val params = ViewGroup.MarginLayoutParams(1, 1)
        parent.addView(view, params)
        return view
    }
}
