<script lang="ts">
	import type { AppMode } from '$lib/constants';

	interface Props {
		appMode: AppMode;
		exportLoading: boolean;
		canExport: boolean;
		onExport: () => void;
	}
	let { appMode, exportLoading, canExport, onExport }: Props = $props();
</script>

<header class="topbar">
	<h1 class="topbar-title">AkiCrop</h1>
	<div class="topbar-mode" role="group" aria-label="Mode">
		<a href="?mode=crop" class="topbar-mode-btn" class:selected={appMode === 'crop'} title="Crop">Crop</a>
		<a href="?mode=carousel" class="topbar-mode-btn" class:selected={appMode === 'carousel'} title="Carousel">Carousel</a>
		<a href="?mode=stack" class="topbar-mode-btn" class:selected={appMode === 'stack'} title="Stack">Stack</a>
	</div>
	<button
		class="btn btn-primary"
		disabled={!canExport || exportLoading}
		onclick={onExport}
		title={appMode === 'stack' ? 'Export stack' : appMode === 'carousel' ? 'Export carousel' : 'Export (Ctrl+S)'}
	>
		{exportLoading ? 'Exporting…' : 'Export'}
	</button>
</header>

<style>
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
</style>
