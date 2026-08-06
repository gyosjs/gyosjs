export function saveScrollPosition(): void {
    const state = history.state || {};
    const scroll = { x: window.scrollX, y: window.scrollY };
    history.replaceState({ ...state, scroll }, '');
}

export function handleScroll(url: string, trigger?: Element | null, savedScroll?: { x: number, y: number }): void {
    if (trigger && trigger.hasAttribute('g-noscroll')) return;

    // Hash scrolling
    const hash = new URL(url).hash;
    if (hash) {
        const el = document.querySelector(hash);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
            return;
        }
    }

    // Restore saved scroll (popstate)
    if (savedScroll) {
        window.scrollTo(savedScroll.x, savedScroll.y);
        return;
    }

    // Default to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}