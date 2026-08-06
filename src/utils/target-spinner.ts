/**
 * Target Spinner Utility
 * Creates and manages inline spinner for target elements during navigation
 */

/**
 * Create inline spinner element for target loading
 */
function createTargetSpinner(): HTMLElement {
	const spinner = document.createElement('div');
	spinner.className = 'gyos-target-spinner';
	spinner.innerHTML = `
		<div class="gyos-spinner-content">
			<svg class="gyos-spinner-icon" viewBox="0 0 50 50">
				<circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="31.4 31.4" />
			</svg>
		</div>
	`;
	
	// Inject styles if not already present
	if (!document.getElementById('gyos-target-spinner-styles')) {
		const style = document.createElement('style');
		style.id = 'gyos-target-spinner-styles';
		style.textContent = `
			.gyos-target-spinner {
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 20px;
				min-height: 60px;
			}
			.gyos-spinner-content {
				display: flex;
				align-items: center;
				gap: 10px;
				color: var(--gyos-spinner-color, #667eea);
				font-size: 14px;
			}
			.gyos-spinner-icon {
				width: 24px;
				height: 24px;
				animation: gyos-spin 1s linear infinite;
			}
			@keyframes gyos-spin {
				0% { transform: rotate(0deg); }
				100% { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
	}
	
	return spinner;
}

/**
 * Show spinner in target element
 */
export function showTargetSpinner(target: HTMLElement, swapMode: string): HTMLElement {
	const spinner = createTargetSpinner();
    if (swapMode === 'prepend') {
        target.prepend(spinner);
    } else {
        target.appendChild(spinner);
    }
	return spinner;
}

/**
 * Hide and remove spinner from target
 */
export function hideTargetSpinner(spinner: HTMLElement | null): void {
	if (spinner && spinner.parentNode) {
		spinner.remove();
	}
}
