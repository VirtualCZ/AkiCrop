/**
 * AkiCrop – Canvas rendering logic (no UI). Used for both preview and full-res export.
 */

import type { RenderOptions } from './types';
import { calculateAverageEdgeColor } from './utils';

/**
 * Compute canvas width/height from template ratio and image dimensions.
 * If maxSize is set (e.g. 2048), cap the longest side for preview.
 * If ratio is 0, use image aspect ratio.
 */
export function getCanvasDimensions(
	imageWidth: number,
	imageHeight: number,
	templateRatio: number,
	maxSize?: number
): { width: number; height: number } {
	const ratio = templateRatio > 0 ? templateRatio : imageWidth / imageHeight;
	// Canvas fits the image inside the aspect ratio (letterbox/pillarbox).
	let width: number, height: number;
	if (imageWidth / imageHeight > ratio) {
		width = imageWidth;
		height = Math.round(imageWidth / ratio);
	} else {
		height = imageHeight;
		width = Math.round(imageHeight * ratio);
	}
	if (maxSize != null && maxSize > 0) {
		const longest = Math.max(width, height);
		if (longest > maxSize) {
			const scale = maxSize / longest;
			width = Math.round(width * scale);
			height = Math.round(height * scale);
		}
	}
	return { width, height };
}

export function drawSolidBackground(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	hexColor: string
): void {
	ctx.fillStyle = hexColor;
	ctx.fillRect(0, 0, width, height);
}

/**
 * Separable box blur using getImageData/putImageData. Works in all browsers (Safari, PWA) where ctx.filter may not.
 */
function boxBlurCanvas(
	sourceCtx: CanvasRenderingContext2D,
	width: number,
	height: number,
	radius: number
): void {
	if (radius <= 0) return;
	// Cap radius so blur stays fast on large canvases (box blur is O(radius * width * height))
	const radiusI = Math.min(Math.floor(radius), 40);
	const data = sourceCtx.getImageData(0, 0, width, height);
	const src = data.data;
	const tmp = new Uint8ClampedArray(src.length);
	const n = 2 * radiusI + 1;
	const scale = 1 / n;

	// Horizontal pass
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0, g = 0, b = 0, a = 0;
			for (let k = -radiusI; k <= radiusI; k++) {
				const cx = Math.max(0, Math.min(width - 1, x + k));
				const i = (y * width + cx) << 2;
				r += src[i];
				g += src[i + 1];
				b += src[i + 2];
				a += src[i + 3];
			}
			const j = (y * width + x) << 2;
			tmp[j] = r * scale;
			tmp[j + 1] = g * scale;
			tmp[j + 2] = b * scale;
			tmp[j + 3] = a * scale;
		}
	}

	// Vertical pass (read from tmp, write to src)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0, g = 0, b = 0, a = 0;
			for (let k = -radiusI; k <= radiusI; k++) {
				const cy = Math.max(0, Math.min(height - 1, y + k));
				const i = (cy * width + x) << 2;
				r += tmp[i];
				g += tmp[i + 1];
				b += tmp[i + 2];
				a += tmp[i + 3];
			}
			const j = (y * width + x) << 2;
			src[j] = r * scale;
			src[j + 1] = g * scale;
			src[j + 2] = b * scale;
			src[j + 3] = a * scale;
		}
	}

	sourceCtx.putImageData(data, 0, 0);
}

/** Max size of the buffer we blur (downscale → blur → upscale for speed). */
const BLUR_BUFFER_MAX = 256;

/**
 * Draw image scaled to cover canvas, then blur.
 * Uses downscale → box blur → upscale so blur runs on a tiny buffer (much faster, same look).
 * When sourceRect is set, only that region of the image is used (e.g. carousel panel).
 */
