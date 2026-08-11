import { isTauriRuntime } from './tauri';

const NATIVE_SPEECH_EVENT = 'grengin-native-speech-result';
const NATIVE_SPEECH_VOLUME_EVENT = 'grengin-native-speech-volume';
const NATIVE_SPEECH_TIMEOUT_MS = 60_000;

export type NativeSpeechStatus = 'success' | 'error' | 'cancelled' | 'unavailable';

export interface NativeSpeechResult {
  status: NativeSpeechStatus;
  transcript?: string;
  error?: string;
}

export interface NativeSpeechVolume {
  level: number;
  rmsDb?: number;
}

interface NativeSpeechBridge {
  isAvailable?: () => boolean;
  start: (language?: string) => void;
  stop?: () => void;
  cancel?: () => void;
}

declare global {
  interface Window {
    GrenginSpeech?: NativeSpeechBridge;
  }
}

export function isNativeSpeechRecognitionAvailable(): boolean {
  if (!isTauriRuntime() || typeof window === 'undefined') {
    return false;
  }

  const bridge = window.GrenginSpeech;
  if (!bridge?.start) {
    return false;
  }

  try {
    return bridge.isAvailable?.() ?? true;
  } catch {
    return false;
  }
}

function normalizeNativeSpeechResult(detail: unknown): NativeSpeechResult {
  if (!detail || typeof detail !== 'object') {
    return { status: 'error', error: 'invalid_native_speech_result' };
  }

  const value = detail as Partial<NativeSpeechResult>;
  const status = value.status;

  if (
    status !== 'success' &&
    status !== 'error' &&
    status !== 'cancelled' &&
    status !== 'unavailable'
  ) {
    return { status: 'error', error: 'invalid_native_speech_status' };
  }

  return {
    status,
    transcript: typeof value.transcript === 'string' ? value.transcript : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
  };
}

function normalizeVolumeLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function startNativeSpeechRecognition(language = navigator.language || 'en-US'): Promise<NativeSpeechResult> {
  return new Promise((resolve) => {
    if (!isNativeSpeechRecognitionAvailable()) {
      resolve({ status: 'unavailable', error: 'native_speech_unavailable' });
      return;
    }

    const bridge = window.GrenginSpeech;
    if (!bridge) {
      resolve({ status: 'unavailable', error: 'native_speech_bridge_missing' });
      return;
    }

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: NativeSpeechResult) => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener(NATIVE_SPEECH_EVENT, handleResult);
      resolve(result);
    };

    const handleResult = (event: Event) => {
      settle(normalizeNativeSpeechResult((event as CustomEvent<unknown>).detail));
    };

    timeoutId = setTimeout(() => {
      bridge.cancel?.();
      settle({ status: 'error', error: 'native_speech_timeout' });
    }, NATIVE_SPEECH_TIMEOUT_MS);

    window.addEventListener(NATIVE_SPEECH_EVENT, handleResult);

    try {
      bridge.start(language);
    } catch (error) {
      settle({
        status: 'error',
        error: error instanceof Error ? error.message : 'native_speech_start_failed',
      });
    }
  });
}

export function stopNativeSpeechRecognition(): boolean {
  if (!isNativeSpeechRecognitionAvailable()) {
    return false;
  }

  window.GrenginSpeech?.stop?.();
  return true;
}

export function cancelNativeSpeechRecognition(): boolean {
  if (!isNativeSpeechRecognitionAvailable()) {
    return false;
  }

  window.GrenginSpeech?.cancel?.();
  return true;
}

export function subscribeNativeSpeechVolume(
  callback: (volume: NativeSpeechVolume) => void
): () => void {
  if (!isTauriRuntime() || typeof window === 'undefined') {
    return () => {};
  }

  const handleVolume = (event: Event) => {
    const detail = (event as CustomEvent<Partial<NativeSpeechVolume>>).detail;
    callback({
      level: normalizeVolumeLevel(detail?.level),
      rmsDb: typeof detail?.rmsDb === 'number' ? detail.rmsDb : undefined,
    });
  };

  window.addEventListener(NATIVE_SPEECH_VOLUME_EVENT, handleVolume);
  return () => window.removeEventListener(NATIVE_SPEECH_VOLUME_EVENT, handleVolume);
}
