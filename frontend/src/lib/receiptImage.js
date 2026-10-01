/**
 * receiptImage — makes a camera photo small enough to upload for a receipt
 * scan.
 *
 * A phone camera photo is 5–15 MB; the server accepts 5 MB (8 MB once
 * encoded), so full-size photos were refused before the receipt was even read.
 * A receipt is perfectly readable at 1600 px on the long side, which is a few
 * hundred KB as JPEG, and uploads in a second instead of half a minute.
 */

export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.82;
/** What the server accepts, decoded. A photo that could not be shrunk must still fit. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The size to draw at: the long side at most `maxSide`, proportions kept, never enlarged. */
export function fitWithin(width, height, maxSide = MAX_SIDE) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Bytes a base64 data URL decodes to (for checking against the server's limit). */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',').pop() || '';
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('read failed'));
  reader.readAsDataURL(file);
});

async function decode(file) {
  // Applies the photo's EXIF rotation, so a portrait receipt is not sent sideways.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File|Blob} file  the photo from the camera or gallery
 * @returns {Promise<string>} a JPEG data URL small enough for the scan endpoint
 * @throws {Error} with code 'IMAGE_TOO_LARGE' if it cannot be made small enough,
 *                 or 'IMAGE_UNREADABLE' if it is not a picture the phone can open
 */
export async function prepareReceiptImage(file) {
  let dataUrl = null;
  try {
    const source = await decode(file);
    const { width, height } = fitWithin(source.width, source.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(source, 0, 0, width, height);
    source.close?.();
    dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    // Could not shrink it (an unusual format): send the original if it fits.
    try { dataUrl = await readAsDataUrl(file); } catch { dataUrl = null; }
  }
  if (!dataUrl || !/^data:image\//.test(dataUrl)) {
    throw Object.assign(new Error("That file isn't a photo we can read. Please take a photo of the receipt."), { code: 'IMAGE_UNREADABLE' });
  }
  if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error('That photo is too large to scan. Please take a new photo of the receipt.'), { code: 'IMAGE_TOO_LARGE' });
  }
  return dataUrl;
}
