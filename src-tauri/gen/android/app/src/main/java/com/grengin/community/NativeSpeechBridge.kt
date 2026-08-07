package com.grengin.community

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.annotation.Keep
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale
import kotlin.math.pow

private const val NATIVE_SPEECH_EVENT = "grengin-native-speech-result"
private const val NATIVE_SPEECH_VOLUME_EVENT = "grengin-native-speech-volume"
private const val VOLUME_DISPATCH_INTERVAL_MS = 48L
private const val RMS_NOISE_FLOOR_DB = 1.5f
private const val RMS_FULL_SCALE_DB = 9.5f
internal const val NATIVE_SPEECH_PERMISSION_REQUEST_CODE = 4108

enum class NativeSpeechStatus(val wireValue: String) {
    Success("success"),
    Error("error"),
    Cancelled("cancelled"),
    Unavailable("unavailable")
}

@Keep
class NativeSpeechBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var pendingPermissionLanguage: String? = null
    private var lastVolumeDispatchAt = 0L

    @JavascriptInterface
    fun isAvailable(): Boolean {
        return SpeechRecognizer.isRecognitionAvailable(activity)
    }

    @JavascriptInterface
    fun start(language: String?) {
        activity.runOnUiThread {
            val locale = language?.takeIf { it.isNotBlank() } ?: Locale.getDefault().toLanguageTag()

            if (!hasRecordAudioPermission()) {
                pendingPermissionLanguage = locale
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.RECORD_AUDIO),
                    NATIVE_SPEECH_PERMISSION_REQUEST_CODE
                )
                return@runOnUiThread
            }

            startListening(locale)
        }
    }

    @JavascriptInterface
    fun stop() {
        activity.runOnUiThread {
            if (!isListening) {
                return@runOnUiThread
            }

            speechRecognizer?.stopListening()
        }
    }

    @JavascriptInterface
    fun cancel() {
        activity.runOnUiThread {
            val wasWaitingForPermission = pendingPermissionLanguage != null
            pendingPermissionLanguage = null

            if (!isListening) {
                if (wasWaitingForPermission) {
                    dispatch(NativeSpeechStatus.Cancelled)
                }
                return@runOnUiThread
            }

            speechRecognizer?.cancel()
            finishListening()
            dispatch(NativeSpeechStatus.Cancelled)
        }
    }

    fun onRecordAudioPermissionResult(granted: Boolean) {
        activity.runOnUiThread {
            val language = pendingPermissionLanguage
            pendingPermissionLanguage = null

            if (language.isNullOrBlank()) {
                return@runOnUiThread
            }

            if (!granted) {
                dispatch(NativeSpeechStatus.Error, error = "microphone_permission_denied")
                return@runOnUiThread
            }

            startListening(language)
        }
    }

    fun destroy() {
        activity.runOnUiThread {
            pendingPermissionLanguage = null
            speechRecognizer?.destroy()
            speechRecognizer = null
            finishListening()
        }
    }

    private fun startListening(language: String) {
        if (isListening) {
            dispatch(NativeSpeechStatus.Error, error = "recognizer_busy")
            return
        }

        if (!isAvailable()) {
            dispatch(NativeSpeechStatus.Unavailable, error = "speech_recognizer_unavailable")
            return
        }

        val recognizer = speechRecognizer ?: SpeechRecognizer.createSpeechRecognizer(activity).also {
            speechRecognizer = it
        }

        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) {
                dispatchVolume(rmsdB)
            }
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
            override fun onPartialResults(partialResults: Bundle?) = Unit

            override fun onError(error: Int) {
                finishListening()

                if (
                    error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                ) {
                    dispatch(NativeSpeechStatus.Cancelled)
                    return
                }

                dispatch(NativeSpeechStatus.Error, error = mapSpeechError(error))
            }

            override fun onResults(results: Bundle?) {
                finishListening()
                val transcript = results.extractTranscript()

                if (transcript.isNullOrBlank()) {
                    dispatch(NativeSpeechStatus.Error, error = "empty_transcript")
                    return
                }

                dispatch(NativeSpeechStatus.Success, transcript = transcript)
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }

        try {
            isListening = true
            recognizer.startListening(intent)
        } catch (error: Exception) {
            finishListening()
            dispatch(NativeSpeechStatus.Error, error = error.message ?: "speech_recognition_failed")
        }
    }

    private fun hasRecordAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun finishListening() {
        isListening = false
        dispatchVolumeLevel(0.0, 0.0)
    }

    private fun Bundle?.extractTranscript(): String? {
        @Suppress("DEPRECATION")
        return this
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            ?.trim()
    }

    private fun mapSpeechError(error: Int): String {
        return when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "audio_error"
            SpeechRecognizer.ERROR_CLIENT -> "client_error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "microphone_permission_denied"
            SpeechRecognizer.ERROR_NETWORK -> "network_error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network_timeout"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "recognizer_busy"
            SpeechRecognizer.ERROR_SERVER -> "server_error"
            else -> "speech_recognition_error_$error"
        }
    }

    private fun normalizeRmsLevel(rmsdB: Float): Double {
        val normalized = ((rmsdB - RMS_NOISE_FLOOR_DB) / (RMS_FULL_SCALE_DB - RMS_NOISE_FLOOR_DB))
            .coerceIn(0f, 1f)
            .toDouble()

        return normalized.pow(0.85)
    }

    private fun dispatchVolume(rmsdB: Float) {
        val now = System.currentTimeMillis()
        if (now - lastVolumeDispatchAt < VOLUME_DISPATCH_INTERVAL_MS) {
            return
        }

        lastVolumeDispatchAt = now
        dispatchVolumeLevel(normalizeRmsLevel(rmsdB), rmsdB.toDouble())
    }

    private fun dispatchVolumeLevel(level: Double, rmsDb: Double) {
        val detail = JSONObject()
            .put("level", level.coerceIn(0.0, 1.0))
            .put("rmsDb", rmsDb)

        val script = "window.dispatchEvent(new CustomEvent('$NATIVE_SPEECH_VOLUME_EVENT', { detail: $detail }));"
        webView.post {
            webView.evaluateJavascript(script, null)
        }
    }

    private fun dispatch(status: NativeSpeechStatus, transcript: String? = null, error: String? = null) {
        val detail = JSONObject()
            .put("status", status.wireValue)

        if (!transcript.isNullOrBlank()) {
            detail.put("transcript", transcript)
        }

        if (!error.isNullOrBlank()) {
            detail.put("error", error)
        }

        val script = "window.dispatchEvent(new CustomEvent('$NATIVE_SPEECH_EVENT', { detail: $detail }));"
        webView.post {
            webView.evaluateJavascript(script, null)
        }
    }
}
