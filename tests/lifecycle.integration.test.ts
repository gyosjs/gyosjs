import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('template lifecycle cleanup', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('runs custom directive hooks with current and previous values', async () => {
		const directiveName = `audit-lifecycle-${++id}`;
		const scopeName = `DirectiveLifecycle${id}`;
		const mounted = vi.fn();
		const updated = vi.fn();
		const unmounted = vi.fn();
		Gyos.directive(directiveName, { mounted, updated, unmounted });
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<div *if="show">
					<span g-${directiveName}="value"></span>
				</div>
			</div>
		`;
		Gyos.scope(scopeName, { show: true, value: 'A' });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		expect(mounted).toHaveBeenCalledTimes(1);
		expect(updated).not.toHaveBeenCalled();

		state.value = 'B';
		await flush();
		expect(updated).toHaveBeenCalledTimes(1);
		expect(updated.mock.calls[0][1]).toMatchObject({ value: 'B', oldValue: 'A' });

		state.show = false;
		await flush();
		expect(unmounted).toHaveBeenCalledTimes(1);
	});

	it('runs an updated-only directive during initial rendering', () => {
		const directiveName = `audit-updated-only-${++id}`;
		const scopeName = `UpdatedOnlyDirective${id}`;
		const updated = vi.fn((element: HTMLElement, binding: { value: string }) => {
			element.textContent = binding.value;
		});
		Gyos.directive(directiveName, { updated });
		document.body.innerHTML = `
			<div g-scope="${scopeName}">
				<span class="output" g-${directiveName}="value"></span>
			</div>
		`;
		Gyos.scope(scopeName, { value: 'Initial' });

		Gyos.mountAll();

		expect(updated).toHaveBeenCalledTimes(1);
		expect(updated.mock.calls[0][1]).toMatchObject({ value: 'Initial', oldValue: undefined });
		expect(document.querySelector('.output')!.textContent).toBe('Initial');
	});

	it('removes capture listeners when a structural branch is disposed', async () => {
		const scopeName = `CaptureCleanup${++id}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<button *if="show" class="target" @click.capture="count++">Count</button>
				<span class="count">{count}</span>
			</div>
		`;
		Gyos.scope(scopeName, { show: true, count: 0 });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const removedButton = document.querySelector('.target')!;

		state.show = false;
		await flush();
		expect(document.body.contains(removedButton)).toBe(false);

		removedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flush();
		expect(state.count).toBe(0);
	});

	it('mounts and unmounts a nested scope with its structural branch', async () => {
		const parentName = `LifecycleParent${++id}`;
		const childName = `LifecycleChild${id}`;
		const onMount = vi.fn();
		const onUnmount = vi.fn();
		document.body.innerHTML = `
			<div id="root" g-scope="${parentName}">
				<section *if="show">
					<div class="child" g-scope="${childName}">{message}</div>
				</section>
			</div>
		`;
		Gyos.scope(parentName, { show: true });
		Gyos.scope(childName, { message: 'Child', onMount, onUnmount });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		await flush();
		expect(document.querySelector('.child')!.textContent).toBe('Child');
		expect(onMount).toHaveBeenCalledTimes(1);

		state.show = false;
		await flush();
		expect(onUnmount).toHaveBeenCalledTimes(1);

		state.show = true;
		await flush();
		expect(document.querySelector('.child')!.textContent).toBe('Child');
		expect(onMount).toHaveBeenCalledTimes(2);
	});

	it('keeps a keyed row that is re-added while its old row is leaving', async () => {
		vi.useFakeTimers();
		const scopeName = `TransitionReuse${++id}`;
		const transitionName = `audit-leave-${id}`;
		Gyos.registerTransition(transitionName, { duration: 10 });
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<div class="row" *for="line in lines" g-key="line.id" g-transition="${transitionName}">
					{line.label}
				</div>
			</div>
		`;
		Gyos.scope(scopeName, { lines: [{ id: 1, label: 'Old' }] });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		state.lines.splice(0, 1);
		await flush();
		state.lines.push({ id: 1, label: 'New' });
		await flush();
		await vi.runAllTimersAsync();
		await flush();

		expect(document.querySelectorAll('.row')).toHaveLength(1);
		expect(document.querySelector('.row')!.textContent!.trim()).toBe('New');
	});

	it('cancels a debounced model update when its keyed row is removed', async () => {
		vi.useFakeTimers();
		const scopeName = `DebouncedModelCleanup${++id}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<div *for="line in lines" g-key="line.id">
					<input class="label" g-model.debounce.20.trim="line.label" />
				</div>
			</div>
		`;
		Gyos.scope(scopeName, {
			lines: [
				{ id: 1, label: 'First' },
				{ id: 2, label: 'Second' }
			]
		});
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const firstInput = document.querySelector<HTMLInputElement>('.label')!;

		firstInput.value = 'Stale update';
		firstInput.dispatchEvent(new Event('input', { bubbles: true }));
		state.lines.splice(0, 1);
		await flush();
		await vi.runAllTimersAsync();
		await flush();

		expect(state.lines).toHaveLength(1);
		expect(state.lines[0].label).toBe('Second');
	});

	it('does not register an outside listener after its element is removed', async () => {
		vi.useFakeTimers();
		const scopeName = `OutsideCleanup${++id}`;
		const addListener = vi.spyOn(document, 'addEventListener');
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<div *if="show" class="menu" @click.outside="closed++">Menu</div>
			</div>
		`;
		Gyos.scope(scopeName, { show: true, closed: 0 });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		state.show = false;
		await flush();
		await vi.runAllTimersAsync();

		const outsideRegistrations = addListener.mock.calls.filter(([event]) => event === 'click');
		expect(outsideRegistrations).toHaveLength(0);
	});

	it('keeps outside handling active when a portal moves the element', async () => {
		vi.useFakeTimers();
		const scopeName = `PortalOutside${++id}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${scopeName}">
				<div *if="showModal" class="overlay" g-portal="#modal-root">
					<div class="modal" @click.outside="closeModal">Modal</div>
				</div>
			</div>
			<div id="modal-root"></div>
		`;
		Gyos.scope(scopeName, {
			showModal: true,
			closeModal() {
				this.showModal = false;
			}
		});
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		await flush();
		await vi.runAllTimersAsync();
		document.querySelector('.overlay')!.dispatchEvent(
			new MouseEvent('click', { bubbles: true })
		);
		await flush();

		expect(state.showModal).toBe(false);
		expect(document.querySelector('.overlay')).toBeNull();
	});
});
