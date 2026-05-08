<script lang="ts">
	import { getCanvasDimensions, renderCanvas } from '$lib/renderer';
	import { debounce } from '$lib/utils';
	import { MAX_PREVIEW, MAX_ZOOM, ZOOM_RETURN_DURATION } from '$lib/constants';
	import type { BorderType } from '$lib/types';

	interface Props {
		viewportEl?: HTMLDivElement | null;
		previewImage: ImageBitmap | null;
		containerSize: { width: number; height: number };
		templateRatio: number;
		padding: number;
		borderType: BorderType;
		blurStrength: number;
		solidColor: string;
		fillMode: 'contain' | 'cover';
		onFile: (e: Event) => void;
	}
	let {
		viewportEl = $bindable(),
		previewImage,
		containerSize,
		templateRatio,
		padding,
		borderType,
		blurStrength,
		solidColor,
		fillMode,
		onFile
	}: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let canvasViewportEl = $state<HTMLDivElement | null>(null);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let panStartX = $state(0);
	let panStartY = $state(0);
	let panStartPanX = $state(0);
	let panStartPanY = $state(0);
	let isPanning = $state(false);
	let fitMode = $state(true);
	let zoomBounce = $state(false);
	let zoomReturnRaf = 0;
	let panBackRaf = 0;
	let zoomReturning = $state(false);
	let zoomReturningToMax = $state(false);
	let pinchActive = $state(false);
	let pinchInitialDist = $state(0);
	let pinchInitialZoom = $state(1);
	let zoomOriginX = $state(0);
	let zoomOriginY = $state(0);
	let lastPinchCenterX = 0;
	let lastPinchCenterY = 0;

	const basePreviewDims = $derived(
		previewImage
			? getCanvasDimensions(previewImage.width, previewImage.height, templateRatio, MAX_PREVIEW)
			: { width: 0, height: 0 }
	);
	const previewDims = $derived.by(() => {
		const base = basePreviewDims;
		if (base.width <= 0 || base.height <= 0) return base;
		const { width: cw, height: ch } = containerSize;
		if (cw <= 0 || ch <= 0) return base;
		const scale = Math.min(cw / base.width, ch / base.height, 1);
		return {
			width: Math.round(base.width * scale),
			height: Math.round(base.height * scale)
		};
	});
	const fitZoom = $derived.by(() => {
		if (previewDims.width <= 0 || previewDims.height <= 0 || containerSize.width <= 0 || containerSize.height <= 0) return 1;
		return Math.min(containerSize.width / previewDims.width, containerSize.height / previewDims.height);
	});
	const contentW = $derived(previewDims.width * zoom);
	const contentH = $derived(previewDims.height * zoom);
	const panBounds = $derived.by(() => {
		if (zoom < 1) return { minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 };
		const cw = containerSize.width;
		const ch = containerSize.height;
		const limit = Math.max(cw, ch, contentW, contentH) * 2;
		return { minPanX: -limit, maxPanX: limit, minPanY: -limit, maxPanY: limit };
	});
	function getFitPanTarget() {
		const cw = containerSize.width;
		const ch = containerSize.height;
		const cW = previewDims.width * zoom;
		const cH = previewDims.height * zoom;
		if (zoom < 1) {
			const slackX = Math.max(0, (cw - cW) / 2);
			const slackY = Math.max(0, (ch - cH) / 2);
			return {
				panX: Math.max(-slackX, Math.min(slackX, panX)),
				panY: Math.max(-slackY, Math.min(slackY, panY))
			};
		}
		const halfX = cW > cw ? (cW - cw) / 2 : 0;
		const halfY = cH > ch ? (cH - ch) / 2 : 0;
		return {
			panX: Math.max(-halfX, Math.min(halfX, panX)),
			panY: Math.max(-halfY, Math.min(halfY, panY))
		};
	}
	const canPan = $derived(zoom >= 1);
	const zoomPercent = $derived.by(() => {
		const raw = Math.round(zoom * 100);
		const fit = Math.round(fitZoom * 100);
		return Math.abs(zoom - fitZoom) < 0.005 ? 100 : raw;
	});

	function clampPan() {
		const b = panBounds;
		panX = Math.max(b.minPanX, Math.min(b.maxPanX, panX));
		panY = Math.max(b.minPanY, Math.min(b.maxPanY, panY));
	}
	function clampPanForZoom(_zoomValue: number) {
		// No-op during pinch; Fit mode animates back on release
	}

	const doRender = () => {
		if (!canvasEl || !previewImage || previewDims.width <= 0 || previewDims.height <= 0) return;
		renderCanvas(canvasEl, {
			image: previewImage,
			templateRatio,
			padding,
			borderType,
			blurStrength,
			solidColor,
			width: previewDims.width,
			height: previewDims.height,
			fillMode
		});
	};
	const debouncedRender = debounce(doRender, 16);

	$effect(() => {
		previewDims.width;
		previewDims.height;
		templateRatio;
		padding;
		blurStrength;
		solidColor;
		borderType;
		previewImage;
		fillMode;
		if (previewImage && canvasEl) debouncedRender();
	});

	function getTouchDist(touches: TouchList): number {
		if (touches.length < 2) return 0;
		return Math.hypot(
			touches[1].clientX - touches[0].clientX,
			touches[1].clientY - touches[0].clientY
		);
	}
	function easeOutCubic(t: number) {
		return 1 - (1 - t) ** 3;
	}
	function animatePanBackIntoView() {
		if (!fitMode) return;
		const target = getFitPanTarget();
		const startPanX = panX;
		const startPanY = panY;
		if (Math.abs(panX - target.panX) < 1 && Math.abs(panY - target.panY) < 1) return;
		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / 220);
			const e = easeOutCubic(t);
			panX = startPanX + (target.panX - startPanX) * e;
			panY = startPanY + (target.panY - startPanY) * e;
			if (t < 1) panBackRaf = requestAnimationFrame(tick);
			else {
				panX = target.panX;
				panY = target.panY;
				panBackRaf = 0;
			}
		};
		cancelAnimationFrame(panBackRaf);
		panBackRaf = requestAnimationFrame(tick);
	}
	function animateZoomBackTo100() {
		zoomReturning = true;
		const startZoom = zoom;
		const startPanX = panX;
		const startPanY = panY;
		const targetZoom = fitZoom;
		const rect = viewportEl?.getBoundingClientRect();
		const vcx = rect ? rect.left + rect.width / 2 : 0;
		const vcy = rect ? rect.top + rect.height / 2 : 0;
		const cx = lastPinchCenterX - vcx;
		const cy = lastPinchCenterY - vcy;
		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / ZOOM_RETURN_DURATION);
			const e = easeOutCubic(t);
			zoom = startZoom + (targetZoom - startZoom) * e;
			const r = zoom / startZoom;
			const pinchPanX = cx * (1 - r) + startPanX * r;
			const pinchPanY = cy * (1 - r) + startPanY * r;
			if (fitMode) {
				panX = pinchPanX * (1 - e);
				panY = pinchPanY * (1 - e);
			} else {
				panX = pinchPanX;
				panY = pinchPanY;
			}
			if (t < 1) zoomReturnRaf = requestAnimationFrame(tick);
			else {
				zoom = targetZoom;
				if (fitMode) {
					panX = 0;
					panY = 0;
				}
				zoomReturnRaf = 0;
				zoomReturning = false;
			}
		};
		cancelAnimationFrame(zoomReturnRaf);
		zoomReturnRaf = requestAnimationFrame(tick);
	}
	function animateZoomBackTo300() {
		zoomReturningToMax = true;
		const startZoom = zoom;
		const startPanX = panX;
		const startPanY = panY;
		const rect = viewportEl?.getBoundingClientRect();
		const vcx = rect ? rect.left + rect.width / 2 : 0;
		const vcy = rect ? rect.top + rect.height / 2 : 0;
		const cx = lastPinchCenterX - vcx;
		const cy = lastPinchCenterY - vcy;
		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / ZOOM_RETURN_DURATION);
			zoom = startZoom + (MAX_ZOOM - startZoom) * easeOutCubic(t);
			const r = zoom / startZoom;
			panX = cx * (1 - r) + startPanX * r;
			panY = cy * (1 - r) + startPanY * r;
			if (t < 1) zoomReturnRaf = requestAnimationFrame(tick);
			else {
				zoom = MAX_ZOOM;
				zoomReturnRaf = 0;
				zoomReturningToMax = false;
				if (fitMode) animatePanBackIntoView();
			}
		};
		cancelAnimationFrame(zoomReturnRaf);
		zoomReturnRaf = requestAnimationFrame(tick);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			cancelAnimationFrame(zoomReturnRaf);
			cancelAnimationFrame(panBackRaf);
			panBackRaf = 0;
			zoomReturnRaf = 0;
			zoomReturning = false;
			zoomReturningToMax = false;
			pinchActive = true;
			pinchInitialDist = getTouchDist(e.touches);
			pinchInitialZoom = zoom;
			zoomOriginX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			zoomOriginY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			lastPinchCenterX = zoomOriginX;
			lastPinchCenterY = zoomOriginY;
			panStartPanX = panX;
			panStartPanY = panY;
			isPanning = false;
		} else if (e.touches.length === 1) {
			panStartX = e.touches[0].clientX;
			panStartY = e.touches[0].clientY;
			panStartPanX = panX;
			panStartPanY = panY;
			isPanning = canPan;
		}
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && pinchInitialDist > 0) {
			e.preventDefault();
			isPanning = false;
			const dist = getTouchDist(e.touches);
			const scale = dist / pinchInitialDist;
			const rawZoom = pinchInitialZoom * scale;
			const newZoom = Math.max(0.25, Math.min(5, rawZoom));
			const pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			lastPinchCenterX = pinchCenterX;
			lastPinchCenterY = pinchCenterY;
			const dragDeltaX = pinchCenterX - zoomOriginX;
			const dragDeltaY = pinchCenterY - zoomOriginY;
			if (viewportEl) {
				const rect = viewportEl.getBoundingClientRect();
				const vcx = rect.left + rect.width / 2;
				const vcy = rect.top + rect.height / 2;
				const r = newZoom / pinchInitialZoom;
				panX = (1 - r) * (zoomOriginX - vcx) + r * panStartPanX + dragDeltaX;
				panY = (1 - r) * (zoomOriginY - vcy) + r * panStartPanY + dragDeltaY;
			}
			clampPanForZoom(newZoom);
			zoom = newZoom;
		} else if (e.touches.length === 1 && isPanning) {
			e.preventDefault();
			panX = panStartPanX + (e.touches[0].clientX - panStartX);
			panY = panStartPanY + (e.touches[0].clientY - panStartY);
			clampPan();
		}
	}
	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length === 0) {
			if (zoom < 1) animateZoomBackTo100();
			else if (zoom > MAX_ZOOM) animateZoomBackTo300();
			else if (fitMode) animatePanBackIntoView();
			pinchActive = false;
			pinchInitialDist = 0;
			isPanning = false;
		} else if (e.touches.length === 1) {
			panStartX = e.touches[0].clientX;
			panStartY = e.touches[0].clientY;
			panStartPanX = panX;
			panStartPanY = panY;
		}
	}
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 || !previewImage) return;
		if (!canPan) return;
		cancelAnimationFrame(panBackRaf);
		panBackRaf = 0;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		panStartX = e.clientX;
		panStartY = e.clientY;
		panStartPanX = panX;
		panStartPanY = panY;
		isPanning = true;
	}
	function onPointerMove(e: PointerEvent) {
		if (!isPanning) return;
		panX = panStartPanX + (e.clientX - panStartX);
		panY = panStartPanY + (e.clientY - panStartY);
		clampPan();
	}
	function onPointerUp(e: PointerEvent) {
		if (e.button === 0) {
			(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
			isPanning = false;
			if (fitMode) animatePanBackIntoView();
		}
	}

	function toggleFitMode() {
		fitMode = !fitMode;
		if (fitMode) animatePanBackIntoView();
	}
	function setZoom100() {
		zoom = fitZoom;
		panX = 0;
		panY = 0;
	}
	function zoomIn() {
		zoom = Math.min(MAX_ZOOM, zoom * 1.25);
	}
	function zoomOut() {
		if (zoom <= 1) {
			if (!zoomBounce) {
				zoomBounce = true;
				setTimeout(() => { zoomBounce = false; }, 400);
			}
			return;
		}
		zoom = Math.max(1, zoom / 1.25);
	}

	$effect(() => {
		if (!previewImage) return;
		zoom = fitZoom;
		panX = 0;
		panY = 0;
	});
	$effect(() => {
		zoom;
		containerSize.width;
		containerSize.height;
		previewDims.width;
		previewDims.height;
		if (zoomReturning || zoomReturningToMax || pinchActive) return;
		clampPan();
	});
</script>

<div
	bind:this={viewportEl}
	class="crop-viewport canvas-viewport"
	class:dropzone={!previewImage}
	class:canvas-interactive={!!previewImage}
	class:can-pan={!!previewImage && canPan}
	class:grabbing={!!previewImage && isPanning}
	ontouchstart={previewImage ? onTouchStart : undefined}
	ontouchmove={previewImage ? onTouchMove : undefined}
	ontouchend={previewImage ? onTouchEnd : undefined}
	ontouchcancel={previewImage ? onTouchEnd : undefined}
	onpointerdown={previewImage ? onPointerDown : undefined}
	onpointermove={previewImage ? onPointerMove : undefined}
	onpointerup={previewImage ? onPointerUp : undefined}
	onpointerleave={previewImage ? onPointerUp : undefined}
>
	{#if previewImage}
		<div
			bind:this={canvasViewportEl}
			class="canvas-zoom-wrap"
			class:can-pan={canPan}
			style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: center center;"
			class:grabbing={isPanning}
		>
			<div class="canvas-bounce-wrap" class:zoom-bounce={zoomBounce}>
				<canvas
					bind:this={canvasEl}
					class="canvas"
					width={previewDims.width}
					height={previewDims.height}
				></canvas>
			</div>
		</div>
	{:else}
		<div class="drop-message">
			<p>Drop an image or choose file</p>
			<label class="btn btn-secondary">
				<input type="file" accept="image/*" onchange={onFile} />
				Choose file
			</label>
		</div>
		<label class="drop-overlay">
			<input type="file" accept="image/*" onchange={onFile} />
		</label>
	{/if}
</div>

{#if previewImage}
	<footer class="zoom-bar">
		<div class="zoom-group">
			<button type="button" class="zoom-btn" class:selected={fitMode} onclick={toggleFitMode} title="Fit (keep image in view)">Fit</button>
		</div>
		<div class="zoom-group zoom-group-right">
			<button type="button" class="zoom-btn" onclick={setZoom100} title="100%">100%</button>
			<span class="zoom-pct">{zoomPercent}%</span>
			<button type="button" class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
			<button type="button" class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
		</div>
	</footer>
{/if}

<style>
	.crop-viewport {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.crop-viewport.dropzone {
		position: relative;
		align-items: center;
		justify-content: center;
		background: var(--bg-input);
		border: 2px dashed var(--border-subtle);
	}
	.crop-viewport.canvas-interactive {
		touch-action: none;
	}
	.crop-viewport.canvas-interactive.can-pan {
		cursor: grab;
	}
	.crop-viewport.canvas-interactive.can-pan.grabbing {
		cursor: grabbing;
	}
	.drop-message {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 24px;
		pointer-events: none;
	}
	.drop-message .btn {
		pointer-events: auto;
		position: relative;
	}
	.drop-message input[type="file"] {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
		overflow: hidden;
	}
	.drop-overlay {
		position: absolute;
		inset: 0;
		cursor: pointer;
	}
	.drop-overlay input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.canvas-zoom-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		will-change: transform;
		cursor: default;
	}
	.canvas-zoom-wrap.can-pan {
		cursor: grab;
	}
	.canvas-zoom-wrap.can-pan.grabbing {
		cursor: grabbing;
	}
	.canvas-bounce-wrap {
		transform: scale(1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.canvas-bounce-wrap.zoom-bounce {
		animation: zoomBounce 0.4s ease-out;
	}
	@keyframes zoomBounce {
		0% { transform: scale(1); }
		40% { transform: scale(0.97); }
		70% { transform: scale(1.02); }
		100% { transform: scale(1); }
	}
	.canvas {
		display: block;
		max-width: none;
		max-height: none;
	}
	.zoom-bar {
		width: 100%;
		height: var(--zoombar-height);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		padding: 0 8px;
		box-sizing: border-box;
		background: var(--bg-panel);
		border-top: 1px solid var(--border-subtle);
	}
	.zoom-group {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.zoom-group-right {
		margin-left: auto;
	}
	.zoom-btn {
		min-width: var(--touch-min);
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		background: var(--bg-input);
		color: var(--text-primary);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition: background 0.15s;
	}
	.zoom-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.zoom-btn.selected {
		border-color: var(--adobe-blue);
		background: rgba(59, 99, 251, 0.2);
		color: #a5b8ff;
	}
	.zoom-pct {
		min-width: 48px;
		text-align: center;
		font-size: var(--font-size-label);
		color: var(--text-secondary);
	}
</style>
