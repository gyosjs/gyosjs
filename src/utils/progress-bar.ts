/**
 * Progress Bar Manager
 * Creates and manages a visual progress bar during navigation
 */
export class ProgressBar {
    private element: HTMLElement | null = null;
    private animationFrame: number | null = null;
    private hideTimer: number | null = null;
    private resetTimer: number | null = null;
    private currentProgress: number = 0;
    private progressBarEnabled: boolean = true;

    constructor(progressBarEnabled: boolean = true) {
        this.progressBarEnabled = progressBarEnabled;
        this.createBar();
    }

    getCurrentProgress(): number {
        return this.currentProgress;
    }

    private createBar(): void {
        if (typeof document === 'undefined') return;

        // Create progress bar element
        this.element = document.createElement('div');
        this.element.id = 'gyos-progress-bar';
        this.element.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 6px;
            background: var(--gyos-progress-color, linear-gradient(90deg, #aab9ff, #77889f));
            z-index: 999999;
            transition: width 0.3s linear, opacity 0.3s linear;
            opacity: 0;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
        `;

        // Insert into DOM when ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.insertAdjacentElement('beforeend', this.element!);
            });
        } else {
            document.body.insertAdjacentElement('beforeend', this.element!);
        }
    }

    start(): void {
        if (!this.element || !this.progressBarEnabled) return;

        // Cancel any pending hide
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        // Reset and show
        this.currentProgress = 0;
        this.element.style.width = '0%';

        // Animate to initial progress (20%)
        this.setProgress(20);
    }

    setProgress(percent: number): void {
        if (!this.element || !this.progressBarEnabled) return;

        // Clamp between 0-100
        percent = Math.min(100, Math.max(0, percent));
        this.currentProgress = percent;

        // Cancel any pending animation
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        // Smooth animation to target
        this.element.style.width = `${percent}%`;
        this.element.style.opacity = `${Math.max(0.6, percent / 100)}`;
    }

    complete(): void {
        if (!this.element || !this.progressBarEnabled) return;

        // Animate to 100%
        this.setProgress(100);

        // Hide after a short delay
        this.hideTimer = window.setTimeout(() => {
            this.hideTimer = null;
            this.hide();
        }, 300);
    }

    hide(): void {
        if (!this.element) return;

        this.element.style.opacity = '0';
        if (this.resetTimer) clearTimeout(this.resetTimer);
        this.resetTimer = window.setTimeout(() => {
            this.resetTimer = null;
            if (this.element) {
                this.element.style.width = '0%';
                this.currentProgress = 0;
            }
        }, 300);
    }
}
