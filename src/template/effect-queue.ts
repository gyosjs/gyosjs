import { effect } from '../reactivity/signal';
import { cleanupGeneration } from './lifetime';

type EffectRunner = () => void | (() => void);

type QueuedEffect = {
    target: Node;
    runner: EffectRunner;
    generation: number;
};

const effectQueueStack: QueuedEffect[][] = [];

function currentQueue(): QueuedEffect[] | undefined {
    return effectQueueStack[effectQueueStack.length - 1];
}

function attachDispose(target: Node, runner: EffectRunner, generation: number): void {
    // An earlier queued content binding can replace this subtree during flush.
    if (!target.isConnected || cleanupGeneration(target) !== generation) return;
    const dispose = effect(runner);
    // The first execution can clean its own scope before effect() returns.
    if (cleanupGeneration(target) !== generation || !target.isConnected) {
        dispose();
        return;
    }
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
        attachDispose(target, runner, cleanupGeneration(target));
        return;
    }
    queue.push({ target, runner, generation: cleanupGeneration(target) });
}

/**
 * Flush all queued effects for the current collection
 * Handles effects added while flushing by iterating with an index
 */
export function flushEffectCollection(): void {
    const queue = currentQueue();
    if (!queue) return;

    for (let i = 0; i < queue.length; i++) {
        const { target, runner, generation } = queue[i];
        attachDispose(target, runner, generation);
    }

    queue.length = 0;
    effectQueueStack.pop();
}