export function drawBlurBackground(
	ctx: CanvasRenderingContext2D,
	image: ImageBitmap | HTMLImageElement,
	width: number,
	height: number,
	blurPx: number,
	sourceRect?: { sx: number; sy: number; sw: number; sh: number }
): void {
	let sx: number, sy: number, sw: number, sh: number;
	if (sourceRect) {
		sx = sourceRect.sx;
		sy = sourceRect.sy;
		sw = sourceRect.sw;
		sh = sourceRect.sh;
	} else {
		const iw = image.width;
		const ih = image.height;
		const cr = width / height;
		const ir = iw / ih;
		if (ir > cr) {
			sh = ih;
			sw = ih * cr;
			sx = (iw - sw) / 2;
			sy = 0;
		} else {
			sw = iw;
			sh = iw / cr;
			sx = 0;
			sy = (ih - sh) / 2;
		}
	}

	if (blurPx <= 0) {
		const cover = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(width, height);
		cover.width = width;
		cover.height = height;
		const coverCtx = cover.getContext('2d')!;
		coverCtx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
		ctx.drawImage(cover, 0, 0);
		return;
	}

	// Blur on a small buffer then scale up (big speedup, visually the same for a blurred bg)
	const longest = Math.max(width, height);
	const scaleDown = Math.min(1, BLUR_BUFFER_MAX / longest);
	const bw = Math.max(1, Math.round(width * scaleDown));
	const bh = Math.max(1, Math.round(height * scaleDown));
	const blurRadius = Math.max(1, Math.min(40, Math.round((blurPx * scaleDown))));

	const small = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(bw, bh);
	small.width = bw;
	small.height = bh;
	const smallCtx = small.getContext('2d')!;
	smallCtx.drawImage(image, sx, sy, sw, sh, 0, 0, bw, bh);
	boxBlurCanvas(smallCtx, bw, bh, blurRadius);
	ctx.drawImage(small, 0, 0, bw, bh, 0, 0, width, height);
}

/**
 * Draw foreground image inside (width - 2*padding) x (height - 2*padding).
 * contain = aspect-fit, centered, with borders; cover = zoom to fill, centered, crop overflow.
 * zoom multiplies the scale (e.g. carousel zoom slider). When sourceRect is set, only that region is drawn.
 */
export function drawForegroundImage(
	ctx: CanvasRenderingContext2D,
	image: ImageBitmap | HTMLImageElement,
	padding: number,
	width: number,
	height: number,
	sourceRect?: { sx: number; sy: number; sw: number; sh: number },
	fillMode: 'contain' | 'cover' = 'contain',
	zoom = 1
): void {
	const innerW = width - 2 * padding;
	const innerH = height - 2 * padding;
	if (innerW <= 0 || innerH <= 0) return;
	const iw = sourceRect ? sourceRect.sw : image.width;
	const ih = sourceRect ? sourceRect.sh : image.height;
	const baseScale = fillMode === 'cover'
		? Math.max(innerW / iw, innerH / ih)
		: Math.min(innerW / iw, innerH / ih);
	const scale = baseScale * zoom;
	const dw = iw * scale;
	const dh = ih * scale;
	const dx = padding + (innerW - dw) / 2;
	const dy = padding + (innerH - dh) / 2;
	if (fillMode === 'cover') {
		ctx.save();
		ctx.beginPath();
		ctx.rect(padding, padding, innerW, innerH);
		ctx.clip();
	}
	if (sourceRect) {
		ctx.drawImage(image, sourceRect.sx, sourceRect.sy, sourceRect.sw, sourceRect.sh, dx, dy, dw, dh);
	} else {
		ctx.drawImage(image, 0, 0, iw, ih, dx, dy, dw, dh);
	}
	if (fillMode === 'cover') ctx.restore();
}

/**
 * Main entry: render the full composition to the canvas.
 */
export function renderCanvas(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	options: RenderOptions
): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const { width, height, image, padding, borderType, blurStrength, solidColor, sourceRect, fillMode = 'contain', zoom = 1 } = options;

	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	let bgColor = solidColor;
	if (borderType === 'auto') {
		bgColor = calculateAverageEdgeColor(image);
	}

	if (borderType === 'blur') {
		const blurPx = (blurStrength / 100) * Math.min(width, height) * 0.2;
		drawBlurBackground(ctx, image, width, height, blurPx, sourceRect);
	} else {
		drawSolidBackground(ctx, width, height, bgColor);
	}

	drawForegroundImage(ctx, image, padding, width, height, sourceRect, fillMode, zoom);
}
