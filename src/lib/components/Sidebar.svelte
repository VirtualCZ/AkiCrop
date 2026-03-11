<script lang="ts">
	import type { TemplateId, BorderType } from '$lib/types';
	import type { AppMode } from '$lib/constants';

	interface Props {
		appMode: AppMode;
		disabled: boolean;
		currentTemplateId: TemplateId;
		onSetTemplate: (id: TemplateId) => void;
		onOpenAspectPopup: () => void;
		showCropRemoveImage: boolean;
		showCarouselRemoveImage: boolean;
		onClearCropImage: () => void;
		onClearCarouselImage: () => void;
		fillMode: 'contain' | 'cover';
		onFillModeContain: () => void;
		onFillModeCover: () => void;
		customRatioW: number;
		customRatioH: number;
		showCustomRatio: boolean;
		borderType: BorderType;
		onSetBorderType: (type: BorderType) => void;
		padding: number;
		sliderActive: 'padding' | 'blur' | 'zoom' | null;
		onSetSliderActive: (id: 'padding' | 'blur' | 'zoom' | null) => void;
		// Carousel-only
		carouselPanelCountOverride: number | null;
		carouselPanelCountAuto: number;
		carouselPanelCount: number;
		onCarouselPanelCountOverride: (value: number | null) => void;
		carouselZoom: number;
		carouselZoomMin: number;
		carouselZoomMax: number;
		blurStrength: number;
		solidColor: string;
	}
	let {
		appMode,
		disabled,
		currentTemplateId,
		onSetTemplate,
		onOpenAspectPopup,
		showCropRemoveImage,
		showCarouselRemoveImage,
		onClearCropImage,
		onClearCarouselImage,
		fillMode,
		onFillModeContain,
		onFillModeCover,
		customRatioW = $bindable(),
		customRatioH = $bindable(),
		showCustomRatio,
		borderType,
		onSetBorderType,
		padding = $bindable(),
		sliderActive,
		onSetSliderActive,
		carouselPanelCountOverride,
		carouselPanelCountAuto,
		carouselPanelCount,
		onCarouselPanelCountOverride,
		carouselZoom = $bindable(),
		carouselZoomMin,
		carouselZoomMax,
		blurStrength = $bindable(),
		solidColor = $bindable()
	}: Props = $props();

	let panelsDropdownOpen = $state(false);

	const cropStackTemplates: { id: TemplateId; label: string }[] = [
		{ id: '1:1', label: '1:1' },
		{ id: '4:5', label: '4:5' },
		{ id: '16:9', label: '16:9' },
		{ id: 'original', label: 'Original' }
	];
	const carouselTemplates: { id: TemplateId; label: string }[] = [
		{ id: '1:1', label: '1:1' },
		{ id: '4:5', label: '4:5' },
		{ id: '16:9', label: '16:9' }
	];
</script>

<aside class="sidebar">
	<div class="sidebar-body" class:sidebar-disabled={disabled} aria-disabled={disabled}>
		{#if appMode === 'crop' || appMode === 'stack'}
			<section class="control-group">
				<h2 class="control-label">Template</h2>
				<div class="template-row">
					{#each cropStackTemplates as t}
						<button
							class="sidebar-btn"
							class:selected={currentTemplateId === t.id}
							onclick={() => onSetTemplate(t.id)}
							type="button"
						>
							{t.label}
						</button>
					{/each}
				</div>
				<button type="button" class="sidebar-btn aspect-more-btn" onclick={onOpenAspectPopup}>
					More ratios…
				</button>
				{#if showCropRemoveImage}
					<button type="button" class="sidebar-btn aspect-more-btn remove-image-btn" onclick={onClearCropImage}>
						Remove image
					</button>
				{/if}
				{#if appMode === 'crop' || appMode === 'stack'}
					<div class="sidebar-fill-row">
						<span class="control-label">Image in frame</span>
						<div class="border-type-row fill-buttons-row">
							<button type="button" class="sidebar-btn" class:selected={fillMode === 'contain'} onclick={onFillModeContain}>Fit</button>
							<button type="button" class="sidebar-btn" class:selected={fillMode === 'cover'} onclick={onFillModeCover}>Fill</button>
						</div>
					</div>
				{/if}
				{#if showCustomRatio}
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
					{#each carouselTemplates as t}
						<button
							class="sidebar-btn"
							class:selected={currentTemplateId === t.id}
							onclick={() => onSetTemplate(t.id)}
							type="button"
						>
							{t.label}
						</button>
					{/each}
				</div>
				<button type="button" class="sidebar-btn aspect-more-btn" onclick={onOpenAspectPopup}>
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
								aria-selected={carouselPanelCountOverride === null}
								onclick={() => {
									onCarouselPanelCountOverride(null);
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
									aria-selected={carouselPanelCountOverride === num}
									onclick={() => {
										onCarouselPanelCountOverride(num);
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
				{#if showCarouselRemoveImage}
					<button type="button" class="sidebar-btn aspect-more-btn remove-image-btn" onclick={onClearCarouselImage}>
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
					onclick={() => onSetBorderType('auto')}
					type="button"
				>
					Auto
				</button>
				<button
					class="sidebar-btn"
					class:selected={borderType === 'blur'}
					onclick={() => onSetBorderType('blur')}
					type="button"
				>
					Blur
				</button>
				<button
					class="sidebar-btn"
					class:selected={borderType === 'solid'}
					onclick={() => onSetBorderType('solid')}
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
						onpointerdown={() => onSetSliderActive('padding')}
						onpointerup={() => onSetSliderActive(null)}
						onpointerleave={() => onSetSliderActive(null)}
						ontouchstart={() => onSetSliderActive('padding')}
						ontouchend={() => onSetSliderActive(null)}
						ontouchcancel={() => onSetSliderActive(null)}
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
						onpointerdown={() => onSetSliderActive('zoom')}
						onpointerup={() => onSetSliderActive(null)}
						onpointerleave={() => onSetSliderActive(null)}
						ontouchstart={() => onSetSliderActive('zoom')}
						ontouchend={() => onSetSliderActive(null)}
						ontouchcancel={() => onSetSliderActive(null)}
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
						onpointerdown={() => onSetSliderActive('blur')}
						onpointerup={() => onSetSliderActive(null)}
						onpointerleave={() => onSetSliderActive(null)}
						ontouchstart={() => onSetSliderActive('blur')}
						ontouchend={() => onSetSliderActive(null)}
						ontouchcancel={() => onSetSliderActive(null)}
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

<style>
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
		.sidebar {
			width: 100%;
			max-height: 40vh;
			border-left: none;
			border-top: 1px solid var(--border-subtle);
		}
	}
</style>
