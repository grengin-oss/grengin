const IMAGE_UPLOAD_MAX_DIMENSION_PX = 2048;
const IMAGE_UPLOAD_TARGET_MAX_BYTES = 1_500_000;
const IMAGE_UPLOAD_QUALITY_STEPS = [0.82, 0.74, 0.66] as const;
const SKIPPED_IMAGE_MIME_TYPES = new Set(['image/gif', 'image/svg+xml']);

function isImageCandidate(file: File): boolean {
  const type = file.type.toLowerCase();
  if (SKIPPED_IMAGE_MIME_TYPES.has(type)) return false;
  if (type.startsWith('image/')) return true;

  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|webp|bmp|heic|heif|tiff?|avif)$/.test(name);
}

function getOptimizedImageName(name: string): string {
  const baseName = name.replace(/\.[^/.]+$/, '');
  return `${baseName || 'image'}.jpg`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to decode image "${file.name}"`));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

async function encodeCompressedImage(canvas: HTMLCanvasElement): Promise<Blob | null> {
  let bestBlob: Blob | null = null;

  for (const quality of IMAGE_UPLOAD_QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) continue;

    bestBlob = blob;
    if (blob.size <= IMAGE_UPLOAD_TARGET_MAX_BYTES) {
      break;
    }
  }

  return bestBlob;
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isImageCandidate(file)) return file;

  try {
    const image = await loadImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return file;
    }

    const scale = Math.min(
      1,
      IMAGE_UPLOAD_MAX_DIMENSION_PX / Math.max(sourceWidth, sourceHeight),
    );
    const shouldResize = scale < 1;
    const shouldCompress = file.size > IMAGE_UPLOAD_TARGET_MAX_BYTES;

    if (!shouldResize && !shouldCompress) {
      return file;
    }

    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressedBlob = await encodeCompressedImage(canvas);
    if (!compressedBlob) return file;

    if (compressedBlob.size >= file.size && file.size <= IMAGE_UPLOAD_TARGET_MAX_BYTES) {
      return file;
    }

    return new File([compressedBlob], getOptimizedImageName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.warn('Failed to optimize image before upload:', error);
    return file;
  }
}
