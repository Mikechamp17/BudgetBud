// Prepares a receipt photo for upload: long edge at most 1568 px, saved as JPEG (which also converts HEIC).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_EDGE = 1568;

/** The resize to apply, keeping the aspect ratio, or null when the image is already small enough. */
export function resizeFor(width: number, height: number, maxEdge = MAX_EDGE): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export async function prepareReceiptImage(uri: string, width: number, height: number) {
  const context = ImageManipulator.manipulate(uri);
  const resize = resizeFor(width, height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
}
