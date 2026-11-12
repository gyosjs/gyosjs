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
        // A URL fragment identifies an id, not a CSS selector. Numeric ids,
        // punctuation and percent-encoded Unicode must work without escaping.
        let id = hash.slice(1);
        try { id = decodeURIComponent(id); } catch { /* Keep malformed fragments literal. */ }
        const el = document.getElementById(id);
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
