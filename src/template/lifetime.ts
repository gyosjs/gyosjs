// A cleanup invalidates work started earlier even if the DOM stays connected.
// Weak ownership permits a later explicit mount to start a fresh lifetime.
const generations = new WeakMap<Node, number>();

export function cleanupGeneration(node: Node): number {
    return generations.get(node) || 0;
}

export function invalidateLifetime(node: Node): void {
    generations.set(node, cleanupGeneration(node) + 1);
}
