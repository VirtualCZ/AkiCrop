<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { TEMPLATES, type TemplateId, type BorderType } from '$lib/types';
	import { downscaleForPreview, debounce } from '$lib/utils';
	import { getCanvasDimensions, renderCanvas } from '$lib/renderer';
	import {
		MAX_PREVIEW,
		CAROUSEL_DEFAULT_RATIO,
		STACK_PREVIEW_MAX,
		EXPORT_STACK_WIDTH,
		CAROUSEL_STRIP_PADDING,
		CAROUSEL_STRIP_GAP,
		ASPECT_POPUP_ROWS,
		ASPECT_POPUP_THUMB_SIZE,
		type AppMode
	} from '$lib/constants';
	import { Topbar, ExportPreview, AspectRatioPopup, NarrowImageWarning, StackView, CarouselView, CropView } from '$lib/components';

	// Mode from URL only. Toggle is real <a> links so navigation updates $page and the UI.
	// Avoid url.searchParams during prerender (static build) — not available then
	const appMode = $derived.by(() => {
		if (typeof window === 'undefined') return 'crop' as AppMode;
		const mode = $page.url.searchParams.get('mode');
		if (mode === 'carousel') return 'carousel' as AppMode;
		if (mode === 'stack') return 'stack' as AppMode;
		return 'crop' as AppMode;
	});

	let canvasWrapEl = $state<HTMLDivElement | null>(null);
	let containerSize = $state({ width: 0, height: 0 });
	let previewImage = $state<ImageBitmap | null>(null);
	let originalBlob = $state<Blob | null>(null);
	let originalWidth = $state(0);
	let originalHeight = $state(0);
	let cropSelectedTemplateId = $state<TemplateId>('1:1');
	let carouselSelectedTemplateId = $state<TemplateId>('4:5');
	let stackSelectedTemplateId = $state<TemplateId>('1:1');
	let customRatioW = $state(16);
	let customRatioH = $state(9);
	let borderType = $state<BorderType>('auto');
	let padding = $state(0);
	let blurStrength = $state(25);
	let solidColor = $state('#3b63fb');
	let loading = $state(false);
	let exportLoading = $state(false);

	// Export preview popup (carousel or stack): final panel images + download/share
	let exportPreviewOpen = $state(false);
	let exportPreviewPanels = $state<{ url: string; blob: Blob }[]>([]);
	/** Set when opening preview so filenames use akicrop-stack-N vs akicrop-panel-N */
	let exportPreviewKind = $state<'carousel' | 'stack' | null>(null);

	// Aspect ratio popup (after add image or "More ratios…")
	let aspectRatioPopupOpen = $state(false);
	let aspectPopupContentEl = $state<HTMLDivElement | null>(null);
	/** Pending selection in popup; applied to canvas only on Confirm or double-click. */
	let aspectPopupPendingTemplateId = $state<TemplateId | null>(null);
	let aspectPopupFocusOnce = $state(false);
	// Fill = cover (zoom to fill), Fit = contain (letterbox). Shared by Crop, popup previews, Carousel, Stack.
	let fillMode = $state<'contain' | 'cover'>('contain');

	const canUseShare = $derived(
		typeof navigator !== 'undefined' && typeof navigator.share === 'function'
	);

	/** Sidebar tools are disabled until the current mode has an image. */
	const sidebarHasImage = $derived.by(() => {
		if (appMode === 'crop') return !!previewImage;
		if (appMode === 'stack') return stackImages.length > 0;
		return !!carouselImage;
	});

	/** Image used for aspect-ratio popup thumbnails and Original ratio: Crop/Carousel use current image; Stack uses first image. */
	const aspectPopupImage = $derived.by(() => {
		if (appMode === 'crop') return previewImage;
		if (appMode === 'carousel') return carouselImage;
		if (appMode === 'stack' && stackImages.length > 0) return stackImages[0].preview;
		return previewImage || carouselImage;
	});

	// Carousel mode: independent image and panels (Instagram portrait strips)
	let carouselImage = $state<ImageBitmap | null>(null);
	let carouselOriginalBlob = $state<Blob | null>(null);
	let carouselOriginalWidth = $state(0);
	let carouselOriginalHeight = $state(0);
	let carouselPanelCountOverride = $state<number | null>(null); // null = auto from aspect
	let carouselError = $state<string | null>(null);
	let carouselZoom = $state(100); // 100 = fill frame; >100 zoom in (crop more), <100 zoom out
	let carouselNarrowImageWarning = $state(false); // image not wide enough for carousel

	// Stack mode: ordered list of images, one aspect ratio for all
	type StackImage = { blob: Blob; preview: ImageBitmap };
	let stackImages = $state<StackImage[]>([]);
	/** Template selection is per mode so changing aspect in crop doesn't affect carousel/stack. */
	const currentTemplateId = $derived.by(() =>
		appMode === 'crop' ? cropSelectedTemplateId : appMode === 'carousel' ? carouselSelectedTemplateId : stackSelectedTemplateId
	);
	const template = $derived(TEMPLATES.find((t) => t.id === currentTemplateId)!);

	function getTemplateRatioFor(id: TemplateId): number {
		const t = TEMPLATES.find((x) => x.id === id);
		if (!t || t.id === 'original') return 0;
		if (t.id === 'custom') {
			const w = Math.max(0.1, customRatioW);
			const h = Math.max(0.1, customRatioH);
			return w / h;
		}
		return t.ratio;
	}

	const cropTemplateRatio = $derived.by(() => getTemplateRatioFor(cropSelectedTemplateId) || 0);
	const carouselTemplateRatio = $derived.by(() => {
		const r = getTemplateRatioFor(carouselSelectedTemplateId);
		return r > 0 ? r : CAROUSEL_DEFAULT_RATIO;
	});
	const stackTemplateRatio = $derived.by(() => getTemplateRatioFor(stackSelectedTemplateId) || 0);

	const carouselPanelRatio = $derived(carouselTemplateRatio);

	// Carousel: auto = one fewer panel than "full fit"; user can pick 2..auto (no single panel, no more than auto)
	const carouselPanelCountAuto = $derived.by(() => {
		if (!carouselImage) return 2;
		const w = carouselImage.width;
		const h = carouselImage.height;
		const r = carouselPanelRatio;
		const fit = Math.ceil((w / h) * (1 / r));
		return Math.max(2, Math.min(20, fit - 1));
	});
	const carouselPanelCount = $derived.by(() => {
		const auto = carouselPanelCountAuto;
		if (carouselPanelCountOverride != null) return Math.max(2, Math.min(auto, carouselPanelCountOverride));
		return auto;
	});
	let panelsDropdownOpen = $state(false);

	// Fixed panel size: fit inside container minus padding and gaps. Same size at all zoom levels.
	const carouselPanelDims = $derived.by(() => {
		const n = carouselPanelCount;
		if (n < 1) return { width: 0, height: 0 };
		const cw = containerSize.width;
		if (cw <= 0) return { width: 0, height: 0 };
		const availableWidth = cw - 2 * CAROUSEL_STRIP_PADDING - (n - 1) * CAROUSEL_STRIP_GAP;
		if (availableWidth <= 0) return { width: 0, height: 0 };
		const panelWidth = Math.floor(availableWidth / n);
		const panelHeight = Math.round(panelWidth / carouselPanelRatio);
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
					cropTemplateRatio,
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

	// previewDims kept for crop export (scale in download())

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

	// In Carousel, "Original" isn't meaningful (panels are slices); normalize to 4:5
	$effect(() => {
		if (carouselSelectedTemplateId === 'original') {
			carouselSelectedTemplateId = '4:5';
		}
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
				aspectRatioPopupOpen = true;
			} else if (appMode === 'stack') {
				const preview = await downscaleForPreview(bitmap);
				if (bitmap !== preview) bitmap.close();
				stackImages = [...stackImages, { blob, preview }];
				if (stackImages.length === 1) aspectRatioPopupOpen = true;
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

	function handleStackFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files?.length) return;
		for (let i = 0; i < files.length; i++) {
			handleFile(files[i]);
		}
		input.value = '';
	}

	function removeStackImage(index: number) {
		stackImages = stackImages.filter((_, i) => i !== index);
	}

	function clearStack() {
		stackImages = [];
	}

	function clearCropImage() {
		previewImage = null;
		originalBlob = null;
		originalWidth = 0;
		originalHeight = 0;
	}

	function clearCarouselImage() {
		carouselImage = null;
		carouselOriginalBlob = null;
		carouselOriginalWidth = 0;
		carouselOriginalHeight = 0;
		carouselNarrowImageWarning = false;
		carouselError = null;
	}

	function moveStackImage(index: number, dir: -1 | 1) {
		const next = index + dir;
		if (next < 0 || next >= stackImages.length) return;
		const arr = [...stackImages];
		[arr[index], arr[next]] = [arr[next], arr[index]];
		stackImages = arr;
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
		if (appMode === 'stack') {
			if (!stackImages.length) return;
			exportLoading = true;
			try {
				const cellWidth = EXPORT_STACK_WIDTH;
				const firstPreviewDims = getCanvasDimensions(
					stackImages[0].preview.width,
					stackImages[0].preview.height,
					stackTemplateRatio,
					STACK_PREVIEW_MAX
				);
				const scale = firstPreviewDims.width > 0 ? cellWidth / firstPreviewDims.width : 1;
				const exportPadding = Math.round(padding * scale);
				const panels: { url: string; blob: Blob }[] = [];
				for (const item of stackImages) {
					const bitmap = await createImageBitmap(item.blob);
					const r = stackTemplateRatio > 0 ? stackTemplateRatio : bitmap.width / bitmap.height;
					const w = cellWidth;
					const h = Math.round(cellWidth / r);
					const c = document.createElement('canvas');
					c.width = w;
					c.height = h;
					renderCanvas(c, {
						image: bitmap,
						templateRatio: r,
						padding: exportPadding,
						borderType,
						blurStrength,
						solidColor,
						width: w,
						height: h,
						fillMode
					});
					bitmap.close();
					const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png', 1));
					if (blob) panels.push({ url: URL.createObjectURL(blob), blob });
				}
				exportPreviewKind = 'stack';
				exportPreviewPanels = panels;
				exportPreviewOpen = true;
			} catch (e) {
				console.error('Stack export failed:', e);
			}
			exportLoading = false;
			return;
		}
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
				const panelRatio = carouselTemplateRatio;
				const exportDims = getCanvasDimensions(sliceW, h, panelRatio, undefined);
				const scale = exportDims.width / carouselPanelDims.width;
				const exportPadding = Math.round(padding * scale);
				for (let i = 0; i < n; i++) {
					const sx = viewLeft + i * sliceW;
					const sliceAspect = sliceW / h;
					const fillMode = sliceAspect >= panelRatio ? 'contain' : 'cover';
					const c = document.createElement('canvas');
					c.width = exportDims.width;
					c.height = exportDims.height;
					renderCanvas(c, {
						image: bitmap,
						templateRatio: panelRatio,
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
				exportPreviewKind = 'carousel';
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
			const ratio = cropTemplateRatio > 0 ? cropTemplateRatio : bitmap.width / bitmap.height;
			const dims = getCanvasDimensions(
				bitmap.width,
				bitmap.height,
				ratio,
				undefined
			);
			const scale = dims.width / previewDims.width;
			const exportPadding = Math.round(padding * scale);
			const exportCanvas = document.createElement('canvas');
			exportCanvas.width = dims.width;
			exportCanvas.height = dims.height;
			renderCanvas(exportCanvas, {
				image: bitmap,
				templateRatio: ratio,
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
		exportPreviewKind = null;
	}

	function downloadExportPreviewPanels() {
		const prefix = exportPreviewKind === 'stack' ? 'akicrop-stack' : 'akicrop-panel';
		const delay = 300;
		exportPreviewPanels.forEach((p, i) => {
			setTimeout(() => triggerDownloadFallback(p.blob, `${prefix}-${i + 1}.png`), i * delay);
		});
	}

	async function shareExportPreviewPanels() {
		const prefix = exportPreviewKind === 'stack' ? 'akicrop-stack' : 'akicrop-panel';
		const files = exportPreviewPanels.map(
			(p, i) => new File([p.blob], `${prefix}-${i + 1}.png`, { type: 'image/png' })
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
		if (e.key === 'Escape') {
			if (exportPreviewOpen) {
				closeExportPreview();
				return;
			}
			if (aspectRatioPopupOpen) {
				closeAspectPopup();
				return;
			}
		}
		if (appMode === 'stack' && stackViewMode === 'story' && stackImages.length > 1) {
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				stackStoryPrev();
				return;
			}
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				stackStoryNext();
				return;
			}
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			download();
		}
	}

	function getRatioForTemplateId(id: TemplateId): number {
		if (id === 'original') return 0;
		if (id === 'custom') {
			const w = Math.max(0.1, customRatioW);
			const h = Math.max(0.1, customRatioH);
			return w / h;
		}
		const t = TEMPLATES.find((x) => x.id === id);
		return t ? t.ratio : 1;
	}

	function setTemplate(id: TemplateId) {
		if (appMode === 'crop') cropSelectedTemplateId = id;
		else if (appMode === 'carousel') carouselSelectedTemplateId = id;
		else stackSelectedTemplateId = id;
	}

	function openAspectPopup() {
		aspectPopupPendingTemplateId = currentTemplateId;
		const values = getPresetRatioValues(currentTemplateId);
		if (values) {
			customRatioW = values.w;
			customRatioH = values.h;
		} else if (currentTemplateId === 'original') {
			const img = aspectPopupImage;
			if (img) {
				customRatioW = img.width;
				customRatioH = img.height;
			}
		}
		aspectPopupFocusOnce = true;
		aspectRatioPopupOpen = true;
	}

	function closeAspectPopup() {
		aspectRatioPopupOpen = false;
		aspectPopupPendingTemplateId = null;
	}

	/** Canonical W∶H for presets (used to fill custom inputs). Original/custom have no fixed values. */
	function getPresetRatioValues(id: TemplateId): { w: number; h: number } | null {
		const map: Record<string, { w: number; h: number }> = {
			'1:1': { w: 1, h: 1 },
			'4:5': { w: 4, h: 5 },
			'9:16': { w: 9, h: 16 },
			'16:9': { w: 16, h: 9 },
			'1.91:1': { w: 1.91, h: 1 },
			'3:2': { w: 3, h: 2 },
			'2:3': { w: 2, h: 3 }
		};
		return map[id] ?? null;
	}

	/** Find a preset that matches current custom W/H (within tolerance), or 'custom'. */
	function getTemplateFromCustomRatio(): TemplateId {
		const w = Math.max(0.1, customRatioW);
		const h = Math.max(0.1, customRatioH);
		const r = w / h;
		const tol = 0.02;
		for (const t of TEMPLATES) {
			if (t.id === 'original' || t.id === 'custom') continue;
			if (Math.abs(t.ratio - r) <= tol) return t.id;
		}
		return 'custom';
	}

	function selectAspectAndClose(id: TemplateId) {
		setTemplate(id);
		closeAspectPopup();
	}

	/** Single click: set pending selection and fill custom inputs (ratio not applied until Confirm). */
	function onAspectThumbClick(id: TemplateId) {
		const container = aspectPopupContentEl;
		const scrollTop = container?.scrollTop ?? 0;
		aspectPopupPendingTemplateId = id;
		const values = getPresetRatioValues(id);
		if (values) {
			customRatioW = values.w;
			customRatioH = values.h;
		} else if (id === 'original') {
			const img = aspectPopupImage;
			if (img) {
				customRatioW = img.width;
				customRatioH = img.height;
			}
		}
		requestAnimationFrame(() => {
			if (container) container.scrollTop = scrollTop;
		});
	}

	/** Double-click: apply selection and close. */
	function onAspectThumbDblClick(id: TemplateId) {
		setTemplate(id);
		const values = getPresetRatioValues(id);
		if (values) {
			customRatioW = values.w;
			customRatioH = values.h;
		} else if (id === 'original') {
			const img = aspectPopupImage;
			if (img) {
				customRatioW = img.width;
				customRatioH = img.height;
			}
		}
		closeAspectPopup();
	}

	/** Confirm: apply current custom ratio (or matching preset) to current mode and close. */
	function confirmAspectSelection() {
		setTemplate(getTemplateFromCustomRatio());
		closeAspectPopup();
	}

	function setBorderType(type: BorderType) {
		borderType = type;
	}

	let sliderActive = $state<'padding' | 'blur' | 'zoom' | null>(null);
	function setSliderActive(id: 'padding' | 'blur' | 'zoom' | null) {
		sliderActive = id;
	}

	// Prevent the base page from ever scrolling or bouncing (e.g. iOS rubber-band).
	$effect(() => {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		const body = document.body;
		html.style.overflow = 'hidden';
		html.style.overscrollBehavior = 'none';
		body.style.overflow = 'hidden';
		body.style.overscrollBehavior = 'none';
		return () => {
			html.style.overflow = '';
			html.style.overscrollBehavior = '';
			body.style.overflow = '';
			body.style.overscrollBehavior = '';
		};
	});

	// Draw aspect popup thumbnails when popup opens and we have an image
	$effect(() => {
		if (!aspectRatioPopupOpen || !aspectPopupContentEl) return;
		const img = aspectPopupImage;
		if (!img) return;
		const container = aspectPopupContentEl;
		const scrollTop = container.scrollTop;
		const canvases = container.querySelectorAll<HTMLCanvasElement>('[data-template-id]');
		canvases.forEach((canvas) => {
			const id = canvas.getAttribute('data-template-id') as TemplateId | null;
			if (!id) return;
			const ratio = getRatioForTemplateId(id);
			const dims = getCanvasDimensions(img.width, img.height, ratio, ASPECT_POPUP_THUMB_SIZE);
			if (dims.width <= 0 || dims.height <= 0) return;
			renderCanvas(canvas, {
				image: img,
				templateRatio: ratio,
				padding: 0,
				borderType,
				blurStrength,
				solidColor,
				width: dims.width,
				height: dims.height,
				fillMode
			});
		});
		requestAnimationFrame(() => {
			container.scrollTop = scrollTop;
		});
		if (aspectPopupFocusOnce) {
			aspectPopupFocusOnce = false;
			setTimeout(() => {
				const firstBtn = aspectPopupContentEl?.querySelector<HTMLButtonElement>('.aspect-popup-thumb-btn');
				firstBtn?.focus();
			}, 0);
		}
	});

</script>

<svelte:window onkeydown={onKeydown} onpointerup={() => setSliderActive(null)} />

<a id="download-link" class="download-link" href="#" download> </a>
<div class="app">
	<Topbar
		appMode={appMode}
		exportLoading={exportLoading}
		canExport={appMode === 'crop' ? !!previewImage : appMode === 'stack' ? stackImages.length > 0 : !!carouselImage}
		onExport={download}
	/>

	<div class="workspace">
		<div
			class="canvas-area"
			ondrop={onDrop}
			ondragover={onDragOver}
			role="region"
			aria-label={appMode === 'crop' ? 'Canvas' : appMode === 'stack' ? 'Stack' : 'Carousel'}
		>
			{#if appMode === 'crop'}
				<CropView
					bind:viewportEl={canvasWrapEl}
					previewImage={previewImage}
					containerSize={containerSize}
					templateRatio={cropTemplateRatio}
					padding={padding}
					borderType={borderType}
					blurStrength={blurStrength}
					solidColor={solidColor}
					fillMode={fillMode}
					onFile={onInputChange}
				/>
			{:else if appMode === 'stack'}
				<StackView
					bind:viewportEl={canvasWrapEl}
					stackImages={stackImages}
					containerSize={containerSize}
					templateRatio={stackTemplateRatio}
					padding={padding}
					borderType={borderType}
					blurStrength={blurStrength}
					solidColor={solidColor}
					fillMode={fillMode}
					onStackFiles={handleStackFiles}
					removeStackImage={removeStackImage}
					clearStack={clearStack}
					moveStackImage={moveStackImage}
				/>
			{:else}
				<CarouselView
					bind:viewportEl={canvasWrapEl}
					carouselImage={carouselImage}
					containerSize={containerSize}
					carouselPanelCount={carouselPanelCount}
					carouselPanelDims={carouselPanelDims}
					carouselPanelRatio={carouselPanelRatio}
					carouselZoom={carouselZoom}
					padding={padding}
					borderType={borderType}
					blurStrength={blurStrength}
					solidColor={solidColor}
					carouselError={carouselError}
					onFile={onInputChange}
				/>
			{/if}

			{#if loading || exportLoading}
				<div class="spinner-overlay" aria-hidden="true">
					<div class="spinner"></div>
				</div>
			{/if}
		</div>

		<aside class="sidebar">
			<div class="sidebar-body" class:sidebar-disabled={!sidebarHasImage} aria-disabled={!sidebarHasImage}>
				{#if appMode === 'crop' || appMode === 'stack'}
					<section class="control-group">
						<h2 class="control-label">Template</h2>
						<div class="template-row">
							{#each [{ id: '1:1' as TemplateId, label: '1:1' }, { id: '4:5' as TemplateId, label: '4:5' }, { id: '16:9' as TemplateId, label: '16:9' }, { id: 'original' as TemplateId, label: 'Original' }] as t}
								<button
									class="sidebar-btn"
									class:selected={currentTemplateId === t.id}
									onclick={() => setTemplate(t.id)}
									type="button"
								>
									{t.label}
								</button>
							{/each}
						</div>
						<button type="button" class="sidebar-btn aspect-more-btn" onclick={openAspectPopup}>
							More ratios…
						</button>
						{#if previewImage}
							<button type="button" class="sidebar-btn aspect-more-btn remove-image-btn" onclick={clearCropImage}>
								Remove image
							</button>
						{/if}
						{#if appMode === 'crop' || appMode === 'stack'}
							<div class="sidebar-fill-row">
								<span class="control-label">Image in frame</span>
								<div class="border-type-row fill-buttons-row">
									<button type="button" class="sidebar-btn" class:selected={fillMode === 'contain'} onclick={() => (fillMode = 'contain')}>Fit</button>
									<button type="button" class="sidebar-btn" class:selected={fillMode === 'cover'} onclick={() => (fillMode = 'cover')}>Fill</button>
								</div>
							</div>
						{/if}
						{#if currentTemplateId === 'custom'}
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
				{:else if appMode === 'carousel'}
					<section class="control-group">
						<h2 class="control-label">Panel aspect</h2>
						<div class="template-row">
							{#each [{ id: '1:1' as TemplateId, label: '1:1' }, { id: '4:5' as TemplateId, label: '4:5' }, { id: '16:9' as TemplateId, label: '16:9' }] as t}
								<button
									class="sidebar-btn"
									class:selected={currentTemplateId === t.id}
									onclick={() => setTemplate(t.id)}
									type="button"
								>
									{t.label}
								</button>
							{/each}
						</div>
						<button type="button" class="sidebar-btn aspect-more-btn" onclick={openAspectPopup}>
							More ratios…
						</button>
					</section>
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
						<p class="control-muted">{carouselPanelCount} panel{carouselPanelCount !== 1 ? 's' : ''}</p>
						{#if carouselImage}
							<button type="button" class="sidebar-btn aspect-more-btn remove-image-btn" onclick={clearCarouselImage}>
								Remove image
							</button>
						{/if}
					</section>
				{/if}

				<section class="control-group">
					<h2 class="control-label">Border</h2>
					<div class="border-type-row">
						<button
							class="sidebar-btn"
							class:selected={borderType === 'auto'}
							onclick={() => setBorderType('auto')}
							type="button"
						>
							Auto
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
							class:selected={borderType === 'solid'}
							onclick={() => setBorderType('solid')}
							type="button"
						>
							Solid
						</button>
					</div>
				</section>

				{#if appMode === 'crop' || appMode === 'stack'}
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

	<ExportPreview
		open={exportPreviewOpen}
		panels={exportPreviewPanels}
		canUseShare={canUseShare}
		onClose={closeExportPreview}
		onShareAll={shareExportPreviewPanels}
		onDownloadAll={downloadExportPreviewPanels}
		onSharePanel={shareExportPreviewPanel}
		onDownloadPanel={(panel, i) => triggerDownloadFallback(panel.blob, `${exportPreviewKind === 'stack' ? 'akicrop-stack' : 'akicrop-panel'}-${i + 1}.png`)}
	/>

	<AspectRatioPopup
		open={aspectRatioPopupOpen}
		fillMode={fillMode}
		bind:customRatioW
		bind:customRatioH
		selectedTemplateId={currentTemplateId}
		aspectPopupPendingTemplateId={aspectPopupPendingTemplateId}
		onClose={closeAspectPopup}
		onFillModeContain={() => (fillMode = 'contain')}
		onFillModeCover={() => (fillMode = 'cover')}
		onAspectThumbClick={onAspectThumbClick}
		onAspectThumbDblClick={onAspectThumbDblClick}
		onConfirm={confirmAspectSelection}
		onContentEl={(el) => (aspectPopupContentEl = el)}
	/>

	<NarrowImageWarning
		open={carouselNarrowImageWarning}
		onContinue={dismissCarouselNarrowWarning}
		onSwitchToCrop={switchToCropModeWithCarouselImage}
	/>
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

	.workspace {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
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

	.sidebar {
		width: var(--sidebar-width);
		flex-shrink: 0;
		background: var(--bg-panel);
		border-left: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.sidebar-fill-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
	.sidebar-fill-row .fill-buttons-row {
		flex-wrap: nowrap;
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
	.sidebar-body.sidebar-disabled {
		pointer-events: none;
		opacity: 0.85;
		filter: saturate(0.25) brightness(0.9);
	}
	.sidebar-body.sidebar-disabled .sidebar-btn.selected {
		border-color: var(--border-subtle);
		background: var(--bg-input);
		color: var(--text-secondary);
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

	.aspect-more-btn {
		width: 100%;
		margin-top: 4px;
	}
	.remove-image-btn {
		color: var(--text-secondary);
	}
	.remove-image-btn:hover {
		color: var(--error, #c66);
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
