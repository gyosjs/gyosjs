import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('advanced documentation contracts', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('restores a persisted scope instance when its DOM is recreated', async () => {
		const name = `PersistedDocs${++id}`;
		Gyos.scope(name, { count: 1 });
		document.body.innerHTML = `
			<section id="first" g-scope="${name}" g-scope-persist="editor-session">{count}</section>
		`;

		Gyos.mountAll();
		const first = document.getElementById('first')!;
		const originalState = Gyos.mountedScopes().get(first);
		originalState.count = 7;
		await flush();
		expect(first.textContent).toBe('7');

		Gyos.cleanup(first);
		first.remove();
		document.body.innerHTML = `
			<section id="second" g-scope="${name}" g-scope-persist="editor-session">{count}</section>
		`;
		Gyos.mountAll();

		const second = document.getElementById('second')!;
		expect(Gyos.mountedScopes().get(second)).toBe(originalState);
		expect(second.textContent).toBe('7');
	});

	it('supports markup DI, scope-channel events, and reactive Markdown', async () => {
		const name = `DirectiveDocsAdvanced${++id}`;
		document.body.innerHTML = `
			<section g-provide='{"theme":"dark"}'>
				<div id="root" g-scope="${name}">
					<button @click="$emit('article-updated', 'Published')">Publish</button>
					<div class="listener" g-on:article-updated="handleArticle"></div>
					<article g-markdown="articleBody"></article>
				</div>
			</section>
		`;
		Gyos.scope(name, {
			articleBody: '# Draft',
			theme: '',
			handleArticle(this: any, status: string) {
				this.articleBody = `## ${status}`;
			},
			onMount(this: any) {
				this.theme = this.$inject('theme');
			}
		});

		Gyos.mountAll();
		const root = document.getElementById('root')!;
		const state = Gyos.mountedScopes().get(root);
		expect(state.theme).toBe('dark');
		expect(document.querySelector('article h1')!.textContent).toBe('Draft');

		document.querySelector('button')!.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true })
		);
		await flush();
		expect(document.querySelector('article h2')!.textContent).toBe('Published');

		state.articleBody = '<img src=x onerror="window.markdownXss = true">\n[unsafe](javascript:alert(1))';
		await flush();
		const article = document.querySelector('article')!;
		expect(article.querySelector('img')).toBeNull();
		expect(article.querySelector('a')).toBeNull();
		expect(article.textContent).toContain('<img src=x onerror="window.markdownXss = true">');
	});

	it('accepts only JSON objects from g-provide markup', () => {
		const name = `JsonProviderDocs${++id}`;
		(window as any).__gyosProviderExecuted = false;
		document.body.innerHTML = `
			<section g-provide="(globalThis.__gyosProviderExecuted = true, { theme: 'bad' })">
				<div g-scope="${name}">Content</div>
			</section>
		`;
		Gyos.scope(name, {
			onMount(this: any) {
				try { this.$inject('theme'); } catch { /* Invalid providers expose nothing. */ }
			}
		});
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		Gyos.mountAll();

		expect((window as any).__gyosProviderExecuted).toBe(false);
	});

	it('hydrates visible and media scopes only after their conditions match', async () => {
		const observers: Array<(entries: Array<{ target: Element; isIntersecting: boolean }>) => void> = [];
		const observe = vi.fn();
		const unobserve = vi.fn();
		vi.stubGlobal('IntersectionObserver', class {
			constructor(callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {
				observers.push(callback);
			}
			observe = observe;
			unobserve = unobserve;
		});

		let mediaHandler: ((event: { matches: boolean }) => void) | undefined;
		const mediaList = {
			matches: false,
			addEventListener: vi.fn((_event: string, handler: (event: { matches: boolean }) => void) => {
				mediaHandler = handler;
			}),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal('matchMedia', vi.fn(() => mediaList));

		const visibleName = `VisibleDocs${++id}`;
		const mediaName = `MediaDocs${id}`;
		document.body.innerHTML = `
			<div id="visible" g-scope="${visibleName}" g-hydrate="visible">{message}</div>
			<div id="media" g-scope="${mediaName}" g-hydrate="media(max-width: 640px)">{message}</div>
		`;
		Gyos.scope(visibleName, { message: 'Visible' });
		Gyos.scope(mediaName, { message: 'Mobile' });

		Gyos.mountAll();
		const visible = document.getElementById('visible')!;
		const media = document.getElementById('media')!;
		expect(Gyos.mountedScopes().has(visible)).toBe(false);
		expect(Gyos.mountedScopes().has(media)).toBe(false);
		expect(observe).toHaveBeenCalledWith(visible);
		expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 640px)');

		observers[0]([{ target: visible, isIntersecting: true }]);
		mediaHandler?.({ matches: true });
		await flush();

		expect(visible.textContent).toBe('Visible');
		expect(media.textContent).toBe('Mobile');
		expect(unobserve).toHaveBeenCalledWith(visible);
		expect(mediaList.removeEventListener).toHaveBeenCalledWith('change', mediaHandler);
	});

	it('cancels deferred hydration when its element is cleaned before mounting', async () => {
		vi.useFakeTimers();
		let mediaHandler: ((event: { matches: boolean }) => void) | undefined;
		const removeMediaListener = vi.fn();
		vi.stubGlobal('matchMedia', vi.fn(() => ({
			matches: false,
			addEventListener: (_event: string, handler: (event: { matches: boolean }) => void) => {
				mediaHandler = handler;
			},
			removeEventListener: removeMediaListener
		})));
		const interactionName = `CancelledInteraction${++id}`;
		const mediaName = `CancelledMedia${id}`;
		document.body.innerHTML = `
			<div id="interaction" g-scope="${interactionName}" g-hydrate="interaction">{message}</div>
			<div id="media" g-scope="${mediaName}" g-hydrate="media(min-width: 900px)">{message}</div>
		`;
		Gyos.scope(interactionName, { message: 'Should not mount' });
		Gyos.scope(mediaName, { message: 'Should not mount' });

		Gyos.mountAll();
		const interaction = document.getElementById('interaction')!;
		const media = document.getElementById('media')!;
		Gyos.cleanup(interaction);
		Gyos.cleanup(media);
		interaction.dispatchEvent(new MouseEvent('mouseenter'));
		mediaHandler?.({ matches: true });
		await vi.runAllTimersAsync();
		await flush();

		expect(Gyos.mountedScopes().has(interaction)).toBe(false);
		expect(Gyos.mountedScopes().has(media)).toBe(false);
		expect(interaction.textContent).toBe('{message}');
		expect(media.textContent).toBe('{message}');
		expect(removeMediaListener).toHaveBeenCalled();
	});

	it('does not register deferred hydration more than once across mountAll calls', async () => {
		const name = `IdempotentHydration${++id}`;
		const onMount = vi.fn();
		document.body.innerHTML = `
			<div id="deferred" g-scope="${name}" g-hydrate="interaction">{message}</div>
		`;
		Gyos.scope(name, { message: 'Mounted once', onMount });

		Gyos.mountAll();
		Gyos.mountAll();
		const deferred = document.getElementById('deferred')!;
		deferred.dispatchEvent(new MouseEvent('mouseenter'));
		await flush();

		expect(onMount).toHaveBeenCalledTimes(1);
		expect(Gyos.mountedScopes().get(deferred).message).toBe('Mounted once');
	});

	it('updates nested array model paths and auto-creates plain model fields', async () => {
		const name = `NestedModelDocs${++id}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<input class="nested" g-model.trim="items[0].title">
				<input class="automatic" g-model="note" value="Initial note">
				<p>{items[0].title}|{note}</p>
			</div>
		`;
		Gyos.scope(name, { items: [{ title: 'First' }] });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		expect(state.note).toBe('Initial note');

		const nested = document.querySelector<HTMLInputElement>('.nested')!;
		nested.value = '  Updated  ';
		nested.dispatchEvent(new Event('input', { bubbles: true }));
		const automatic = document.querySelector<HTMLInputElement>('.automatic')!;
		automatic.value = 'Changed';
		automatic.dispatchEvent(new Event('input', { bubbles: true }));
		await flush();

		expect(state.items[0].title).toBe('Updated');
		expect(state.note).toBe('Changed');
		expect(document.querySelector('p')!.textContent).toBe('Updated|Changed');
	});

	it('runs custom transition hooks around structural enter and leave', async () => {
		vi.useFakeTimers();
		const name = `TransitionDocs${++id}`;
		const beforeEnter = vi.fn();
		const afterEnter = vi.fn();
		const beforeLeave = vi.fn();
		const afterLeave = vi.fn();
		const transitionName = `docs-transition-${id}`;
		Gyos.registerTransition(transitionName, {
			enterFrom: 'enter-from',
			enterTo: 'enter-to',
			leaveFrom: 'leave-from',
			leaveTo: 'leave-to',
			duration: 10,
			onBeforeEnter: beforeEnter,
			onAfterEnter: afterEnter,
			onBeforeLeave: beforeLeave,
			onAfterLeave: afterLeave
		});
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<p *if="open" g-transition="${transitionName}">Panel</p>
			</div>
		`;
		Gyos.scope(name, { open: false });

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		expect(document.querySelector('p')).toBeNull();

		state.open = true;
		await flush();
		await vi.advanceTimersByTimeAsync(16);
		expect(beforeEnter).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60);
		expect(afterEnter).toHaveBeenCalledTimes(1);

		state.open = false;
		await flush();
		expect(beforeLeave).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60);
		expect(afterLeave).toHaveBeenCalledTimes(1);
		expect(document.querySelector('p')).toBeNull();
	});

	it('does not let a nested transition event finish its parent leave', async () => {
		vi.useFakeTimers();
		const name = `NestedTransitionDocs${++id}`;
		const parentTransition = `parent-transition-${id}`;
		const childTransition = `child-transition-${id}`;
		Gyos.registerTransition(parentTransition, { duration: 100 });
		Gyos.registerTransition(childTransition, { duration: 10 });
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<section *if="open" class="parent-transition" g-transition="${parentTransition}">
					<span class="child-transition" g-transition="${childTransition}">Child</span>
				</section>
			</div>
		`;
		Gyos.scope(name, { open: true });
		Gyos.mountAll();
		await vi.runAllTimersAsync();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		state.open = false;
		await flush();
		const parent = document.querySelector('.parent-transition')!;
		const child = document.querySelector('.child-transition')!;
		child.dispatchEvent(new Event('transitionend', { bubbles: true }));
		await flush();
		expect(parent.isConnected).toBe(true);

		parent.dispatchEvent(new Event('transitionend', { bubbles: true }));
		await flush();
		expect(parent.isConnected).toBe(false);
	});

	it('does not start a stale enter frame after the element begins leaving', async () => {
		vi.useFakeTimers();
		const name = `StaleEnterDocs${++id}`;
		const transitionName = `stale-enter-${id}`;
		const beforeEnter = vi.fn();
		const beforeLeave = vi.fn();
		Gyos.registerTransition(transitionName, {
			duration: 10,
			onBeforeEnter: beforeEnter,
			onBeforeLeave: beforeLeave
		});
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<p *if="open" class="rapid-panel" g-transition="${transitionName}">Panel</p>
			</div>
		`;
		Gyos.scope(name, { open: false });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		state.open = true;
		await flush();
		state.open = false;
		await flush();
		await vi.runAllTimersAsync();
		await flush();

		expect(beforeEnter).not.toHaveBeenCalled();
		expect(beforeLeave).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.rapid-panel')).toBeNull();
	});
});
