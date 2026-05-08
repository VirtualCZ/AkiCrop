<script lang="ts">
	import { getCanvasDimensions, renderCanvas } from '$lib/renderer';
	import { debounce } from '$lib/utils';
	import { STACK_PREVIEW_MAX, STACK_ZOOM_MIN, STACK_ZOOM_MAX, STACK_ZOOM_STEP } from '$lib/constants';
	import type { BorderType } from '$lib/types';

	interface StackImage {
		blob: Blob;
		preview: ImageBitmap;
	}

	const SWIPE_THRESHOLD = 60;
	const SWIPE_DRAG_CLAMP = 0.4;

	interface Props {
		viewportEl?: HTMLDivElement | null;
		stackImages: StackImage[];
		containerSize: { width: number; height: number };
		templateRatio: number;
		padding: number;
		borderType: BorderType;
		blurStrength: number;
		solidColor: string;
		fillMode: 'contain' | 'cover';
		onStackFiles: (e: Event) => void;
		removeStackImage: (index: number) => void;
		clearStack: () => void;
		moveStackImage: (index: number, dir: -1 | 1) => void;
	}
	let {
		viewportEl = $bindable(),
		stackImages,
		containerSize,
		templateRatio,
		padding,
		borderType,
		blurStrength,
		solidColor,
		fillMode,
		onStackFiles,
		removeStackImage,
		clearStack,
		moveStackImage
	}: Props = $props();

	let stackViewMode = $state<'list' | 'story'>('list');
	let stackStoryIndex = $state(0);
	let stackZoom = $state(1);
	let stackListEl = $state<HTMLDivElement | null>(null);
	let stackFileInputEl = $state<HTMLInputElement | null>(null);
	let stackStoryCanvasEl = $state<HTMLCanvasElement | null>(null);
	let stackSwipeCanvasLeft = $state<HTMLCanvasElement | null>(null);
	let stackSwipeCanvasCenter = $state<HTMLCanvasElement | null>(null);
	let stackSwipeCanvasRight = $state<HTMLCanvasElement | null>(null);
	let stackSwipeDragOffset = $state(0);
	let stackSwipePointerStart = $state<{ x: number; startOffset: number } | null>(null);
	let stackZoomHudVisible = $state(false);
	let stackZoomHudInitialized = false;
	let stackZoomHudTimeout: ReturnType<typeof setTimeout> | null = null;

	const stackStoryCurrentItem = $derived(
		stackImages.length > 0 ? stackImages[stackStoryIndex] ?? stackImages[0] : null
	);

	function getStackSwipeDims(item: StackImage) {
		if (!item || containerSize.width <= 0 || containerSize.height <= 0)
			return { width: 0, height: 0 };
		const base = getCanvasDimensions(
			item.preview.width,
			item.preview.height,
			templateRatio,
			undefined
		);
		const scale = Math.min(
			containerSize.width / base.width,
			containerSize.height / base.height,
			1
		);
		return {
			width: Math.round(base.width * scale),
			height: Math.round(base.height * scale)
		};
	}

	const stackStoryDims = $derived.by(() =>
		stackStoryCurrentItem ? getStackSwipeDims(stackStoryCurrentItem) : { width: 0, height: 0 }
	);

	function stackZoomIn() {
		stackZoom = Math.min(STACK_ZOOM_MAX, Math.round((stackZoom + STACK_ZOOM_STEP) * 100) / 100);
	}
	function stackZoomOut() {
		stackZoom = Math.max(STACK_ZOOM_MIN, Math.round((stackZoom - STACK_ZOOM_STEP) * 100) / 100);
	}
	function stackZoomReset() {
		stackZoom = 1;
	}
	function stackStoryPrev() {
		if (stackImages.length <= 1) return;
		stackStoryIndex = Math.max(0, stackStoryIndex - 1);
	}
	function stackStoryNext() {
		if (stackImages.length <= 1) return;
		stackStoryIndex = Math.min(stackImages.length - 1, stackStoryIndex + 1);
	}

	// List view: render cell canvases by index
	const debouncedStackRender = debounce(() => {
		if (!stackListEl || !stackImages.length) return;
		for (let i = 0; i < stackImages.length; i++) {
			const canvas = stackListEl.querySelector<HTMLCanvasElement>(`[data-stack-index="${i}"]`);
			const item = stackImages[i];
			if (!canvas || !item) continue;
			const dims = getCanvasDimensions(item.preview.width, item.preview.height, templateRatio, STACK_PREVIEW_MAX);
			if (dims.width <= 0 || dims.height <= 0) continue;
			renderCanvas(canvas, {
				image: item.preview,
				templateRatio,
				padding,
				borderType,
				blurStrength,
				solidColor,
				width: dims.width,
				height: dims.height,
				fillMode
			});
		}
	}, 16);

	$effect(() => {
		stackImages;
		templateRatio;
		padding;
		borderType;
		blurStrength;
		solidColor;
		fillMode;
		stackListEl;
		if (stackListEl && stackImages.length) debouncedStackRender();
	});

	$effect(() => {
		const n = stackImages.length;
		if (n === 0) return;
		if (stackStoryIndex >= n) stackStoryIndex = n - 1;
	});
	$effect(() => {
		stackZoom;
		if (!stackZoomHudInitialized) {
			stackZoomHudInitialized = true;
			return;
		}
		stackZoomHudVisible = true;
		if (stackZoomHudTimeout) clearTimeout(stackZoomHudTimeout);
		stackZoomHudTimeout = setTimeout(() => {
			stackZoomHudVisible = false;
			stackZoomHudTimeout = null;
		}, 700);
		return () => {
			if (stackZoomHudTimeout) {
				clearTimeout(stackZoomHudTimeout);
				stackZoomHudTimeout = null;
			}
		};
	});

	function renderStackSwipePanel(
		canvas: HTMLCanvasElement | null,
		item: StackImage | undefined,
		dims: { width: number; height: number }
	) {
		if (!canvas || !item || dims.width <= 0 || dims.height <= 0) return;
		renderCanvas(canvas, {
			image: item.preview,
			templateRatio,
			padding,
			borderType,
			blurStrength,
			solidColor,
			width: dims.width,
			height: dims.height,
			fillMode
		});
	}

	function renderAllStackSwipePanels() {
		if (stackViewMode !== 'story' || !stackImages.length) return;
		const idx = stackStoryIndex;
		const leftItem = idx > 0 ? stackImages[idx - 1] : null;
		const centerItem = stackImages[idx];
		const rightItem = idx < stackImages.length - 1 ? stackImages[idx + 1] : null;
		renderStackSwipePanel(stackSwipeCanvasLeft, leftItem ?? undefined, leftItem ? getStackSwipeDims(leftItem) : { width: 0, height: 0 });
		renderStackSwipePanel(stackSwipeCanvasCenter, centerItem, getStackSwipeDims(centerItem));
		renderStackSwipePanel(stackSwipeCanvasRight, rightItem ?? undefined, rightItem ? getStackSwipeDims(rightItem) : { width: 0, height: 0 });
	}

	const debouncedStackSwipeRender = debounce(renderAllStackSwipePanels, 16);

	$effect(() => {
		stackStoryIndex;
		stackImages;
		templateRatio;
		padding;
		borderType;
		blurStrength;
		solidColor;
		fillMode;
		stackSwipeCanvasLeft;
		stackSwipeCanvasCenter;
		stackSwipeCanvasRight;
		if (stackViewMode === 'story' && stackImages.length) {
			renderAllStackSwipePanels();
			debouncedStackSwipeRender();
		}
	});

	$effect(() => {
		stackStoryCurrentItem;
		stackStoryDims.width;
		stackStoryDims.height;
		templateRatio;
		padding;
		borderType;
		blurStrength;
		solidColor;
		fillMode;
		stackStoryCanvasEl;
		if (stackViewMode === 'story' && stackStoryCanvasEl && stackStoryCurrentItem && stackImages.length <= 1) {
			renderStackSwipePanel(stackStoryCanvasEl, stackStoryCurrentItem, stackStoryDims);
		}
	});

	function onStackStoryWheel(e: WheelEvent) {
		if (stackViewMode !== 'story' || stackImages.length <= 1) return;
		e.preventDefault();
		if (e.deltaY > 0) stackStoryNext();
		else if (e.deltaY < 0) stackStoryPrev();
	}

	function clampSwipeOffset(offset: number) {
		const cw = containerSize.width;
		const maxDrag = cw * SWIPE_DRAG_CLAMP;
		if (stackStoryIndex <= 0) return Math.min(0, Math.max(-maxDrag, offset));
		if (stackStoryIndex >= stackImages.length - 1) return Math.max(0, Math.min(maxDrag, offset));
		return Math.max(-maxDrag, Math.min(maxDrag, offset));
	}

	function onStackSwipePointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		stackSwipePointerStart = { x: e.clientX, startOffset: stackSwipeDragOffset };
	}
	function onStackSwipePointerMove(e: PointerEvent) {
		if (!stackSwipePointerStart) return;
		const raw = stackSwipePointerStart.startOffset + (e.clientX - stackSwipePointerStart.x);
		stackSwipeDragOffset = clampSwipeOffset(raw);
	}
	function onStackSwipePointerUp(e: PointerEvent) {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		const offset = stackSwipeDragOffset;
		stackSwipePointerStart = null;
		if (offset > SWIPE_THRESHOLD && stackStoryIndex > 0) stackStoryPrev();
		else if (offset < -SWIPE_THRESHOLD && stackStoryIndex < stackImages.length - 1) stackStoryNext();
		stackSwipeDragOffset = 0;
	}
	function onStackSwipeTouchStart(e: TouchEvent) {
		if (e.touches.length === 1)
			stackSwipePointerStart = { x: e.touches[0].clientX, startOffset: stackSwipeDragOffset };
	}
	function onStackSwipeTouchMove(e: TouchEvent) {
		if (!stackSwipePointerStart || e.touches.length !== 1) return;
		const raw = stackSwipePointerStart.startOffset + (e.touches[0].clientX - stackSwipePointerStart.x);
		stackSwipeDragOffset = clampSwipeOffset(raw);
	}
	function onStackSwipeTouchEnd(e: TouchEvent) {
		if (e.changedTouches.length !== 1) return;
		const offset = stackSwipeDragOffset;
		stackSwipePointerStart = null;
		if (offset > SWIPE_THRESHOLD && stackStoryIndex > 0) stackStoryPrev();
		else if (offset < -SWIPE_THRESHOLD && stackStoryIndex < stackImages.length - 1) stackStoryNext();
		stackSwipeDragOffset = 0;
	}
