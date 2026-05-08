/**
 * AkiCrop – App and mode-specific constants.
 */

import type { TemplateId } from './types';
import { INSTAGRAM_PRESETS, WIDE_PRESETS, TALL_PRESETS } from './types';

export type AppMode = 'crop' | 'carousel' | 'stack';

export const MAX_PREVIEW = 2048;
export const CAROUSEL_DEFAULT_RATIO = 4 / 5;
export const STACK_PREVIEW_MAX = 400;
export const STACK_ZOOM_MIN = 0.25;
export const STACK_ZOOM_MAX = 2;
export const STACK_ZOOM_STEP = 0.25;
export const EXPORT_STACK_WIDTH = 1080;
export const CAROUSEL_STRIP_PADDING = 24;
export const CAROUSEL_STRIP_GAP = 8;
export const ASPECT_POPUP_THUMB_SIZE = 80;
export const MAX_ZOOM = 3;
export const ZOOM_RETURN_DURATION = 220;

/** Export resolution: max length of longest side in pixels; null = original size. */
export const EXPORT_RESOLUTION_PRESETS: { id: string; label: string; maxSize: number | null }[] = [
	{ id: 'original', label: 'Original', maxSize: null },
	{ id: '1080', label: '1080p (1920)', maxSize: 1920 },
	{ id: '2k', label: '2K (2048)', maxSize: 2048 },
	{ id: '4k', label: '4K (4096)', maxSize: 4096 }
];

/** Grouped rows for the aspect-ratio popup. */
export const ASPECT_POPUP_ROWS: { label: string; ids: TemplateId[] }[] = [
	{ label: 'Instagram', ids: INSTAGRAM_PRESETS },
	{ label: 'Widest', ids: WIDE_PRESETS },
	{ label: 'Tall', ids: TALL_PRESETS },
	{ label: 'Square & more', ids: ['1:1', 'original', 'custom'] }
];
