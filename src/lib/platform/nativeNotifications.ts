import { isTauriRuntime } from './tauri';

interface NativeNotificationOptions {
  id?: string;
  title: string;
  body?: string;
  group?: string;
}

let permissionRequest: Promise<boolean> | null = null;

function hashNotificationId(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (!isTauriRuntime() || typeof window === 'undefined') {
    return false;
  }

  if (permissionRequest) {
    return permissionRequest;
  }

  permissionRequest = (async () => {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        '@tauri-apps/plugin-notification'
      );

      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }

      return permissionGranted;
    } catch (error) {
      console.warn('Failed to request native notification permission:', error);
      return false;
    }
  })();

  try {
    return await permissionRequest;
  } finally {
    permissionRequest = null;
  }
}

export async function showNativeNotification(options: NativeNotificationOptions): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  const permissionGranted = await ensureNativeNotificationPermission();
  if (!permissionGranted) {
    return false;
  }

  try {
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    sendNotification({
      id: options.id ? hashNotificationId(options.id) : undefined,
      title: options.title,
      body: options.body,
      group: options.group,
    });
    return true;
  } catch (error) {
    console.warn('Failed to show native notification:', error);
    return false;
  }
}