</script>

<div
	bind:this={viewportEl}
	class="canvas-viewport stack-viewport"
	class:dropzone={!stackImages.length}
	class:stack-story-view={stackViewMode === 'story' && stackImages.length > 0}
	onwheel={stackViewMode === 'story' && stackImages.length > 1 ? onStackStoryWheel : undefined}
>
	{#if stackImages.length}
		{#if stackViewMode === 'story'}
			{#if stackImages.length > 1}
				<div
					class="stack-swipe-track"
					style="transform: translateX({stackSwipeDragOffset}px); width: {containerSize.width * 3}px;"
					onpointerdown={onStackSwipePointerDown}
					onpointermove={onStackSwipePointerMove}
					onpointerup={onStackSwipePointerUp}
					onpointerleave={onStackSwipePointerUp}
					ontouchstart={onStackSwipeTouchStart}
					ontouchmove={onStackSwipeTouchMove}
					ontouchend={onStackSwipeTouchEnd}
					ontouchcancel={onStackSwipeTouchEnd}
				>
					<div class="stack-swipe-panel" style="width: {containerSize.width}px; height: {containerSize.height}px;">
						<canvas
							bind:this={stackSwipeCanvasLeft}
							class="stack-story-canvas"
							width={stackStoryIndex > 0 ? getStackSwipeDims(stackImages[stackStoryIndex - 1]).width : 0}
							height={stackStoryIndex > 0 ? getStackSwipeDims(stackImages[stackStoryIndex - 1]).height : 0}
						></canvas>
					</div>
					<div class="stack-swipe-panel" style="width: {containerSize.width}px; height: {containerSize.height}px;">
						<canvas
							bind:this={stackSwipeCanvasCenter}
							class="stack-story-canvas"
							width={stackStoryDims.width}
							height={stackStoryDims.height}
						></canvas>
					</div>
					<div class="stack-swipe-panel" style="width: {containerSize.width}px; height: {containerSize.height}px;">
						<canvas
							bind:this={stackSwipeCanvasRight}
							class="stack-story-canvas"
							width={stackStoryIndex < stackImages.length - 1 ? getStackSwipeDims(stackImages[stackStoryIndex + 1]).width : 0}
							height={stackStoryIndex < stackImages.length - 1 ? getStackSwipeDims(stackImages[stackStoryIndex + 1]).height : 0}
						></canvas>
					</div>
				</div>
				<div class="stack-story-nav" aria-label="Position">
					<button type="button" class="stack-story-arrow" onclick={stackStoryPrev} disabled={stackStoryIndex === 0} title="Previous">←</button>
					<span class="stack-story-counter">{stackStoryIndex + 1} / {stackImages.length}</span>
					<button type="button" class="stack-story-arrow" onclick={stackStoryNext} disabled={stackStoryIndex === stackImages.length - 1} title="Next">→</button>
				</div>
			{:else}
				<div class="stack-story-frame">
					<canvas
						bind:this={stackStoryCanvasEl}
						class="stack-story-canvas"
						width={stackStoryDims.width}
						height={stackStoryDims.height}
					></canvas>
				</div>
			{/if}
		{:else}
			<div class="stack-scroll">
				<div class="stack-zoom-wrap" style="transform: scale({stackZoom}); transform-origin: top center;">
					<div class="stack-list" bind:this={stackListEl}>
						{#each stackImages as item, i}
							<div class="stack-cell-wrap">
								<div class="stack-cell">
									<canvas
										class="stack-cell-canvas"
										data-stack-index={i}
										width={getCanvasDimensions(item.preview.width, item.preview.height, templateRatio, STACK_PREVIEW_MAX).width}
										height={getCanvasDimensions(item.preview.width, item.preview.height, templateRatio, STACK_PREVIEW_MAX).height}
									></canvas>
								</div>
								<div class="stack-cell-actions">
									<button type="button" class="stack-cell-btn" onclick={() => moveStackImage(i, -1)} disabled={i === 0} title="Move up">↑</button>
									<button type="button" class="stack-cell-btn" onclick={() => moveStackImage(i, 1)} disabled={i === stackImages.length - 1} title="Move down">↓</button>
									<button type="button" class="stack-cell-btn stack-cell-remove" onclick={() => removeStackImage(i)} title="Remove">×</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{:else}
		<div class="drop-message">
			<p>Add images to stack vertically</p>
			<label class="btn btn-secondary">
				<input type="file" accept="image/*" multiple bind:this={stackFileInputEl} onchange={onStackFiles} />
				Add images
			</label>
		</div>
		<label class="drop-overlay">
			<input type="file" accept="image/*" multiple onchange={onStackFiles} />
		</label>
	{/if}
</div>

{#if stackImages.length}
	<footer class="zoom-bar">
		<div class="zoom-group">
			<button type="button" class="zoom-btn" class:selected={stackViewMode === 'list'} onclick={() => (stackViewMode = 'list')} title="List view">List</button>
			<button type="button" class="zoom-btn" class:selected={stackViewMode === 'story'} onclick={() => (stackViewMode = 'story')} title="One at a time (drag to switch)">Swipe</button>
			<div class="zoom-subgroup">
				<label class="zoom-btn">
					<input type="file" accept="image/*" multiple onchange={onStackFiles} />
					Add
				</label>
				<button type="button" class="zoom-btn" onclick={clearStack}>Clear</button>
			</div>
		</div>
		{#if stackViewMode === 'list'}
			<div class="zoom-group zoom-group-zoom">
				<button type="button" class="zoom-btn" class:selected={stackZoom === 1} onclick={stackZoomReset} title="100%">100%</button>
				<span class="zoom-pct">{Math.round(stackZoom * 100)}%</span>
				<button type="button" class="zoom-btn" onclick={stackZoomOut} title="Zoom out">−</button>
				<button type="button" class="zoom-btn" onclick={stackZoomIn} title="Zoom in">+</button>
			</div>
		{/if}
	</footer>
{/if}
{#if stackImages.length && stackViewMode === 'list'}
	<div class="stack-zoom-hud" class:visible={stackZoomHudVisible} aria-hidden="true">
		{Math.round(stackZoom * 100)}%
	</div>
{/if}

<style>
	.stack-viewport {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-start;
		overflow: hidden;
	}
	.stack-viewport.dropzone {
		position: relative;
		align-items: center;
		justify-content: center;
		background: var(--bg-input);
		border: 2px dashed var(--border-subtle);
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
	/* Hide native file input; label shows "Add images" as a button, overlay handles full-area click */
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
	.stack-viewport.stack-story-view {
		position: relative;
		align-items: center;
		justify-content: center;
		touch-action: pan-y;
		overflow: hidden;
	}
	.stack-swipe-track {
		display: flex;
		flex-direction: row;
		flex-shrink: 0;
		height: 100%;
		cursor: grab;
	}
	.stack-swipe-track:active {
		cursor: grabbing;
	}
	.stack-swipe-panel {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.stack-story-frame {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
	.stack-story-canvas {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
	}
	.stack-story-nav {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		border-radius: var(--radius);
		background: rgba(0, 0, 0, 0.6);
	}
	.stack-story-arrow {
		width: 36px;
		height: 36px;
		border: none;
		border-radius: var(--radius);
		background: rgba(255, 255, 255, 0.15);
		color: var(--text-primary);
		font-size: 18px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.stack-story-arrow:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.25);
	}
	.stack-story-arrow:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.stack-story-counter {
		font-size: var(--font-size-label);
		color: var(--text-secondary);
		min-width: 3em;
		text-align: center;
	}
	.stack-scroll {
		flex: 1;
		min-height: 0;
		min-width: 0;
		width: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		-webkit-overflow-scrolling: touch;
	}
	.stack-zoom-wrap {
		display: block;
		width: 100%;
		padding: 24px;
		box-sizing: border-box;
	}
	.stack-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		box-sizing: border-box;
	}
	.stack-cell-wrap {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--bg-input);
		border-radius: var(--radius);
		padding: 12px;
		border: 1px solid var(--border-subtle);
	}
	.stack-cell {
		flex-shrink: 0;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
	}
	.stack-cell-canvas {
		display: block;
		vertical-align: bottom;
		max-width: 100%;
	}
	.stack-cell-actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-left: auto;
	}
	.stack-cell-btn {
		min-width: 36px;
		min-height: 32px;
		padding: 4px 8px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		background: var(--bg-panel);
		color: var(--text-primary);
		font-size: 14px;
		cursor: pointer;
		transition: background 0.15s;
	}
	.stack-cell-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
	}
	.stack-cell-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.stack-cell-remove {
		color: var(--error, #c66);
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
		flex-shrink: 0;
	}
	.zoom-subgroup {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: 10px;
		padding-left: 10px;
		border-left: 1px solid var(--border-subtle);
	}
	.zoom-group-zoom {
		margin-left: auto;
	}
	.zoom-bar label.zoom-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.zoom-bar input[type="file"] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
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
	.stack-zoom-hud {
		position: absolute;
		left: 50%;
		bottom: calc(var(--zoombar-height) + 10px);
		transform: translateX(-50%) translateY(6px);
		padding: 6px 10px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.65);
		color: var(--text-primary);
		font-size: var(--font-size-label);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease, transform 0.15s ease;
		z-index: 15;
	}
	.stack-zoom-hud.visible {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}
	@media (max-width: 767px) {
		.zoom-bar {
			height: 36px;
			gap: 6px;
			padding: 0 6px;
		}
		.zoom-group-zoom {
			display: none;
		}
		.zoom-bar .zoom-btn {
			min-width: 0;
			padding: 0 10px;
		}
		.stack-zoom-hud {
			display: block;
		}
	}
</style>
