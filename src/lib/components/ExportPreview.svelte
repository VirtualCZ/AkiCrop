<script lang="ts">
	interface Panel {
		url: string;
		blob: Blob;
	}
	interface ResolutionPreset {
		id: string;
		label: string;
		maxSize: number | null;
	}
	interface Props {
		open: boolean;
		kind: 'carousel' | 'stack' | null;
		panels: Panel[];
		canUseShare: boolean;
		exportFormat: 'image/png' | 'image/jpeg';
		onSetExportFormat: (format: 'image/png' | 'image/jpeg') => void;
		exportQuality: number;
		exportResolutionId: string;
		onSetExportResolutionId: (id: string) => void;
		resolutionPresets: ResolutionPreset[];
		onExportOptionsChange?: () => void;
		regenerating?: boolean;
		onClose: () => void;
		onShareAll: () => void;
		onDownloadAll: () => void;
		onSharePanel: (panel: Panel, index: number) => void;
		onDownloadPanel: (panel: Panel, index: number) => void;
	}
	let {
		open,
		kind,
		panels,
		canUseShare,
		exportFormat,
		onSetExportFormat,
		exportQuality = $bindable(),
		exportResolutionId,
		onSetExportResolutionId,
		resolutionPresets,
		onExportOptionsChange,
		regenerating = false,
		onClose,
		onShareAll,
		onDownloadAll,
		onSharePanel,
		onDownloadPanel
	}: Props = $props();

	let resolutionDropdownOpen = $state(false);
	let qualitySliderActive = $state(false);

	function handleFormatChange(format: 'image/png' | 'image/jpeg') {
		onSetExportFormat(format);
		onExportOptionsChange?.();
	}
	function handleResolutionChange(id: string) {
		onSetExportResolutionId(id);
		resolutionDropdownOpen = false;
		onExportOptionsChange?.();
	}
	function handleQualityCommit() {
		onExportOptionsChange?.();
	}
</script>

