// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

package com.grengin.community

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.annotation.Keep
import org.json.JSONObject
import java.util.concurrent.Executors

private const val NATIVE_ARTIFACT_DOWNLOAD_EVENT = "grengin-native-artifact-download"

private enum class NativeArtifactDownloadStatus(val wireValue: String) {
    Success("success"),
    Error("error"),
    Cancelled("cancelled")
}

private data class PendingArtifactDownload(
    val requestId: String,
    val content: String,
    val fileName: String,
    val mimeType: String
)

@Keep
class NativeArtifactDownloadBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private var pendingDownload: PendingArtifactDownload? = null

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun save(requestId: String, content: String, fileName: String, mimeType: String) {
        activity.runOnUiThread {
            if (pendingDownload != null) {
                dispatch(
                    requestId,
                    NativeArtifactDownloadStatus.Error,
                    sanitizeFileName(fileName),
                    "download_busy"
                )
                return@runOnUiThread
            }

            val download = PendingArtifactDownload(
                requestId = requestId,
                content = content,
                fileName = sanitizeFileName(fileName),
                mimeType = normalizeMimeType(mimeType)
            )
            pendingDownload = download

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToDownloads(download)
                return@runOnUiThread
            }

            try {
                activity.openArtifactDocument(download.fileName, download.mimeType)
            } catch (error: Exception) {
                complete(download, NativeArtifactDownloadStatus.Error, "document_picker_unavailable")
            }
        }
    }

    fun onDocumentResult(resultCode: Int, uri: Uri?) {
        val download = pendingDownload ?: return
        if (resultCode != Activity.RESULT_OK || uri == null) {
            complete(download, NativeArtifactDownloadStatus.Cancelled)
            return
        }

        writeDocument(download, uri)
    }

    fun destroy() {
        pendingDownload = null
        ioExecutor.shutdownNow()
    }

    private fun saveToDownloads(download: PendingArtifactDownload) {
        ioExecutor.execute {
            val resolver = activity.contentResolver
            var uri: Uri? = null

            try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, download.fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, download.mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: error("failed_to_create_download")
                resolver.openOutputStream(uri)?.writer(Charsets.UTF_8)?.use { writer ->
                    writer.write(download.content)
                } ?: error("failed_to_open_download")

                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                complete(download, NativeArtifactDownloadStatus.Success)
            } catch (error: Exception) {
                uri?.let { resolver.delete(it, null, null) }
                complete(download, NativeArtifactDownloadStatus.Error, "download_write_failed")
            }
        }
    }

    private fun writeDocument(download: PendingArtifactDownload, uri: Uri) {
        ioExecutor.execute {
            try {
                activity.contentResolver.openOutputStream(uri, "w")?.writer(Charsets.UTF_8)?.use { writer ->
                    writer.write(download.content)
                } ?: error("failed_to_open_document")
                complete(download, NativeArtifactDownloadStatus.Success)
            } catch (error: Exception) {
                complete(download, NativeArtifactDownloadStatus.Error, "download_write_failed")
            }
        }
    }

    private fun complete(
        download: PendingArtifactDownload,
        status: NativeArtifactDownloadStatus,
        error: String? = null
    ) {
        activity.runOnUiThread {
            if (pendingDownload?.requestId != download.requestId) return@runOnUiThread

            pendingDownload = null
            dispatch(download.requestId, status, download.fileName, error)
        }
    }

    private fun dispatch(
        requestId: String,
        status: NativeArtifactDownloadStatus,
        fileName: String,
        error: String? = null
    ) {
        val detail = JSONObject()
            .put("requestId", requestId)
            .put("status", status.wireValue)
            .put("fileName", fileName)
        if (!error.isNullOrBlank()) {
            detail.put("error", error)
        }

        val script = "window.dispatchEvent(new CustomEvent('$NATIVE_ARTIFACT_DOWNLOAD_EVENT', { detail: $detail }));"
        webView.post {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun normalizeMimeType(mimeType: String): String {
        return when (mimeType) {
            "text/html", "text/markdown" -> mimeType
            else -> "text/plain"
        }
    }

    private fun sanitizeFileName(fileName: String): String {
        val invalidCharacters = setOf('/', '\\', ':', '*', '?', '"', '<', '>', '|')
        return fileName
            .filterNot { it.isISOControl() || it in invalidCharacters }
            .trim()
            .take(160)
            .ifBlank { "artifact.html" }
    }
}
