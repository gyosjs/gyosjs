import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('documentation form and public API contracts', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		vi.useRealTimers();
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
			clear: () => storage.clear()
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('registers every documented built-in validator and validates representative values', async () => {
		const documented = [
			'required', 'email', 'minLength', 'maxLength', 'min', 'max', 'number', 'integer',
			'numeric', 'alpha', 'alphanumeric', 'pattern', 'same', 'different', 'url', 'phone',
			'date', 'before', 'after', 'password', 'in', 'notIn', 'between'
		];
		expect(Gyos.getValidatorNames()).toEqual(expect.arrayContaining(documented));

		const cases: Array<[unknown, string, boolean, Record<string, unknown>?]> = [
			['', 'required', false],
			['dev@gyos.test', 'required|email', true],
			['bad-email', 'email', false],
			['abcd', 'minLength(3)|maxLength(5)', true],
			['17', 'min(18)', false],
			['101', 'max(100)', false],
			['12.5', 'number', true],
			['12.5', 'integer', false],
			['12345', 'numeric', true],
			['abc', 'alpha', true],
			['abc123', 'alphanumeric', true],
			['ABC', 'pattern(^[A-Z]{3}$)', true],
			['secret', 'same(password)', true, { password: 'secret' }],
			['new', 'different(oldPassword)', true, { oldPassword: 'old' }],
			['https://gyos.test/docs', 'url', true],
			['0912345678', 'phone', true],
			['2026-08-04', 'date', true],
			['2025-01-01', 'before(2026-01-01)', true],
			['2026-01-02', 'after(2026-01-01)', true],
			['Strong123', 'password', true],
			['green', 'in(red,green,blue)', true],
			['guest', 'notIn(admin,root)', true],
			['42', 'between(18,65)', true]
		];

		for (const [value, rules, valid, form] of cases) {
			const error = await Gyos.validate(value, rules, form ? { form } : undefined);
			expect(error === null, `${rules} with ${String(value)}`).toBe(valid);
		}
	});

	it('supports custom async validators and custom messages', async () => {
		const validatorName = `availableDocs${++id}`;
		Gyos.validator(validatorName, async value => value === 'gyos' || 'Name is unavailable');

		expect(await Gyos.validate('gyos', `required|${validatorName}`)).toBeNull();
		expect(await Gyos.validate('other', validatorName)).toBe('Name is unavailable');
		expect(await Gyos.validate('', 'required:Please enter a value')).toBe('Please enter a value');
		expect(await Gyos.validate('x', 'minLength(3)', {
			messages: { minLength: 'Too short' }
		})).toBe('Too short');
	});

	it('renders custom validator messages as text in the error summary', async () => {
		const validatorName = `safeSummary${++id}`;
		const scopeName = `SafeSummaryDocs${id}`;
		Gyos.validator(validatorName, () => '<img src=x onerror="window.validationXss = true">');
		document.body.innerHTML = `
			<form id="safe-summary" g-scope="${scopeName}" g-form="form">
				<input g-model="value" g-validate="${validatorName}">
				<div class="safe-summary" g-errors></div>
			</form>
		`;
		Gyos.scope(scopeName, { value: 'invalid' });
		Gyos.mountAll();
		const form = document.getElementById('safe-summary')!;

		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(document.querySelector('.safe-summary')!.textContent).toContain('<img'));

		expect(document.querySelector('.safe-summary img')).toBeNull();
	});

	it('validates modifier-based models without requiring id or name attributes', async () => {
		const scopeName = `FormDocs${++id}`;
		const submitted = vi.fn();
		document.body.innerHTML = `
			<form id="form" g-scope="${scopeName}" g-form="signup" g-submit="submitForm">
				<input class="email" g-model.debounce.10="email" g-validate="required|email" />
				<span class="email-error" g-errors="email"></span>
				<input class="password" type="password" g-model.trim="password" g-validate="required|minLength(8)|password" />
				<span class="password-error" g-errors="password"></span>
				<div g-ignore>
					<input class="ignored-validation" g-model="ignored" g-validate="required" />
					<span class="ignored-error" g-errors="ignored">Server-owned error</span>
				</div>
				<div class="summary" g-errors></div>
				<button :disabled="signup.$invalid">Submit</button>
			</form>
		`;
		Gyos.scope(scopeName, {
			email: '', password: '',
			submitForm: submitted
		});
		Gyos.mountAll();
		const form = document.getElementById('form') as HTMLFormElement;
		const state = Gyos.mountedScopes().get(form);

		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(state.signup.$invalid()).toBe(true));
		expect(submitted).not.toHaveBeenCalled();
		expect(document.querySelector('.email-error')!.textContent).toBe('This field is required');
		expect(document.querySelector('.password-error')!.textContent).toBe('This field is required');
		expect(document.querySelectorAll('.summary div')).toHaveLength(2);
		expect(document.querySelector('.ignored-validation')!.hasAttribute('g-validate')).toBe(true);
		expect(document.querySelector('.ignored-validation')!.hasAttribute('g-model')).toBe(true);
		expect(document.querySelector('.ignored-error')!.hasAttribute('g-errors')).toBe(true);
		expect(document.querySelector('.ignored-error')!.textContent).toBe('Server-owned error');
		expect(document.querySelector('button')!.hasAttribute('disabled')).toBe(true);

		const email = document.querySelector<HTMLInputElement>('.email')!;
		const password = document.querySelector<HTMLInputElement>('.password')!;
		email.value = 'dev@gyos.test';
		password.value = 'Strong123';
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
		expect(state.signup.$valid()).toBe(true);
		expect(document.querySelectorAll('.summary div')).toHaveLength(0);
	});

	it('disposes form listeners and pending validation when a form is cleaned up', async () => {
		vi.useFakeTimers();
		const scopeName = `FormCleanupDocs${++id}`;
		const submitted = vi.fn();
		document.body.innerHTML = `
			<form id="cleanup-form" g-scope="${scopeName}" g-form="form" g-submit="submitForm">
				<input g-model="email" g-validate="required|email" />
			</form>
		`;
		Gyos.scope(scopeName, { email: '', submitForm: submitted });
		Gyos.mountAll();
		const form = document.getElementById('cleanup-form') as HTMLFormElement;
		const field = form.querySelector('input')!;

		field.value = 'invalid';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		Gyos.cleanup(form);
		await vi.advanceTimersByTimeAsync(300);

		const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
		form.dispatchEvent(submitEvent);
		await flush();
		expect(submitEvent.defaultPrevented).toBe(false);
		expect(submitted).not.toHaveBeenCalled();
	});

	it('covers the documented counter, toggle, debounce, local storage, and async composables', async () => {
		vi.useFakeTimers();
		const counter = Gyos.useCounter(2);
		expect(counter.count()).toBe(2);
		expect(counter.double()).toBe(4);
		counter.increment(3);
		await flush();
		expect(counter.count()).toBe(5);
		expect(counter.double()).toBe(10);
		counter.decrement(2);
		counter.reset();
		expect(counter.count()).toBe(2);

		const toggle = Gyos.useToggle();
		toggle.toggle();
		expect(toggle.state()).toBe(true);
		toggle.setFalse();
		expect(toggle.value()).toBe(false);

		const debounced = Gyos.useDebounce('first', 20);
		debounced.value('second');
		await flush();
		expect(debounced.debounced()).toBe('first');
		await vi.advanceTimersByTimeAsync(20);
		expect(debounced.debounced()).toBe('second');
		debounced.onUnmount();

		const persisted = Gyos.useLocalStorage('docs:key', 'initial');
		persisted.state('saved');
		await flush();
		expect(localStorage.getItem('docs:key')).toBe('"saved"');
		persisted.onUnmount();
		persisted.remove();
		expect(localStorage.getItem('docs:key')).toBeNull();

		const asyncState = Gyos.useAsync(async () => 'loaded', false);
		expect(asyncState.loading()).toBe(false);
		const execution = asyncState.execute();
		expect(asyncState.loading()).toBe(true);
		await execution;
		expect(asyncState.data()).toBe('loaded');
		expect(asyncState.loading()).toBe(false);
		expect(asyncState.error()).toBeNull();
	});

	it('covers callable signals, subscriptions, computed values, batch, and untrack', async () => {
		const first = Gyos.signal('Ada');
		const last = Gyos.signal('Lovelace');
		const full = Gyos.computed(() => `${first()} ${last()}`);
		const renders = vi.fn(() => full());
		const disposeEffect = Gyos.effect(renders);
		const subscription = vi.fn();
		const unsubscribe = first.subscribe(subscription);

		expect(Gyos.isSignal(first)).toBe(true);
		expect(Gyos.isComputed(full)).toBe(true);
		expect(Gyos.unref(first)).toBe('Ada');
		expect(Gyos.unref('plain')).toBe('plain');
		expect(renders).toHaveBeenCalledTimes(1);

		Gyos.batch(() => {
			first('Grace');
			last('Hopper');
		});
		await flush();
		expect(full()).toBe('Grace Hopper');
		expect(renders).toHaveBeenCalledTimes(2);
		expect(subscription).toHaveBeenCalledTimes(1);

		unsubscribe();
		first.update(value => `${value}!`);
		await flush();
		expect(subscription).toHaveBeenCalledTimes(1);

		const ignored = Gyos.signal(0);
		const trackedOnlyOnce = vi.fn();
		const disposeUntracked = Gyos.effect(() => {
			Gyos.untrack(() => ignored());
			trackedOnlyOnce();
		});
		ignored(1);
		await flush();
		expect(trackedOnlyOnce).toHaveBeenCalledTimes(1);

		disposeUntracked();
		disposeEffect();
	});

	it('only treats function returns from effects as cleanup callbacks', async () => {
		const source = Gyos.signal(0);
		const cleanup = vi.fn();
		const valueEffect = Gyos.effect(() => source());
		const cleanupEffect = Gyos.effect(() => {
			source();
			return cleanup;
		});

		source(1);
		await flush();
		expect(cleanup).toHaveBeenCalledTimes(1);

		valueEffect();
		cleanupEffect();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});

	it('reads registered and duration-modified transition configs', () => {
		Gyos.registerTransition('docs-pop', {
			enterFrom: 'opacity-0', enterTo: 'opacity-100',
			leaveFrom: 'opacity-100', leaveTo: 'opacity-0', duration: 250
		});
		expect(Gyos.getTransitionConfig('docs-pop')?.duration).toBe(250);

		const element = document.createElement('div');
		element.setAttribute('g-transition.150', 'docs-pop');
		expect(Gyos.getTransitionConfig(element)?.duration).toBe(150);
	});

	it('runs utility debounce, throttle, and nextTick contracts', async () => {
		vi.useFakeTimers();
		const debouncedTarget = vi.fn();
		const debounced = Gyos.debounce(debouncedTarget, 20);
		debounced('first');
		debounced('second');
		await vi.advanceTimersByTimeAsync(20);
		expect(debouncedTarget).toHaveBeenCalledTimes(1);
		expect(debouncedTarget).toHaveBeenCalledWith('second');

		const throttledTarget = vi.fn();
		const throttled = Gyos.throttle(throttledTarget, 20);
		vi.setSystemTime(100);
		throttled('first');
		throttled('ignored');
		vi.setSystemTime(120);
		throttled('second');
		expect(throttledTarget.mock.calls).toEqual([['first'], ['second']]);

		const ticked = vi.fn();
		Gyos.nextTick(ticked);
		await flush();
		expect(ticked).toHaveBeenCalledTimes(1);
	});
});
