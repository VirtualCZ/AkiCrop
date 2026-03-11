<script lang="ts">
	import { TEMPLATES } from '$lib/types';
	import type { TemplateId } from '$lib/types';
	import { ASPECT_POPUP_ROWS } from '$lib/constants';

	interface Props {
		open: boolean;
		fillMode: 'contain' | 'cover';
		customRatioW: number;
		customRatioH: number;
		selectedTemplateId: TemplateId;
		aspectPopupPendingTemplateId: TemplateId | null;
		onClose: () => void;
		onFillModeContain: () => void;
		onFillModeCover: () => void;
		onAspectThumbClick: (id: TemplateId) => void;
		onAspectThumbDblClick: (id: TemplateId) => void;
		onConfirm: () => void;
		onContentEl: (el: HTMLDivElement | null) => void;
	}
	let {
		open,
		fillMode,
		customRatioW = $bindable(),
		customRatioH = $bindable(),
		selectedTemplateId,
		aspectPopupPendingTemplateId,
		onClose,
		onFillModeContain,
		onFillModeCover,
		onAspectThumbClick,
		onAspectThumbDblClick,
		onConfirm,
		onContentEl
	}: Props = $props();

	let bodyEl = $state<HTMLDivElement | null>(null);
	$effect(() => {
		if (open && bodyEl) onContentEl(bodyEl);
		return () => onContentEl(null);
	});
</script>

{#if open}
	<div
		class="export-preview-overlay aspect-popup-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Choose aspect ratio"
		onclick={(e) => e.target === e.currentTarget && onClose()}
	>
		<div class="aspect-popup-box" onclick={(e) => e.stopPropagation()}>
			<div class="export-preview-header">
				<h2 class="export-preview-title">Choose aspect ratio</h2>
				<button type="button" class="export-preview-close" aria-label="Close" onclick={onClose}>×</button>
			</div>
			<div class="aspect-popup-fill-row">
				<span class="control-label">Image in frame</span>
				<div class="border-type-row">
					<button
						type="button"
						class="sidebar-btn"
						class:selected={fillMode === 'contain'}
						onclick={onFillModeContain}
					>
						Fit
					</button>
					<button
						type="button"
						class="sidebar-btn"
						class:selected={fillMode === 'cover'}
						onclick={onFillModeCover}
					>
						Fill
					</button>
				</div>
			</div>
			<div class="aspect-popup-body" bind:this={bodyEl}>
				{#each ASPECT_POPUP_ROWS as row}
					<div class="aspect-popup-row">
						<span class="aspect-popup-row-label">{row.label}</span>
						<div class="aspect-popup-thumbs">
							{#each row.ids as id}
								{@const t = TEMPLATES.find((x) => x.id === id)}
								<button
									type="button"
									class="aspect-popup-thumb-btn"
									class:selected={(aspectPopupPendingTemplateId ?? selectedTemplateId) === id}
									onclick={() => onAspectThumbClick(id)}
									ondblclick={() => onAspectThumbDblClick(id)}
									title={t?.label ?? id}
									aria-label={t?.label ?? id}
								>
									<div class="aspect-popup-thumb-preview">
										<canvas
											class="aspect-popup-thumb-canvas"
											data-template-id={id}
											style="pointer-events: none;"
										></canvas>
									</div>
									<span class="aspect-popup-thumb-label">{t?.label ?? id}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<div class="aspect-popup-footer">
				<span class="control-label">Custom ratio</span>
				<div class="aspect-popup-custom-row">
					<label class="custom-ratio-label">
						<span>W</span>
						<input
							type="number"
							class="custom-ratio-input aspect-popup-ratio-input"
							min="0.1"
							step="0.1"
							bind:value={customRatioW}
							aria-label="Width"
						/>
					</label>
					<span class="custom-ratio-sep">∶</span>
					<label class="custom-ratio-label">
						<span>H</span>
						<input
							type="number"
							class="custom-ratio-input aspect-popup-ratio-input"
							min="0.1"
							step="0.1"
							bind:value={customRatioH}
							aria-label="Height"
						/>
					</label>
					<button type="button" class="btn btn-primary aspect-popup-confirm-btn" onclick={onConfirm}>
						Confirm
					</button>
				</div>
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
	.aspect-popup-overlay {
		align-items: center;
		justify-content: center;
	}
	.aspect-popup-box {
		background: var(--bg-panel);
		border-radius: var(--radius);
		border: 1px solid var(--border-subtle);
		width: min(560px, 92vw);
		max-width: 92vw;
		max-height: 85vh;
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
	.aspect-popup-footer {
		padding: 16px;
		border-top: 1px solid var(--border-subtle);
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex-shrink: 0;
		background: var(--bg-panel);
	}
	.aspect-popup-custom-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.aspect-popup-ratio-input {
		width: 64px;
	}
	.aspect-popup-confirm-btn {
		margin-left: auto;
	}
	.aspect-popup-fill-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 16px 8px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.aspect-popup-body {
		padding: 16px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.aspect-popup-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.aspect-popup-row-label {
		font-size: var(--font-size-label);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.aspect-popup-thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.aspect-popup-thumb-btn {
		width: 88px;
		padding: 4px 0 6px;
		border: 2px solid var(--border-subtle);
		border-radius: var(--radius);
		background: var(--bg-input);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 4px;
		overflow: hidden;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.aspect-popup-thumb-preview {
		height: 80px;
		width: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.aspect-popup-thumb-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
		text-align: center;
		line-height: 1.2;
		padding: 0 4px;
	}
	.aspect-popup-thumb-btn.selected .aspect-popup-thumb-label {
		color: #a5b8ff;
	}
	.aspect-popup-thumb-btn:hover {
		border-color: var(--text-secondary);
	}
	.aspect-popup-thumb-btn.selected {
		border-color: var(--adobe-blue);
		box-shadow: 0 0 0 2px rgba(59, 99, 251, 0.3);
	}
	.aspect-popup-thumb-canvas {
		display: block;
		max-width: 80px;
		max-height: 80px;
		width: auto;
		height: auto;
		flex-shrink: 0;
		vertical-align: bottom;
	}
	.control-label {
		font-size: var(--font-size-label);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin: 0;
	}
	.border-type-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
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
</style>
