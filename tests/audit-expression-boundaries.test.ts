import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { evaluateExpression } from '../src/template/expression';

afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; setExpressionRuntime(standardExpressionRuntime); });
describe('expression audit', () => {
  it.each([standardExpressionRuntime, cspExpressionRuntime])('evaluates quoted expressions correctly in $mode', runtime => {
    setExpressionRuntime(runtime);
    expect(evaluateExpression("'Gyos' + 'JS'", {})).toBe('GyosJS');
    expect(evaluateExpression("'line\\nnext'", {})).toBe('line\nnext');
  });
  it('short circuits optional calls before evaluating their arguments', () => {
    const sideEffect = vi.fn();
    expect(cspExpressionRuntime.evaluate('missing?.method(sideEffect())', { missing: null, sideEffect })).toBeUndefined();
    expect(cspExpressionRuntime.evaluate('missing?.(sideEffect())', { missing: null, sideEffect })).toBeUndefined();
    expect(sideEffect).not.toHaveBeenCalled();
  });
  it('resolves the method before evaluating call arguments', () => {
    const order: string[] = [];
    const scope = { get method() { order.push('method'); return () => {}; }, argument() { order.push('argument'); } };
    cspExpressionRuntime.evaluate('method(argument())', scope);
    expect(order).toEqual(['method', 'argument']);
  });
  it('applies numeric coercion to prefix and postfix updates', () => {
    const scope = { count: '1' as any };
    expect(cspExpressionRuntime.execute('count++', scope)).toBe(1);
    expect(scope.count).toBe(2);
    scope.count = '3';
    expect(cspExpressionRuntime.execute('++count', scope)).toBe(4);
    scope.count = '5';
    expect(cspExpressionRuntime.execute('count--', scope)).toBe(5);
    expect(scope.count).toBe(4);
  });
  it('mounts literal percent signs and modulo methods in markup', () => {
    document.body.innerHTML = `<main g-scope="{ label: '10%', count: 5 }" gm-modulo="this.count = this.count % 2"><b>{label}</b><button @click="modulo">Run</button></main>`;
    expect(() => Gyos.mountAll()).not.toThrow();
    expect(document.querySelector('b')?.textContent).toBe('10%');
    document.querySelector('button')!.click();
    expect(Gyos.mountedScopes().get(document.querySelector('main')!).count).toBe(1);
  });
  it('preserves case-sensitive CSS custom properties and restores static values', async () => {
    document.body.innerHTML = `<main g-scope="StyleCase"><b style="--Theme: red" :style="styles">Color</b></main>`;
    Gyos.scope('StyleCase', { styles: { '--Theme': 'blue' } }); Gyos.mountAll();
    const el = document.querySelector('b')!;
    expect(el.style.getPropertyValue('--Theme')).toBe('blue');
    Gyos.mountedScopes().get(document.querySelector('main')!).styles = {};
    await Promise.resolve(); await Promise.resolve();
    expect(el.style.getPropertyValue('--Theme')).toBe('red');
  });
});
