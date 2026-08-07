// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { isTauriRuntime } from './tauri';

const NATIVE_ARTIFACT_DOWNLOAD_EVENT = 'grengin-native-artifact-download';

type NativeArtifactDownloadStatus = 'success' | 'error' | 'cancelled';

export interface NativeArtifactDownloadResult {
  status: NativeArtifactDownloadStatus;
  fileName: string;
  error?: string;
}

interface NativeArtifactDownloadBridge {
  isAvailable(): boolean;
  save(requestId: string, content: string, fileName: string, mimeType: string): void;
}

interface NativeArtifactDownloadEvent extends NativeArtifactDownloadResult {
  requestId: string;
}

declare global {
  interface Window {
    GrenginArtifactDownload?: NativeArtifactDownloadBridge;
  }
}

function getBridge(): NativeArtifactDownloadBridge | null {
  if (!isTauriRuntime() || typeof window === 'undefined') return null;

  const bridge = window.GrenginArtifactDownload;
  if (!bridge) return null;

  try {
    return bridge.isAvailable() ? bridge : null;
  } catch {
    return null;
  }
}

function parseResult(detail: unknown, requestId: string): NativeArtifactDownloadResult | null {
  if (!detail || typeof detail !== 'object') return null;

  const value = detail as Partial<NativeArtifactDownloadEvent>;
  if (value.requestId !== requestId) return null;
  if (value.status !== 'success' && value.status !== 'error' && value.status !== 'cancelled') {
    return { status: 'error', fileName: '', error: 'invalid_native_download_status' };
  }

  return {
    status: value.status,
    fileName: typeof value.fileName === 'string' ? value.fileName : '',
    error: typeof value.error === 'string' ? value.error : undefined,
  };
}

export function saveNativeArtifact(
  content: string,
  fileName: string,
  mimeType: string,
): Promise<NativeArtifactDownloadResult | null> {
  const bridge = getBridge();
  if (!bridge) return Promise.resolve(null);

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const handleResult = (event: Event) => {
      const result = parseResult((event as CustomEvent<unknown>).detail, requestId);
      if (!result) return;

      window.removeEventListener(NATIVE_ARTIFACT_DOWNLOAD_EVENT, handleResult);
      resolve(result);
    };

    window.addEventListener(NATIVE_ARTIFACT_DOWNLOAD_EVENT, handleResult);
    try {
      bridge.save(requestId, content, fileName, mimeType);
    } catch (error) {
      window.removeEventListener(NATIVE_ARTIFACT_DOWNLOAD_EVENT, handleResult);
      resolve({
        status: 'error',
        fileName,
        error: error instanceof Error ? error.message : 'native_download_failed',
      });
    }
  });
}
