<script lang="ts">
	interface Panel {
		url: string;
		blob: Blob;
	}
	interface Props {
		open: boolean;
		panels: Panel[];
		canUseShare: boolean;
		onClose: () => void;
		onShareAll: () => void;
		onDownloadAll: () => void;
		onSharePanel: (panel: Panel, index: number) => void;
		onDownloadPanel: (panel: Panel, index: number) => void;
	}
	let { open, panels, canUseShare, onClose, onShareAll, onDownloadAll, onSharePanel, onDownloadPanel }: Props =
		$props();
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
			<div class="export-preview-actions">
				<button
					type="button"
					class="btn btn-primary"
					onclick={onShareAll}
					title="Open system share sheet (e.g. AirDrop, Save to Files)"
				>
					Share
				</button>
				{#if !canUseShare}
					<button type="button" class="btn btn-primary" onclick={onDownloadAll}>
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
</style>
