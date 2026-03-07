<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { TEMPLATES, type TemplateId, type BorderType } from '$lib/types';
	import { downscaleForPreview, debounce } from '$lib/utils';
	import { getCanvasDimensions, renderCanvas } from '$lib/renderer';

	const MAX_PREVIEW = 2048;
	const INSTAGRAM_PORTRAIT_RATIO = 4 / 5; // width / height

	type AppMode = 'crop' | 'carousel';

	// Mode from URL only. Toggle is real <a> links so navigation updates $page and the UI.
	// Avoid url.searchParams during prerender (static build) — not available then
	const appMode = $derived.by(() => {
		if (typeof window === 'undefined') return 'crop' as AppMode;
		return ($page.url.searchParams.get('mode') === 'carousel' ? 'carousel' : 'crop') as AppMode;
	});

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let canvasWrapEl = $state<HTMLDivElement | null>(null);
	let canvasViewportEl = $state<HTMLDivElement | null>(null);
	let carouselStripEl = $state<HTMLDivElement | null>(null);
	let containerSize = $state({ width: 0, height: 0 });
	let previewImage = $state<ImageBitmap | null>(null);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let pinchInitialDist = $state(0);
	let pinchInitialZoom = $state(1);
	let zoomOriginX = $state(0);
	let zoomOriginY = $state(0);
	let panStartX = $state(0);
	let panStartY = $state(0);
	let panStartPanX = $state(0);
	let panStartPanY = $state(0);
	let isPanning = $state(false);
	let originalBlob = $state<Blob | null>(null);
	let originalWidth = $state(0);
	let originalHeight = $state(0);
	let selectedTemplateId = $state<TemplateId>('1:1');
	let customRatioW = $state(16);
	let customRatioH = $state(9);
	let borderType = $state<BorderType>('solid');
	let padding = $state(0);
	let blurStrength = $state(25);
	let solidColor = $state('#3b63fb');
	let loading = $state(false);
	let exportLoading = $state(false);

	// Carousel export preview popup: final panel images + download
	let exportPreviewOpen = $state(false);
	let exportPreviewPanels = $state<{ url: string; blob: Blob }[]>([]);

	const canUseShare = $derived(
		typeof navigator !== 'undefined' && typeof navigator.share === 'function'
	);

	// Carousel mode: independent image and panels (Instagram portrait strips)
	let carouselImage = $state<ImageBitmap | null>(null);
	let carouselOriginalBlob = $state<Blob | null>(null);
	let carouselOriginalWidth = $state(0);
	let carouselOriginalHeight = $state(0);
	let carouselPanelCountOverride = $state<number | null>(null); // null = auto from aspect
	let carouselError = $state<string | null>(null);
	let carouselZoom = $state(100); // 100 = fill frame; >100 zoom in (crop more), <100 zoom out
	let carouselNarrowImageWarning = $state(false); // image not wide enough for carousel

	const template = $derived(TEMPLATES.find((t) => t.id === selectedTemplateId)!);
	const templateRatio = $derived.by(() => {
		const t = template;
		if (t.id === 'original') return 0;
		if (t.id === 'custom') {
			const w = Math.max(0.1, customRatioW);
			const h = Math.max(0.1, customRatioH);
			return w / h;
		}
		return t.ratio;
	});

	// Carousel: auto = one fewer panel than "full fit"; user can pick 2..auto (no single panel, no more than auto)
	const carouselPanelCountAuto = $derived.by(() => {
		if (!carouselImage) return 2;
		const w = carouselImage.width;
		const h = carouselImage.height;
		const fit = Math.ceil((w / h) * (5 / 4));
		return Math.max(2, Math.min(20, fit - 1));
	});
	const carouselPanelCount = $derived.by(() => {
		const auto = carouselPanelCountAuto;
		if (carouselPanelCountOverride != null) return Math.max(2, Math.min(auto, carouselPanelCountOverride));
		return auto;
	});
	let panelsDropdownOpen = $state(false);

	// Strip padding and gap (must match .carousel-strip CSS) so total width fits container, no scrollbar
	const CAROUSEL_STRIP_PADDING = 24;
	const CAROUSEL_STRIP_GAP = 8;
	// Fixed panel size: fit inside container minus padding and gaps. Same size at all zoom levels.
	const carouselPanelDims = $derived.by(() => {
		const n = carouselPanelCount;
		if (n < 1) return { width: 0, height: 0 };
		const cw = containerSize.width;
		if (cw <= 0) return { width: 0, height: 0 };
		const availableWidth = cw - 2 * CAROUSEL_STRIP_PADDING - (n - 1) * CAROUSEL_STRIP_GAP;
		if (availableWidth <= 0) return { width: 0, height: 0 };
		const panelWidth = Math.floor(availableWidth / n);
		const panelHeight = Math.round(panelWidth / INSTAGRAM_PORTRAIT_RATIO);
		return { width: panelWidth, height: panelHeight };
	});

	// Zoom range: 100% = full width; max = zoom at which slice fills inner panel (after padding), then cover; nudge past so no sliver
	const carouselZoomMin = 100;
	const carouselZoomMax = $derived.by(() => {
		if (!carouselImage || carouselPanelCount < 1) return 200;
		const dims = carouselPanelDims;
		const innerW = dims.width - 2 * padding;
		const innerH = dims.height - 2 * padding;
		if (innerW <= 0 || innerH <= 0) return 200;
		const w = carouselImage.width;
		const h = carouselImage.height;
		const n = carouselPanelCount;
		// Fill when slice aspect = inner panel aspect: viewWidth/n / h = innerW/innerH => zoom% = 100*w*innerH/(n*h*innerW)
		const fillZoom = (100 * w * innerH) / (n * h * innerW);
		const nudge = Math.max(0.3, fillZoom * 0.005); // 0.5% past fill, minimal overshoot
		return Math.round(Math.max(100, Math.min(400, fillZoom + nudge)));
	});

	const basePreviewDims = $derived(
		previewImage
			? getCanvasDimensions(
					previewImage.width,
					previewImage.height,
					templateRatio,
					MAX_PREVIEW
				)
			: { width: 0, height: 0 }
	);
	// Scale preview to fit viewport so it never overflows (no scroll)
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

	// Free movement: pan bounds only when zoom < 1 (no pan). Fit mode animates back into view on release.
	const contentW = $derived(previewDims.width * zoom);
	const contentH = $derived(previewDims.height * zoom);
	const panBounds = $derived.by(() => {
		if (zoom < 1) return { minPanX: 0, maxPanX: 0, minPanY: 0, maxPanY: 0 };
		const cw = containerSize.width;
		const ch = containerSize.height;
		const limit = Math.max(cw, ch, contentW, contentH) * 2;
		return {
			minPanX: -limit,
			maxPanX: limit,
			minPanY: -limit,
			maxPanY: limit
		};
	});
	// Target pan so image is fully in view (no empty space) – used when Fit mode animates back
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

	const zoomPercent = $derived(Math.round(zoom * 100));

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
			height: previewDims.height
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
		if (previewImage && canvasEl) debouncedRender();
	});

	function renderCarouselPanels() {
		const strip = carouselStripEl;
		const img = carouselImage;
		const n = carouselPanelCount;
		const dims = carouselPanelDims;
		if (!strip || !img || n < 1 || dims.width <= 0) return;
		const w = img.width;
		const h = img.height;
		const zoomFactor = carouselZoom / 100;
		// 100% = full image width (letterbox top/bottom); >100% = zoom in and crop sides
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
			// Contain until slice fills height; then cover so we crop top/bottom instead of adding side borders
			const sliceAspect = sliceW / h;
			const fillMode = sliceAspect >= INSTAGRAM_PORTRAIT_RATIO ? 'contain' : 'cover';
			renderCanvas(c, {
				image: img,
				templateRatio: INSTAGRAM_PORTRAIT_RATIO,
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
	// Clamp zoom to range when image or max changes
	$effect(() => {
		const max = carouselZoomMax;
		const min = carouselZoomMin;
		if (carouselZoom > max) carouselZoom = max;
		if (carouselZoom < min) carouselZoom = min;
	});

	// Clamp panel override to [2, auto] when image/auto changes
	$effect(() => {
		const auto = carouselPanelCountAuto;
		if (carouselPanelCountOverride != null) {
			if (carouselPanelCountOverride > auto) carouselPanelCountOverride = auto;
			if (carouselPanelCountOverride < 2) carouselPanelCountOverride = 2;
		}
	});

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
		if (appMode === 'carousel' && carouselImage && carouselPanelCount > 0) debouncedCarouselRender();
	});

	// Measure canvas container so preview fits viewport (no overflow/scroll)
	$effect(() => {
		const el = canvasWrapEl;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
			containerSize = { width: Math.floor(width), height: Math.floor(height) };
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Carousel panels are drawn via sourceRect in renderCanvas (no createImageBitmap slices – avoids iPad errors)

	async function handleFile(file: File) {
		if (!file.type.startsWith('image/')) return;
		loading = true;
		if (appMode === 'carousel') carouselError = null;
		try {
			const blob = await file.arrayBuffer().then((b) => new Blob([b], { type: file.type }));
			const bitmap = await createImageBitmap(blob);
			if (appMode === 'crop') {
				originalBlob = blob;
				originalWidth = bitmap.width;
				originalHeight = bitmap.height;
				previewImage = await downscaleForPreview(bitmap);
				if (bitmap !== previewImage) bitmap.close();
			} else {
				carouselOriginalBlob = blob;
				carouselOriginalWidth = bitmap.width;
				carouselOriginalHeight = bitmap.height;
				carouselImage = await downscaleForPreview(bitmap);
				if (bitmap !== carouselImage) bitmap.close();
				// Warn if image isn't wide enough for a sensible 2-panel carousel (aspect >= 8/5)
				if (carouselOriginalWidth / carouselOriginalHeight < 8 / 5) {
					carouselNarrowImageWarning = true;
				}
			}
		} catch (e) {
			if (appMode === 'carousel') {
				carouselError = e instanceof Error ? e.message : 'Failed to load image';
			}
		} finally {
			loading = false;
		}
	}

	function dismissCarouselNarrowWarning() {
		carouselNarrowImageWarning = false;
	}

	function switchToCropModeWithCarouselImage() {
		if (!carouselImage || !carouselOriginalBlob) return;
		originalBlob = carouselOriginalBlob;
		originalWidth = carouselOriginalWidth;
		originalHeight = carouselOriginalHeight;
		previewImage = carouselImage;
		carouselImage = null;
		carouselOriginalBlob = null;
		carouselNarrowImageWarning = false;
		goto('?mode=crop');
	}

	function onInputChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
		input.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		const file = e.dataTransfer?.files?.[0];
		if (file) handleFile(file);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
	}

	async function download() {
		if (appMode === 'carousel') {
			if (!carouselOriginalBlob || !carouselImage || carouselPanelCount < 1) return;
			exportLoading = true;
			try {
				const bitmap = await createImageBitmap(carouselOriginalBlob);
				const w = bitmap.width;
				const h = bitmap.height;
				const n = carouselPanelCount;
				const zoomFactor = carouselZoom / 100;
				const viewWidth = zoomFactor <= 1 ? w : Math.max(0.001, w / zoomFactor);
				const viewLeft = zoomFactor <= 1 ? 0 : (w - viewWidth) / 2;
				const sliceW = viewWidth / n;
				const panels: { url: string; blob: Blob }[] = [];
				const exportDims = getCanvasDimensions(sliceW, h, INSTAGRAM_PORTRAIT_RATIO, undefined);
				const scale = exportDims.width / carouselPanelDims.width;
				const exportPadding = Math.round(padding * scale);
				for (let i = 0; i < n; i++) {
					const sx = viewLeft + i * sliceW;
					const sliceAspect = sliceW / h;
					const fillMode = sliceAspect >= INSTAGRAM_PORTRAIT_RATIO ? 'contain' : 'cover';
					const c = document.createElement('canvas');
					c.width = exportDims.width;
					c.height = exportDims.height;
					renderCanvas(c, {
						image: bitmap,
						templateRatio: INSTAGRAM_PORTRAIT_RATIO,
						padding: exportPadding,
						borderType,
						blurStrength,
						solidColor,
						width: exportDims.width,
						height: exportDims.height,
						sourceRect: { sx, sy: 0, sw: sliceW, sh: h },
						fillMode,
						zoom: 1
					});
					const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png', 1));
					if (blob) {
						panels.push({ url: URL.createObjectURL(blob), blob });
					}
				}
				bitmap.close();
				exportPreviewPanels = panels;
				exportPreviewOpen = true;
			} catch (e) {
				console.error('Carousel export failed:', e);
			}
			exportLoading = false;
			return;
		}
		// Crop mode
		if (!originalBlob || !previewImage) return;
		exportLoading = true;
		try {
			const bitmap = await createImageBitmap(originalBlob);
			const dims = getCanvasDimensions(
				bitmap.width,
				bitmap.height,
				templateRatio,
				undefined
			);
			const scale = dims.width / previewDims.width;
			const exportPadding = Math.round(padding * scale);
			const exportCanvas = document.createElement('canvas');
			exportCanvas.width = dims.width;
			exportCanvas.height = dims.height;
			renderCanvas(exportCanvas, {
				image: bitmap,
				templateRatio,
				padding: exportPadding,
				borderType,
				blurStrength,
				solidColor,
				width: dims.width,
				height: dims.height
			});
			bitmap.close();
			exportCanvas.toBlob(
				(blob) => {
					if (!blob) {
						exportLoading = false;
						return;
					}
					const filename = `akicrop-${Date.now()}.png`;
					const file = new File([blob], filename, { type: 'image/png' });
					if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
						navigator.share({ files: [file], title: 'AkiCrop', text: 'Exported image' })
							.then(() => { exportLoading = false; })
							.catch(() => {
								triggerDownloadFallback(blob, filename);
								exportLoading = false;
							});
						return;
					}
					triggerDownloadFallback(blob, filename);
					exportLoading = false;
				},
				'image/png',
				1
			);
		} catch (e) {
			exportLoading = false;
			console.error('Export failed:', e);
		}
	}

	function closeExportPreview() {
		exportPreviewPanels.forEach((p) => URL.revokeObjectURL(p.url));
		exportPreviewPanels = [];
		exportPreviewOpen = false;
	}

	function downloadExportPreviewPanels() {
		const delay = 300;
		exportPreviewPanels.forEach((p, i) => {
			setTimeout(() => triggerDownloadFallback(p.blob, `akicrop-panel-${i + 1}.png`), i * delay);
		});
	}

	async function shareExportPreviewPanels() {
		const files = exportPreviewPanels.map(
			(p, i) => new File([p.blob], `akicrop-panel-${i + 1}.png`, { type: 'image/png' })
		);
		try {
			if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
				throw new Error('Share is not supported in this browser.');
			}
			await navigator.share({ files });
		} catch (e) {
			const err = e as Error;
			if (err.name === 'AbortError') return;
			alert('Share failed: ' + (err.message || String(e)));
		}
	}

	async function shareExportPreviewPanel(panel: { url: string; blob: Blob }, index: number) {
		try {
			if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
			const file = new File([panel.blob], `akicrop-panel-${index + 1}.png`, { type: 'image/png' });
			await navigator.share({ files: [file] });
		} catch (e) {
			if ((e as Error).name !== 'AbortError') alert('Share failed: ' + ((e as Error).message || String(e)));
		}
	}


	function triggerDownloadFallback(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.getElementById('download-link') as HTMLAnchorElement;
		if (a) {
			a.href = url;
			a.download = filename;
			a.click();
		} else {
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			link.rel = 'noopener';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
		setTimeout(() => URL.revokeObjectURL(url), 500);
	}

	function onKeydown(e: KeyboardEvent) {
		if (exportPreviewOpen && e.key === 'Escape') {
			closeExportPreview();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			download();
		}
	}

	function setTemplate(id: TemplateId) {
		selectedTemplateId = id;
	}

	function setBorderType(type: BorderType) {
		borderType = type;
	}

	let fitMode = $state(true);
	function setZoomFit() {
		zoom = fitZoom;
	}
	function toggleFitMode() {
		fitMode = !fitMode;
		if (fitMode) {
			zoom = fitZoom;
			panX = 0;
			panY = 0;
		}
	}
	function setZoom100() {
		zoom = 1;
	}
	const MAX_ZOOM = 3;
	function zoomIn() {
		zoom = Math.min(MAX_ZOOM, zoom * 1.25);
	}
	function zoomOut() {
		if (zoom <= 1) {
			triggerZoomBounce();
			return;
		}
		zoom = Math.max(1, zoom / 1.25);
	}

	let zoomBounce = $state(false);
	function triggerZoomBounce() {
		if (zoomBounce) return;
		zoomBounce = true;
		setTimeout(() => {
			zoomBounce = false;
		}, 400);
	}
	function clampPan() {
		const b = panBounds;
		panX = Math.max(b.minPanX, Math.min(b.maxPanX, panX));
		panY = Math.max(b.minPanY, Math.min(b.maxPanY, panY));
	}
	// Use during pinch so we clamp with the zoom we're applying (derived panBounds lag by a tick)
	function clampPanForZoom(zoomValue: number) {
		if (zoomValue <= 1) return; // Don't zero pan during pinch – keep zoom relative to fingers
		// Free movement during gesture; Fit mode will animate back into view on release
	}

	let sliderActive = $state<'padding' | 'blur' | 'zoom' | null>(null);
	function setSliderActive(id: 'padding' | 'blur' | 'zoom' | null) {
		sliderActive = id;
	}

	function getTouchDist(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const a = touches[0];
		const b = touches[1];
		return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
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
			// Allow zoom past 300% during gesture; we snap back to 300% on release
			const newZoom = Math.max(0.25, Math.min(5, rawZoom));
			const pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			lastPinchCenterX = pinchCenterX;
			lastPinchCenterY = pinchCenterY;
			const dragDeltaX = pinchCenterX - zoomOriginX;
			const dragDeltaY = pinchCenterY - zoomOriginY;
			if (canvasWrapEl) {
				const rect = canvasWrapEl.getBoundingClientRect();
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

	const ZOOM_RETURN_DURATION = 220;
	let zoomReturnRaf = 0;
	let zoomReturning = $state(false);
	let zoomReturningToMax = $state(false);
	let pinchActive = $state(false);
	let lastPinchCenterX = 0;
	let lastPinchCenterY = 0;
	function easeOutCubic(t: number) {
		return 1 - (1 - t) ** 3;
	}
	function animateZoomBackTo100() {
		zoomReturning = true;
		const startZoom = zoom;
		const startPanX = panX;
		const startPanY = panY;
		const rect = canvasWrapEl?.getBoundingClientRect();
		const vcx = rect ? rect.left + rect.width / 2 : 0;
		const vcy = rect ? rect.top + rect.height / 2 : 0;
		const cx = lastPinchCenterX - vcx;
		const cy = lastPinchCenterY - vcy;
		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / ZOOM_RETURN_DURATION);
			const e = easeOutCubic(t);
			zoom = startZoom + (1 - startZoom) * e;
			const r = zoom / startZoom;
			const pinchPanX = cx * (1 - r) + startPanX * r;
			const pinchPanY = cy * (1 - r) + startPanY * r;
			if (fitMode) {
				// In Fit mode also ease pan to center so image ends centered at 100%
				panX = pinchPanX * (1 - e);
				panY = pinchPanY * (1 - e);
			} else {
				panX = pinchPanX;
				panY = pinchPanY;
			}
			if (t < 1) {
				zoomReturnRaf = requestAnimationFrame(tick);
			} else {
				zoom = 1;
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
		const rect = canvasWrapEl?.getBoundingClientRect();
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
			if (t < 1) {
				zoomReturnRaf = requestAnimationFrame(tick);
			} else {
				zoom = MAX_ZOOM;
				zoomReturnRaf = 0;
				zoomReturningToMax = false;
				if (fitMode) animatePanBackIntoView();
			}
		};
		cancelAnimationFrame(zoomReturnRaf);
		zoomReturnRaf = requestAnimationFrame(tick);
	}

	let panBackRaf = 0;
	const PAN_BACK_DURATION = 220;
	function animatePanBackIntoView() {
		if (!fitMode) return;
		const target = getFitPanTarget();
		const startPanX = panX;
		const startPanY = panY;
		if (Math.abs(panX - target.panX) < 1 && Math.abs(panY - target.panY) < 1) return;
		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / PAN_BACK_DURATION);
			const e = easeOutCubic(t);
			panX = startPanX + (target.panX - startPanX) * e;
			panY = startPanY + (target.panY - startPanY) * e;
			if (t < 1) {
				panBackRaf = requestAnimationFrame(tick);
			} else {
				panX = target.panX;
				panY = target.panY;
				panBackRaf = 0;
			}
		};
		cancelAnimationFrame(panBackRaf);
		panBackRaf = requestAnimationFrame(tick);
	}

	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length === 0) {
			if (zoom < 1) {
				animateZoomBackTo100();
			} else if (zoom > MAX_ZOOM) {
				animateZoomBackTo300();
			} else if (fitMode) {
				animatePanBackIntoView();
			}
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

	// Reset zoom/pan to fit when image loads (not on container resize – that caused effect loop)
	$effect(() => {
		if (!previewImage) return;
		zoom = fitZoom;
		panX = 0;
		panY = 0;
	});

	// Keep pan within bounds when zoom or viewport changes (skip while user is pinching or zoom-back animating)
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

<svelte:window onkeydown={onKeydown} onpointerup={() => setSliderActive(null)} />

<a id="download-link" class="download-link" href="#" download> </a>
<div class="app">
	<header class="topbar">
		<h1 class="topbar-title">AkiCrop</h1>
		<div class="topbar-mode" role="group" aria-label="Mode">
			<a href="?mode=crop" class="topbar-mode-btn" class:selected={appMode === 'crop'} title="Crop">Crop</a>
			<a href="?mode=carousel" class="topbar-mode-btn" class:selected={appMode === 'carousel'} title="Carousel">Carousel</a>
		</div>
		<button
			class="btn btn-primary"
			disabled={appMode === 'crop' ? !previewImage || exportLoading : !carouselImage || exportLoading}
			onclick={download}
			title={appMode === 'carousel' ? 'Export carousel' : 'Export (Ctrl+S)'}
		>
			{exportLoading ? 'Exporting…' : 'Export'}
		</button>
	</header>

	<div class="workspace">
		<div
			class="canvas-area"
			ondrop={onDrop}
			ondragover={onDragOver}
			role="region"
			aria-label={appMode === 'crop' ? 'Canvas' : 'Carousel'}
		>
			{#if appMode === 'crop'}
				<div
					bind:this={canvasWrapEl}
					class="canvas-viewport"
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
								<input type="file" accept="image/*" onchange={onInputChange} />
								Choose file
							</label>
						</div>
						<label class="drop-overlay">
							<input type="file" accept="image/*" onchange={onInputChange} />
						</label>
					{/if}
				</div>
				{#if previewImage}
					<footer class="zoom-bar">
						<button type="button" class="zoom-btn" class:selected={fitMode} onclick={toggleFitMode} title="Fit (keep image in view)">Fit</button>
						<button type="button" class="zoom-btn" onclick={setZoom100} title="100%">100%</button>
						<span class="zoom-pct">{zoomPercent}%</span>
						<button type="button" class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>
						<button type="button" class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>
					</footer>
				{/if}
			{:else}
				<div
					bind:this={canvasWrapEl}
					class="canvas-viewport"
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
								<input type="file" accept="image/*" onchange={onInputChange} />
								Choose file
							</label>
						</div>
						<label class="drop-overlay">
							<input type="file" accept="image/*" onchange={onInputChange} />
						</label>
					{/if}
				</div>
			{/if}

			{#if loading || exportLoading}
				<div class="spinner-overlay" aria-hidden="true">
					<div class="spinner"></div>
				</div>
			{/if}
		</div>

		<aside class="sidebar">
			<div class="sidebar-body">
				{#if appMode === 'crop'}
					<section class="control-group">
						<h2 class="control-label">Template</h2>
						<div class="template-row">
							{#each TEMPLATES as t}
								<button
									class="sidebar-btn"
									class:selected={selectedTemplateId === t.id}
									onclick={() => setTemplate(t.id)}
									type="button"
								>
									{t.label}
								</button>
							{/each}
						</div>
						{#if selectedTemplateId === 'custom'}
							<div class="custom-ratio-row">
								<label class="custom-ratio-label">
									<span>Width</span>
									<input
										type="number"
										class="custom-ratio-input"
										min="0.1"
										step="0.1"
										bind:value={customRatioW}
										aria-label="Aspect width"
									/>
								</label>
								<span class="custom-ratio-sep">∶</span>
								<label class="custom-ratio-label">
									<span>Height</span>
									<input
										type="number"
										class="custom-ratio-input"
										min="0.1"
										step="0.1"
										bind:value={customRatioH}
										aria-label="Aspect height"
									/>
								</label>
							</div>
						{/if}
					</section>
				{:else}
					<section class="control-group">
						<h2 class="control-label">Panels</h2>
						<div class="panel-dropdown-wrap">
							<button
								type="button"
								class="panel-dropdown-trigger sidebar-btn"
								aria-haspopup="listbox"
								aria-expanded={panelsDropdownOpen}
								aria-label="Number of panels"
								onclick={() => (panelsDropdownOpen = !panelsDropdownOpen)}
							>
								<span>{carouselPanelCountOverride === null ? `Auto (${carouselPanelCountAuto})` : carouselPanelCountOverride}</span>
								<span class="panel-dropdown-chevron" aria-hidden="true">▾</span>
							</button>
							{#if panelsDropdownOpen}
								<div
									class="panel-dropdown-backdrop"
									role="presentation"
									onclick={() => (panelsDropdownOpen = false)}
									ontouchstart={() => (panelsDropdownOpen = false)}
								></div>
								<div class="panel-dropdown-list" role="listbox">
									<button
										type="button"
										role="option"
										class="panel-dropdown-option"
										class:selected={carouselPanelCountOverride === null}
										onclick={() => {
											carouselPanelCountOverride = null;
											panelsDropdownOpen = false;
										}}
									>
										Auto ({carouselPanelCountAuto})
									</button>
									{#each Array.from({ length: carouselPanelCountAuto - 1 }, (_, i) => i + 2) as num}
										<button
											type="button"
											role="option"
											class="panel-dropdown-option"
											class:selected={carouselPanelCountOverride === num}
											onclick={() => {
												carouselPanelCountOverride = num;
												panelsDropdownOpen = false;
											}}
										>
											{num}
										</button>
									{/each}
								</div>
							{/if}
						</div>
						<p class="control-muted">{carouselPanelCount} Instagram portrait{carouselPanelCount !== 1 ? 's' : ''}</p>
					</section>
				{/if}

				<section class="control-group">
					<h2 class="control-label">Border</h2>
					<div class="border-type-row">
						<button
							class="sidebar-btn"
							class:selected={borderType === 'solid'}
							onclick={() => setBorderType('solid')}
							type="button"
						>
							Solid
						</button>
						<button
							class="sidebar-btn"
							class:selected={borderType === 'blur'}
							onclick={() => setBorderType('blur')}
							type="button"
						>
							Blur
						</button>
						<button
							class="sidebar-btn"
							class:selected={borderType === 'auto'}
							onclick={() => setBorderType('auto')}
							type="button"
						>
							Auto
						</button>
					</div>
				</section>

				{#if appMode === 'crop'}
					<section class="control-group">
						<div class="slider-label">
							<span>Padding</span>
							<span>{padding}px</span>
						</div>
						<div class="slider-wrap" class:slider-active={sliderActive === 'padding'} style="--pct: {(padding / 400) * 100}%">
							<input
								type="range"
								class="slider slider-adobe"
								min="0"
								max="400"
								bind:value={padding}
								aria-label="Padding"
								onpointerdown={() => setSliderActive('padding')}
								onpointerup={() => setSliderActive(null)}
								onpointerleave={() => setSliderActive(null)}
								ontouchstart={() => setSliderActive('padding')}
								ontouchend={() => setSliderActive(null)}
								ontouchcancel={() => setSliderActive(null)}
							/>
						</div>
					</section>
				{:else}
					<section class="control-group">
						<div class="slider-label">
							<span>Zoom</span>
							<span>{carouselZoom}%</span>
						</div>
						<div class="slider-wrap" class:slider-active={sliderActive === 'zoom'} style="--pct: {carouselZoomMax > carouselZoomMin ? ((carouselZoom - carouselZoomMin) / (carouselZoomMax - carouselZoomMin)) * 100 : 0}%">
							<input
								type="range"
								class="slider slider-adobe"
								min={carouselZoomMin}
								max={carouselZoomMax}
								bind:value={carouselZoom}
								aria-label="Zoom"
								onpointerdown={() => setSliderActive('zoom')}
								onpointerup={() => setSliderActive(null)}
								onpointerleave={() => setSliderActive(null)}
								ontouchstart={() => setSliderActive('zoom')}
								ontouchend={() => setSliderActive(null)}
								ontouchcancel={() => setSliderActive(null)}
							/>
						</div>
					</section>
				{/if}

				{#if borderType === 'blur'}
					<section class="control-group">
						<div class="slider-label">
							<span>Blur</span>
							<span>{blurStrength}%</span>
						</div>
						<div class="slider-wrap" class:slider-active={sliderActive === 'blur'} style="--pct: {blurStrength}%">
							<input
								type="range"
								class="slider slider-adobe"
								min="0"
								max="100"
								bind:value={blurStrength}
								aria-label="Blur"
								onpointerdown={() => setSliderActive('blur')}
								onpointerup={() => setSliderActive(null)}
								onpointerleave={() => setSliderActive(null)}
								ontouchstart={() => setSliderActive('blur')}
								ontouchend={() => setSliderActive(null)}
								ontouchcancel={() => setSliderActive(null)}
							/>
						</div>
					</section>
				{/if}

				{#if borderType === 'solid'}
					<section class="control-group">
						<div class="slider-label">Color</div>
						<div class="color-row">
							<input type="color" class="color-picker" bind:value={solidColor} />
							<input type="text" class="color-hex" bind:value={solidColor} placeholder="#ffffff" />
						</div>
					</section>
				{/if}
			</div>
		</aside>
	</div>

	{#if exportPreviewOpen}
		<div
			class="export-preview-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="Export preview"
			onclick={(e) => e.target === e.currentTarget && closeExportPreview()}
		>
			<div class="export-preview-box">
				<div class="export-preview-header">
					<h2 class="export-preview-title">Export preview</h2>
					<button
						type="button"
						class="export-preview-close"
						aria-label="Close"
						onclick={closeExportPreview}
					>
						×
					</button>
				</div>
				<div class="export-preview-strip">
					{#each exportPreviewPanels as panel, i}
						<div class="export-preview-panel">
							<img src={panel.url} alt="Panel {i + 1}" />
							{#if canUseShare}
								<button
									type="button"
									class="btn btn-primary export-preview-panel-share"
									onclick={() => shareExportPreviewPanel(panel, i)}
									title="Share this panel"
								>
									Share
								</button>
							{:else}
								<button
									type="button"
									class="btn btn-secondary export-preview-panel-dl"
									onclick={() => triggerDownloadFallback(panel.blob, `akicrop-panel-${i + 1}.png`)}
								>
									Download
								</button>
							{/if}
						</div>
					{/each}
				</div>
				<div class="export-preview-actions">
					<button
						type="button"
						class="btn btn-primary"
						onclick={shareExportPreviewPanels}
						title="Open system share sheet (e.g. AirDrop, Save to Files)"
					>
						Share
					</button>
					{#if !canUseShare}
						<button
							type="button"
							class="btn btn-primary"
							onclick={downloadExportPreviewPanels}
						>
							Download all
						</button>
					{/if}
					<button type="button" class="btn btn-secondary" onclick={closeExportPreview}>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if carouselNarrowImageWarning}
		<div
			class="export-preview-overlay narrow-warning-overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="narrow-warning-title"
		>
			<div class="narrow-warning-box">
				<h2 id="narrow-warning-title" class="narrow-warning-title">Image not wide enough for carousel</h2>
				<p class="narrow-warning-text">
					This image will be heavily cropped in carousel mode. You can continue anyway or switch to Crop mode to use it there instead.
				</p>
				<div class="narrow-warning-actions">
					<button type="button" class="btn btn-primary" onclick={dismissCarouselNarrowWarning}>
						Continue in Carousel
					</button>
					<button type="button" class="btn btn-secondary" onclick={switchToCropModeWithCarouselImage}>
						Switch to Crop mode
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.download-link {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.app {
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--bg-app);
		overflow: hidden;
	}

	.topbar {
		height: var(--topbar-height);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		gap: 12px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border-subtle);
	}

	.topbar-title {
		font-size: var(--font-size-title);
		font-weight: 600;
		margin: 0;
		color: var(--text-primary);
	}

	.topbar-mode {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--bg-input);
		border-radius: var(--radius);
		padding: 2px;
	}
	.topbar-mode-btn {
		display: inline-block;
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text-secondary);
		font-size: var(--font-size-label);
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.topbar-mode-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}
	.topbar-mode-btn.selected {
		background: var(--adobe-blue);
		color: white;
	}

	.workspace {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
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

	.canvas-area {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg-app);
		position: relative;
	}

	.canvas-viewport {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.canvas-viewport.dropzone {
		background: var(--bg-input);
		border: 2px dashed var(--border-subtle);
	}

	.canvas-viewport.canvas-interactive {
		touch-action: none;
	}

	.canvas-viewport.canvas-interactive.can-pan {
		cursor: grab;
	}

	.canvas-viewport.canvas-interactive.can-pan.grabbing {
		cursor: grabbing;
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
		height: var(--zoombar-height);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 12px;
		background: var(--bg-panel);
		border-top: 1px solid var(--border-subtle);
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

	.sidebar {
		width: var(--sidebar-width);
		flex-shrink: 0;
		background: var(--bg-panel);
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		-webkit-overflow-scrolling: touch;
	}

	.btn {
		min-height: 36px;
		padding: 8px 16px;
		border-radius: var(--radius);
		border: none;
		font-size: var(--font-size-ui);
		font-weight: 500;
		cursor: pointer;
		transition: filter 0.15s, background 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--adobe-blue);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.btn-secondary {
		background: var(--bg-input);
		color: var(--text-primary);
		border: 1px solid var(--border-subtle);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.btn-secondary input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
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

	.carousel-error {
		color: var(--error, #c00);
		font-size: 0.9rem;
		margin: 0;
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

	.spinner-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--adobe-blue);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.export-preview-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
		box-sizing: border-box;
	}
	.export-preview-box {
		background: var(--bg-panel);
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		max-width: 100%;
		max-height: calc(100vh - 48px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
	}
	.export-preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.export-preview-title {
		margin: 0;
		font-size: var(--font-size-title);
		font-weight: 600;
		color: var(--text-primary);
	}
	.export-preview-close {
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		border-radius: var(--radius);
		padding: 0;
	}
	.export-preview-close:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}
	.export-preview-strip {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		gap: 12px;
		padding: 24px;
		overflow-x: auto;
		overflow-y: hidden;
		justify-content: center;
		min-height: 0;
		flex: 1;
	}
	.export-preview-panel {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.export-preview-panel img {
		display: block;
		vertical-align: bottom;
		max-height: 50vh;
		width: auto;
		height: auto;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}
	.export-preview-panel-dl,
	.export-preview-panel-share {
		width: 100%;
	}
	.export-preview-actions {
		display: flex;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.narrow-warning-overlay {
		align-items: center;
		justify-content: center;
	}
	.narrow-warning-box {
		background: var(--bg-panel);
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		padding: 24px;
		max-width: 360px;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
	}
	.narrow-warning-title {
		margin: 0 0 12px;
		font-size: var(--font-size-title);
		font-weight: 600;
		color: var(--text-primary);
	}
	.narrow-warning-text {
		margin: 0 0 20px;
		font-size: var(--font-size-ui);
		color: var(--text-secondary);
		line-height: 1.4;
	}
	.narrow-warning-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.control-label {
		font-size: var(--font-size-label);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin: 0;
	}

	.control-muted {
		font-size: var(--font-size-ui);
		color: var(--text-secondary);
		margin: 0;
	}

	.panel-dropdown-wrap {
		position: relative;
	}
	.panel-dropdown-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.panel-dropdown-chevron {
		opacity: 0.7;
		font-size: 0.75em;
	}
	.panel-dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.panel-dropdown-list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 4px;
		padding: 4px;
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		background: var(--bg-elevated);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 11;
		max-height: 240px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.panel-dropdown-option {
		display: block;
		width: 100%;
		min-height: 32px;
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--text);
		font-size: var(--font-size-ui);
		text-align: left;
		cursor: pointer;
	}
	.panel-dropdown-option:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.panel-dropdown-option.selected {
		background: rgba(59, 99, 251, 0.2);
		color: #a5b8ff;
	}

	.template-row,
	.border-type-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.custom-ratio-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.custom-ratio-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-ui);
		color: var(--text-secondary);
	}
	.custom-ratio-label span {
		min-width: 2.5em;
	}
	.custom-ratio-input {
		width: 64px;
		min-height: 36px;
		padding: 6px 10px;
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		background: var(--bg-input);
		color: var(--text);
		font-size: var(--font-size-ui);
	}
	.custom-ratio-sep {
		color: var(--text-secondary);
		font-weight: 600;
	}

	.sidebar-btn {
		min-height: 36px;
		min-width: 44px;
		padding: 8px 12px;
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		background: var(--bg-input);
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.sidebar-btn:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	.sidebar-btn.selected {
		border-color: var(--adobe-blue);
		background: rgba(59, 99, 251, 0.2);
		color: #a5b8ff;
	}

	.slider-label {
		display: flex;
		justify-content: space-between;
		font-size: var(--font-size-label);
		color: var(--text-secondary);
	}

	.slider-wrap {
		--pct: 0%;
		--thumb-ring-inset: 2px;
		position: relative;
		width: 100%;
	}
	.slider-wrap.slider-active {
		--thumb-ring-inset: 7px;
	}

	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: var(--bg-input);
		outline: none;
		display: block;
	}

	/* Two segments: left of handle = light, right of handle = dark (no gradient blend) */
	.slider-adobe {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--track-light) 0%, var(--track-light) var(--pct), var(--track-dark) var(--pct), var(--track-dark) 100%);
		outline: none;
	}

	.slider-adobe::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: transparent;
	}

	.slider-adobe::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 22px;
		height: 22px;
		min-width: 22px;
		min-height: 22px;
		margin-top: -9px;
		border-radius: 50%;
		background: var(--bg-panel);
		border: none;
		/* One continuous inset ring (no outer track-light stroke = no seam) */
		box-shadow:
			inset 0 0 0 var(--thumb-ring-inset) var(--track-light),
			0 0 0 2px var(--bg-panel);
		cursor: pointer;
		outline: none;
		transition: box-shadow 0.2s ease-out;
	}

	.slider-adobe::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: transparent;
	}

	.slider-adobe::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--bg-panel);
		border: none;
		box-shadow:
			inset 0 0 0 var(--thumb-ring-inset) var(--track-light),
			0 0 0 2px var(--bg-panel);
		cursor: pointer;
		outline: none;
		transition: box-shadow 0.2s ease-out;
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.color-picker {
		width: 40px;
		height: 40px;
		padding: 0;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		cursor: pointer;
		background: var(--bg-input);
	}

	.color-hex {
		flex: 1;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		background: var(--bg-input);
		color: var(--text-primary);
		font-size: var(--font-size-ui);
		font-family: inherit;
	}

	@media (max-width: 767px) {
		.workspace {
			flex-direction: column;
		}

		.sidebar {
			width: 100%;
			max-height: 40vh;
			border-left: none;
			border-top: 1px solid var(--border-subtle);
		}
	}
</style>
