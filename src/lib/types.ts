/**
 * AkiCrop – TypeScript types for template presets, border options, and render state.
 */

export type TemplateId = '1:1' | '4:5' | '9:16' | '16:9' | 'original';

export interface Template {
	id: TemplateId;
	label: string;
	ratio: number; // width / height
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
	{ id: '1:1', label: 'Instagram Square', ratio: 1 },
	{ id: '4:5', label: 'Instagram Portrait', ratio: 4 / 5 },
	{ id: '9:16', label: 'Instagram Story', ratio: 9 / 16 },
	{ id: '16:9', label: '16:9', ratio: 16 / 9 },
	{ id: 'original', label: 'Original', ratio: 0 } // 0 means use image aspect
];
