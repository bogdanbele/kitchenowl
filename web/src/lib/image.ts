/**
 * Getting a photograph of a page into a shape a model can read.
 *
 * A phone camera produces 3-4000px of JPEG, which is several megabytes and,
 * once base64'd, a large multiple of the tokens the text of a recipe is worth.
 * Downscaling costs nothing in accuracy — printed text at 1600px on the long
 * edge is comfortably legible — and turns a slow expensive request into a fast
 * cheap one.
 */

/** The long edge a photo is reduced to. Enough for print, small enough to send. */
export const MAX_EDGE = 1600;

/** Scaled dimensions, never scaled *up* — a small photo is left alone. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Rough decoded byte count of a data URL, for showing what is about to be sent. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * A File from a camera roll or a paste, as a downscaled JPEG data URL.
 *
 * JPEG rather than PNG deliberately: a photograph compresses an order of
 * magnitude better, and this is never a screenshot of text where PNG would win.
 */
export async function toDownscaledDataUrl(file: File, maxEdge = MAX_EDGE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser would not give a canvas to resize the photo.");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}

/** The first image on a clipboard event, or null. Photographing a page and
 *  pasting it is faster than saving the file and finding it again. */
export function imageFromClipboard(event: ClipboardEvent): File | null {
  for (const item of event.clipboardData?.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
