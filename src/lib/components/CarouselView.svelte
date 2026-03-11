<script lang="ts">
	import { getCanvasDimensions, renderCanvas } from '$lib/renderer';
	import { debounce } from '$lib/utils';

	interface Props {
		viewportEl?: HTMLDivElement | null;
		carouselImage: ImageBitmap | null;
		containerSize: { width: number; height: number };
		carouselPanelCount: number;
		carouselPanelDims: { width: number; height: number };
		carouselPanelRatio: number;
		carouselZoom: number;
		padding: number;
		borderType: 'auto' | 'blur' | 'solid';
		blurStrength: number;
		solidColor: string;
		carouselError: string | null;
		onFile: (e: Event) => void;
	}
	let {
		viewportEl = $bindable(),
		carouselImage,
		containerSize,
		carouselPanelCount,
		carouselPanelDims,
		carouselPanelRatio,
		carouselZoom,
		padding,
		borderType,
		blurStrength,
		solidColor,
		carouselError,
		onFile
	}: Props = $props();

	let carouselStripEl = $state<HTMLDivElement | null>(null);

	function renderCarouselPanels() {
		const strip = carouselStripEl;
		const img = carouselImage;
		const n = carouselPanelCount;
		const dims = carouselPanelDims;
		if (!strip || !img || n < 1 || dims.width <= 0) return;
		const w = img.width;
		const h = img.height;
		const zoomFactor = carouselZoom / 100;
		const viewWidth = zoomFactor <= 1 ? w : Math.max(0.001, w / zoomFactor);
		const viewLeft = zoomFactor <= 1 ? 0 : (w - viewWidth) / 2;
		const sliceW = viewWidth / n;
		const canvases = strip.querySelectorAll<HTMLCanvasElement>('canvas');
		for (let i = 0; i < n; i++) {
			const c = canvases[i];
			if (!c) continue;
			if (c.width !== dims.width || c.height !== dims.height) {
				c.width = dims.width;
				c.height = dims.height;
			}
			const sx = viewLeft + i * sliceW;
			const sliceAspect = sliceW / h;
			const fillMode = sliceAspect >= carouselPanelRatio ? 'contain' : 'cover';
			renderCanvas(c, {
				image: img,
				templateRatio: carouselPanelRatio,
				padding,
				borderType,
				blurStrength,
				solidColor,
				width: dims.width,
				height: dims.height,
				sourceRect: { sx, sy: 0, sw: sliceW, sh: h },
				fillMode,
				zoom: 1
			});
		}
	}

	const debouncedCarouselRender = debounce(renderCarouselPanels, 16);

	$effect(() => {
		carouselImage;
		carouselPanelCount;
		carouselPanelDims;
		padding;
		carouselZoom;
		borderType;
		blurStrength;
		solidColor;
		carouselStripEl;
		if (carouselImage && carouselPanelCount > 0) debouncedCarouselRender();
	});
</script>

<div
	bind:this={viewportEl}
	class="carousel-viewport canvas-viewport"
	class:dropzone={!carouselImage}
>
	{#if carouselImage}
		<div class="carousel-strip" bind:this={carouselStripEl}>
			{#each carouselPanelCount > 0 ? Array(carouselPanelCount) : [] as _, i}
				<div class="carousel-panel-wrap">
					<canvas
						class="carousel-panel-canvas"
						width={carouselPanelDims.width}
						height={carouselPanelDims.height}
					></canvas>
				</div>
			{/each}
		</div>
	{:else}
		<div class="drop-message">
			<p>Drop a wide image to split into portraits</p>
			{#if carouselError}
				<p class="carousel-error">{carouselError}</p>
			{/if}
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

<style>
	.carousel-viewport {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.carousel-viewport.dropzone {
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
	.carousel-error {
		color: var(--error, #c00);
		font-size: 0.9rem;
		margin: 0;
	}
	.carousel-strip {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		padding: 24px;
		min-height: 100%;
		overflow-x: hidden;
		overflow-y: auto;
		box-sizing: border-box;
		max-width: 100%;
	}
	.carousel-panel-wrap {
		flex-shrink: 0;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
	}
	.carousel-panel-canvas {
		display: block;
		vertical-align: bottom;
	}
</style>
