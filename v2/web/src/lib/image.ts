/**
 * Compresion de imagenes en el navegador (canvas -> WebP).
 * Misma tuberia que storage-utils.js del v1: el cliente comprime y el
 * server v2 solo sube el base64 al bucket (public-assets).
 */
export async function compressImage(file: File, maxWidth: number, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('No se pudo comprimir la imagen');
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const IMAGE_KINDS = {
  logo: 512,
  banner: 1600,
  announcement: 1200,
} as const;