{#if open}
	<div
		class="export-preview-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Export preview"
		onclick={(e) => e.target === e.currentTarget && onClose()}
	>
		<div class="export-preview-box">
			<div class="export-preview-header">
				<h2 class="export-preview-title">Export preview</h2>
				<button type="button" class="export-preview-close" aria-label="Close" onclick={onClose}>×</button>
			</div>
			<div class="export-preview-options">
				<div class="export-option-row">
					<span class="export-option-label">Format</span>
					<div class="export-option-buttons">
						<button
							type="button"
							class="export-option-btn"
							class:selected={exportFormat === 'image/png'}
							onclick={() => handleFormatChange('image/png')}
							aria-pressed={exportFormat === 'image/png'}
							title="Lossless compression, no quality loss"
						>
							PNG (lossless)
						</button>
						<button
							type="button"
							class="export-option-btn"
							class:selected={exportFormat === 'image/jpeg'}
							onclick={() => handleFormatChange('image/jpeg')}
							aria-pressed={exportFormat === 'image/jpeg'}
							title="Lossy compression, smaller files"
						>
							JPEG (lossy)
						</button>
					</div>
				</div>
				{#if exportFormat === 'image/jpeg'}
					<div class="export-option-row export-quality-row">
						<div class="export-slider-label">
							<span class="export-option-label">Quality</span>
							<span>{Math.round(exportQuality * 100)}%</span>
						</div>
						<div
							class="export-slider-wrap"
							class:slider-active={qualitySliderActive}
							style="--pct: {(exportQuality - 0.1) / 0.9 * 100}%"
						>
							<input
								type="range"
								class="export-slider slider-adobe"
								min="0.1"
								max="1"
								step="0.01"
								bind:value={exportQuality}
								aria-label="JPEG quality"
								onpointerdown={() => (qualitySliderActive = true)}
								onpointerup={() => {
									qualitySliderActive = false;
									handleQualityCommit();
								}}
								onpointerleave={() => (qualitySliderActive = false)}
								ontouchstart={() => (qualitySliderActive = true)}
								ontouchend={() => {
									qualitySliderActive = false;
									handleQualityCommit();
								}}
								ontouchcancel={() => (qualitySliderActive = false)}
							/>
						</div>
					</div>
				{/if}
				<div class="export-option-row">
					<span class="export-option-label">Resolution</span>
					<div class="export-resolution-wrap">
						<button
							type="button"
							class="export-option-btn export-resolution-trigger"
							aria-haspopup="listbox"
							aria-expanded={resolutionDropdownOpen}
							aria-label="Export resolution"
							onclick={() => (resolutionDropdownOpen = !resolutionDropdownOpen)}
						>
							{resolutionPresets.find((p) => p.id === exportResolutionId)?.label ?? 'Original'}
							<span class="export-resolution-chevron" aria-hidden="true">▾</span>
						</button>
						{#if resolutionDropdownOpen}
							<div
								class="export-resolution-backdrop"
								role="presentation"
								onclick={() => (resolutionDropdownOpen = false)}
								ontouchstart={() => (resolutionDropdownOpen = false)}
							></div>
							<div class="export-resolution-list" role="listbox">
								{#each resolutionPresets as preset}
									<button
										type="button"
										role="option"
										class="export-resolution-option"
										class:selected={exportResolutionId === preset.id}
										aria-selected={exportResolutionId === preset.id}
										onclick={() => handleResolutionChange(preset.id)}
									>
										{preset.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
			<div class="export-preview-strip-wrap">
				{#if regenerating}
					<div class="export-preview-loading" aria-hidden="true">
						<div class="export-preview-spinner"></div>
					</div>
				{/if}
				<div class="export-preview-strip">
				{#each panels as panel, i}
					<div class="export-preview-panel">
						<img src={panel.url} alt="Panel {i + 1}" />
						{#if canUseShare}
							<button
								type="button"
								class="btn btn-primary export-preview-panel-share"
								onclick={() => onSharePanel(panel, i)}
								title="Share this panel"
							>
								Share
							</button>
						{:else}
							<button
								type="button"
								class="btn btn-secondary export-preview-panel-dl"
								onclick={() => onDownloadPanel(panel, i)}
							>
								Download
							</button>
						{/if}
					</div>
				{/each}
				</div>
			</div>
			<div class="export-preview-actions">
				<button
					type="button"
					class="btn btn-primary"
					onclick={onShareAll}
					title="Share all exported panels"
				>
					Share all
				</button>
				{#if !canUseShare}
					<button
						type="button"
						class="btn btn-primary"
						onclick={onDownloadAll}
						title="Download all exported panels"
					>
						Download all
					</button>
				{/if}
				<button type="button" class="btn btn-secondary" onclick={onClose}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
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
		position: relative;
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
	.export-preview-options {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.export-option-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.export-option-label {
		font-size: var(--font-size-ui);
		color: var(--text-secondary);
		min-width: 72px;
	}
	.export-option-buttons {
		display: flex;
		gap: 8px;
	}
	.export-option-btn {
		padding: 8px 14px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		background: var(--bg-input);
		color: var(--text-primary);
		font-size: var(--font-size-ui);
		cursor: pointer;
	}
	.export-option-btn:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.export-option-btn.selected {
		border-color: var(--adobe-blue);
		background: rgba(59, 99, 251, 0.15);
		color: var(--adobe-blue);
	}
	.export-quality-row {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}
	.export-slider-label {
		display: flex;
		justify-content: space-between;
		font-size: var(--font-size-ui);
		color: var(--text-secondary);
	}
	.export-slider-wrap {
		--pct: 0%;
		--thumb-ring-inset: 2px;
		position: relative;
		width: 100%;
	}
	.export-slider-wrap.slider-active {
		--thumb-ring-inset: 7px;
	}
	.export-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: var(--bg-input);
		outline: none;
		display: block;
	}
	.export-slider.slider-adobe {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--track-light) 0%, var(--track-light) var(--pct), var(--track-dark) var(--pct), var(--track-dark) 100%);
		outline: none;
	}
	.export-slider.slider-adobe::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: transparent;
	}
	.export-slider.slider-adobe::-webkit-slider-thumb {
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
	.export-slider.slider-adobe::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: transparent;
	}
	.export-slider.slider-adobe::-moz-range-thumb {
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
	.export-resolution-wrap {
		position: relative;
	}
	.export-resolution-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 120px;
	}
	.export-resolution-chevron {
		opacity: 0.7;
		font-size: 0.75em;
	}
	.export-resolution-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1;
	}
	.export-resolution-list {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: var(--bg-panel);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		min-width: 100%;
		z-index: 2;
		max-height: 200px;
		overflow-y: auto;
	}
	.export-resolution-option {
		display: block;
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: var(--font-size-ui);
		text-align: left;
		cursor: pointer;
	}
	.export-resolution-option:hover,
	.export-resolution-option.selected {
		background: rgba(255, 255, 255, 0.08);
	}
	.export-preview-strip-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.export-preview-loading {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 5;
		border-radius: var(--radius);
	}
	.export-preview-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--adobe-blue);
		border-radius: 50%;
		animation: export-spin 0.8s linear infinite;
	}
	@keyframes export-spin {
		to {
			transform: rotate(360deg);
		}
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
	@media (max-width: 767px) {
		.export-preview-overlay {
			padding: 12px;
		}
		.export-preview-box {
			max-height: calc(100dvh - 24px);
		}
		.export-preview-options {
			padding: 10px 12px;
			gap: 8px;
		}
		.export-preview-strip {
			padding: 10px 12px;
			gap: 8px;
		}
		.export-preview-panel {
			gap: 6px;
		}
		.export-preview-panel img {
			max-height: 34dvh;
		}
		.export-preview-actions {
			padding: 10px 12px;
			gap: 8px;
		}
	}
</style>
