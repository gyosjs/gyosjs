import { effect } from '../reactivity/signal';

type EffectRunner = () => void | (() => void);

type QueuedEffect = {
    target: Node;
    runner: EffectRunner;
};

const effectQueueStack: QueuedEffect[][] = [];

function currentQueue(): QueuedEffect[] | undefined {
    return effectQueueStack[effectQueueStack.length - 1];
}

function attachDispose(target: Node, runner: EffectRunner): void {
    // An earlier queued content binding can replace this subtree during flush.
    if (!target.isConnected) return;
    const dispose = effect(runner);
    if (!(target as any).__gyos_effects__) {
        (target as any).__gyos_effects__ = [];
    }
    (target as any).__gyos_effects__.push(dispose);
}

/**
 * Start collecting effects for the current parse call
 * Supports nested parses by using a queue stack
 */
export function beginEffectCollection(): void {
    effectQueueStack.push([]);
}

/**
 * Queue an effect to be registered after parsing finishes
 * Falls back to immediate registration if no active collection
 */
export function queueReactiveEffect(target: Node, runner: EffectRunner): void {
    const queue = currentQueue();
    if (!queue) {
        attachDispose(target, runner);
        return;
    }
    queue.push({ target, runner });
}

/**
 * Flush all queued effects for the current collection
 * Handles effects added while flushing by iterating with an index
 */
export function flushEffectCollection(): void {
    const queue = currentQueue();
    if (!queue) return;

    for (let i = 0; i < queue.length; i++) {
        const { target, runner } = queue[i];
        attachDispose(target, runner);
    }

    queue.length = 0;
    effectQueueStack.pop();
}
