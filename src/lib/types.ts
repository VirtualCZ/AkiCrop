/**
 * AkiCrop – TypeScript types for template presets, border options, and render state.
 */

export type TemplateId = '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1' | '3:2' | '2:3' | 'original' | 'custom';

export interface Template {
	id: TemplateId;
	label: string;
	ratio: number; // width / height (0 = use image aspect; custom uses state)
}

export type BorderType = 'solid' | 'blur' | 'auto';

/** Optional source rectangle to draw a crop of the image (e.g. for carousel panels). */
export interface SourceRect {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
}

/** How the image fills the frame: contain = fit with borders, cover = zoom to fill (crop overflow). */
export type FillMode = 'contain' | 'cover';

export interface RenderOptions {
	image: ImageBitmap | HTMLImageElement;
	templateRatio: number;
	padding: number;
	borderType: BorderType;
	blurStrength: number; // 0–100 percent
	solidColor: string;
	width: number;
	height: number;
	/** When set, only this region of the image is drawn (carousel slice). */
	sourceRect?: SourceRect;
	/** contain = aspect-fit with borders; cover = zoom to fill, crop sides (e.g. carousel). Default: contain. */
	fillMode?: FillMode;
	/** Scale multiplier for foreground (e.g. carousel zoom). 1 = default; >1 zoom in, <1 zoom out. */
	zoom?: number;
}

export const TEMPLATES: Template[] = [
	{ id: '1:1', label: 'Square', ratio: 1 },
	{ id: '4:5', label: 'Portrait (4:5)', ratio: 4 / 5 },
	{ id: '9:16', label: 'Story (9:16)', ratio: 9 / 16 },
	{ id: '16:9', label: 'Landscape (16:9)', ratio: 16 / 9 },
	{ id: '1.91:1', label: 'Wide (1.91:1)', ratio: 1.91 }, // Instagram landscape post
	{ id: '3:2', label: '3:2', ratio: 3 / 2 },
	{ id: '2:3', label: '2:3', ratio: 2 / 3 },
	{ id: 'original', label: 'Original', ratio: 0 },
	{ id: 'custom', label: 'Custom', ratio: 1 } // ratio from custom inputs
];

/** Common Instagram aspect ratios (feed + story). */
export const INSTAGRAM_PRESETS: TemplateId[] = ['1:1', '4:5', '9:16', '1.91:1'];
/** Grouped presets for aspect-ratio popup rows (Wide / Tall / Square + Original). */
export const WIDE_PRESETS: TemplateId[] = ['16:9', '1.91:1', '3:2'];
export const TALL_PRESETS: TemplateId[] = ['4:5', '9:16', '2:3'];
export const SQUARE_PRESETS: TemplateId[] = ['1:1'];
