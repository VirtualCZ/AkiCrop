/**
 * AkiCrop – Helper utilities: downscale for preview, color averaging, debounce.
 */

const MAX_PREVIEW_SIZE = 2048;

/**
 * Get width/height of an image, optionally downscaled so longest side <= maxSize.
 * Returns new dimensions and optionally a new ImageBitmap (for preview use).
 */
export function getDownscaledDimensions(
	source: ImageBitmap | HTMLImageElement,
	maxSize: number = MAX_PREVIEW_SIZE
): { width: number; height: number } {
	const w = source.width;
	const h = source.height;
	const longest = Math.max(w, h);
	if (longest <= maxSize) return { width: w, height: h };
	const scale = maxSize / longest;
	return {
		width: Math.round(w * scale),
		height: Math.round(h * scale)
	};
}

/**
 * Create a downscaled ImageBitmap for preview (max 2048 on longest side).
 * Caller should use createImageBitmap from the original blob for export.
 */
export async function downscaleForPreview(
	source: ImageBitmap | HTMLImageElement
): Promise<ImageBitmap> {
	const { width, height } = getDownscaledDimensions(source);
	if (source.width === width && source.height === height) {
		return source instanceof ImageBitmap ? source : await createImageBitmap(source);
	}
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(source, 0, 0, width, height);
	return createImageBitmap(canvas);
}

/**
 * Sample pixels along the four edges of the image and return average color as hex.
 */
export function calculateAverageEdgeColor(
	image: ImageBitmap | HTMLImageElement,
	sampleWidth: number = 20
): string {
	const w = image.width;
	const h = image.height;
	const canvas = new OffscreenCanvas(w, h);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(image, 0, 0);
	const band = Math.min(sampleWidth, Math.floor(Math.min(w, h) / 4));
	let r = 0,
		g = 0,
		b = 0,
		count = 0;

	try {
		// Top
		if (h > 0) {
			const top = ctx.getImageData(0, 0, w, Math.min(band, h));
			for (let i = 0; i < top.data.length; i += 4) {
				r += top.data[i];
				g += top.data[i + 1];
				b += top.data[i + 2];
				count++;
			}
		}
		// Bottom
		if (h > band) {
			const bottom = ctx.getImageData(0, h - band, w, band);
			for (let i = 0; i < bottom.data.length; i += 4) {
				r += bottom.data[i];
				g += bottom.data[i + 1];
				b += bottom.data[i + 2];
				count++;
			}
		}
		// Left
		if (w > 0) {
			const left = ctx.getImageData(0, 0, Math.min(band, w), h);
			for (let i = 0; i < left.data.length; i += 4) {
				r += left.data[i];
				g += left.data[i + 1];
				b += left.data[i + 2];
				count++;
			}
		}
		// Right
		if (w > band) {
			const right = ctx.getImageData(w - band, 0, band, h);
			for (let i = 0; i < right.data.length; i += 4) {
				r += right.data[i];
				g += right.data[i + 1];
				b += right.data[i + 2];
				count++;
			}
		}
	} catch {
		return '#808080';
	}

	if (count === 0) return '#808080';
	r = Math.round(r / count);
	g = Math.round(g / count);
	b = Math.round(b / count);
	return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Debounce a function (e.g. 16ms for live preview).
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), ms);
	};
}
