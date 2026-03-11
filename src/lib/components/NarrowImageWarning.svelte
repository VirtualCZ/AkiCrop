<script lang="ts">
	interface Props {
		open: boolean;
		onContinue: () => void;
		onSwitchToCrop: () => void;
	}
	let { open, onContinue, onSwitchToCrop }: Props = $props();
</script>

{#if open}
	<div
		class="export-preview-overlay narrow-warning-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="narrow-warning-title"
	>
		<div class="narrow-warning-box">
			<h2 id="narrow-warning-title" class="narrow-warning-title">Image not wide enough for carousel</h2>
			<p class="narrow-warning-text">
				This image will be heavily cropped in carousel mode. You can continue anyway or switch to Crop mode
				to use it there instead.
			</p>
			<div class="narrow-warning-actions">
				<button type="button" class="btn btn-primary" onclick={onContinue}>Continue in Carousel</button>
				<button type="button" class="btn btn-secondary" onclick={onSwitchToCrop}>Switch to Crop mode</button>
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
</style>
