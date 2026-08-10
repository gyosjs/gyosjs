import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let scopeId = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

const input = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = (element: Element) => {
	element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

describe('documentation template contracts', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('supports inline, auto, model-created, method, ref, and computed scope syntax', async () => {
		document.body.innerHTML = `
			<div id="inline" g-scope="%7B%20name%3A%20'GyosJS'%2C%20count%3A%202%20%7D">
				<span>{name}:{count * 2}</span>
			</div>
			<div id="auto" gd-count="0" gd-user-name="Ada" gm-increment:step="count += step">
				<input g-ref="editor" g-model="message" value="Hello" />
				<button @click="increment(2)">Increase</button>
				<p>{userName}:{message}:{count}</p>
				<button class="focus" @click="$refs.editor.focus()">Focus</button>
			</div>
		`;

		Gyos.mountAll();

		expect(document.querySelector('#inline span')!.textContent).toBe('GyosJS:4');
		expect(document.querySelector('#auto p')!.textContent).toBe('Ada:Hello:0');
		click(document.querySelector('#auto button')!);
		await flush();
		expect(document.querySelector('#auto p')!.textContent).toBe('Ada:Hello:2');

		click(document.querySelector('.focus')!);
		expect(document.activeElement).toBe(document.querySelector('#auto input'));
	});

	it('leaves g-ignore elements and their entire subtree untouched', async () => {
		const parentName = `IgnoreParent${++scopeId}`;
		const childName = `IgnoreChild${scopeId}`;
		document.body.innerHTML = `
			<div id="ignore-root" g-scope="${parentName}">
				<p class="reactive-sibling">{message}</p>
				<section id="ignored" g-ignore :title="message" g-show="visible">
					<span class="literal">{message}</span>
					<button @click="count++">Ignored event</button>
					<input g-model="message" value="server value">
					<p class="ignored-if" *if="visible">Ignored structural</p>
					<span g-ref="ignoredRef">Ignored ref</span>
					<div id="ignored-child" g-scope="${childName}">{childValue}</div>
					<div id="ignored-auto" gd-count="1">{count}</div>
				</section>
				<div g-static>
					<span class="static-value">{message}</span>
					<span class="static-ignored" g-ignore>{message}</span>
				</div>
				<div *if="showBlock">
					<span class="cloned-ignored" g-ignore g-transition="fade">{message}</span>
				</div>
				<span g-ref="activeRef">Active ref</span>
			</div>
		`;
		Gyos.scope(parentName, { message: 'Initial', count: 0, visible: false, showBlock: true });
		Gyos.scope(childName, { childValue: 'mounted child' });

		Gyos.mountAll();
		const root = document.getElementById('ignore-root')!;
		const ignored = document.getElementById('ignored')!;
		const state = Gyos.mountedScopes().get(root);

		expect(document.querySelector('.reactive-sibling')!.textContent).toBe('Initial');
		expect(document.querySelector('.literal')!.textContent).toBe('{message}');
		expect(ignored.hasAttribute(':title')).toBe(true);
		expect(ignored.hasAttribute('title')).toBe(false);
		expect(ignored.style.display).toBe('');
		expect(document.querySelector('.ignored-if')!.hasAttribute('*if')).toBe(true);
		expect((ignored.querySelector('input') as HTMLInputElement).value).toBe('server value');
		expect(ignored.querySelector('input')!.hasAttribute('g-model')).toBe(true);
		expect(document.querySelector('.static-value')!.textContent).toBe('Initial');
		expect(document.querySelector('.static-ignored')!.textContent).toBe('{message}');
		const clonedIgnored = document.querySelector('.cloned-ignored') as HTMLElement;
		expect(clonedIgnored.textContent).toBe('{message}');
		expect((clonedIgnored as any).__gyos_scope__).toBeUndefined();
		expect(state.$refs.activeRef).toBe(document.querySelector('[g-ref="activeRef"]'));
		expect(state.$refs.ignoredRef).toBeUndefined();
		expect(Gyos.mountedScopes().has(document.getElementById('ignored-child')!)).toBe(false);
		expect(Gyos.mountedScopes().has(document.getElementById('ignored-auto')!)).toBe(false);

		click(ignored.querySelector('button')!);
		input(ignored.querySelector('input')!, 'changed by browser');
		state.message = 'Changed';
		await flush();
		expect(state.count).toBe(0);
		expect(state.message).toBe('Changed');
		expect(document.querySelector('.reactive-sibling')!.textContent).toBe('Changed');
		expect(document.querySelector('.literal')!.textContent).toBe('{message}');

		Gyos.mountAll();
		Gyos.mountTree(ignored);
		expect(Gyos.mountedScopes().has(document.getElementById('ignored-child')!)).toBe(false);
		expect(document.querySelector('.literal')!.textContent).toBe('{message}');
	});

	it('does not mount a scope whose root has g-ignore', () => {
		const name = `IgnoredRoot${++scopeId}`;
		const onMount = vi.fn();
		document.body.innerHTML = `<div id="fully-ignored" g-ignore g-scope="${name}">{message}</div>`;
		Gyos.scope(name, { message: 'must not render', onMount });
		const root = document.getElementById('fully-ignored')!;

		Gyos.mountAll();
		Gyos.mount(root);
		Gyos.mountTree(document.body);

		expect(root.textContent).toBe('{message}');
		expect(root.hasAttribute('g-ignore')).toBe(true);
		expect(Gyos.mountedScopes().has(root)).toBe(false);
		expect(onMount).not.toHaveBeenCalled();
	});

	it('does not hydrate a pending scope after it enters a g-ignore boundary', () => {
		const name = `IgnoredHydration${++scopeId}`;
		const onMount = vi.fn();
		document.body.innerHTML = `
			<div id="ignore-owner">
				<div id="deferred-ignore" g-scope="${name}" g-hydrate="interaction">{message}</div>
			</div>
		`;
		Gyos.scope(name, { message: 'must not render', onMount });
		Gyos.mountAll();

		const owner = document.getElementById('ignore-owner')!;
		const deferred = document.getElementById('deferred-ignore')!;
		owner.setAttribute('g-ignore', '');
		deferred.dispatchEvent(new MouseEvent('mouseenter'));

		expect(deferred.textContent).toBe('{message}');
		expect(Gyos.mountedScopes().has(deferred)).toBe(false);
		expect(onMount).not.toHaveBeenCalled();
	});

	it('does not collect ignored structural branches', async () => {
		const name = `IgnoredStructural${++scopeId}`;
		const explode = vi.fn(() => { throw new Error('ignored expression ran'); });
		document.body.innerHTML = `
			<div g-scope="${name}">
				<p *if="false">Normal if</p>
				<p class="ignored-elseif" g-ignore *elseif="explode()">{message}</p>
				<div *switch="status">
					<span class="ignored-case" g-ignore *case="explode()">{message}</span>
					<span class="normal-default" *default>Default branch</span>
				</div>
				<div *await="request">
					<span class="ignored-pending" g-ignore *pending>{message}</span>
					<span class="normal-then" *then="result">{result}</span>
				</div>
			</div>
		`;
		Gyos.scope(name, {
			message: 'must stay literal',
			status: 'other',
			request: Promise.resolve('resolved'),
			explode
		});

		Gyos.mountAll();
		await vi.waitFor(() => expect(document.querySelector('.normal-then')?.textContent).toBe('resolved'));

		expect(explode).not.toHaveBeenCalled();
		expect(document.querySelector('.ignored-elseif')!.hasAttribute('*elseif')).toBe(true);
		expect(document.querySelector('.ignored-elseif')!.textContent).toBe('{message}');
		expect(document.querySelector('.ignored-case')!.hasAttribute('*case')).toBe(true);
		expect(document.querySelector('.ignored-case')!.textContent).toBe('{message}');
		expect(document.querySelector('.normal-default')!.textContent).toBe('Default branch');
		expect(document.querySelector('.ignored-pending')!.hasAttribute('*pending')).toBe(true);
		expect(document.querySelector('.ignored-pending')!.textContent).toBe('{message}');
	});

	it('keeps documented attribute bindings reactive', async () => {
		const name = `BindingDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<img class="image" :src="src" :alt="alt" :title="title" />
				<a class="link" :href="href">Docs</a>
				<script class="dynamic-script" :src="scriptUrl"></script>
				<p class="base" :class="{ active: active }" :style="{ color: color, fontSize: size + 'px' }">Styled</p>
				<button :disabled="disabled">Save</button>
				<input class="readonly" :readonly="readonly" />
				<input class="checked" type="checkbox" :checked="checked" />
				<input class="value" :value="value" />
				<option :selected="selected">Choice</option>
			</div>
		`;
		Gyos.scope(name, {
			src: '/one.png', alt: 'One', title: 'First', href: '/docs', scriptUrl: 'https://cdn.example/app.js', active: true,
			color: 'red', size: 18, disabled: true, readonly: true, checked: true,
			value: 'Initial', selected: true
		});

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const image = document.querySelector<HTMLImageElement>('.image')!;
		const styled = document.querySelector<HTMLElement>('p')!;

		expect(image.getAttribute('alt')).toBe('One');
		expect(image.getAttribute('title')).toBe('First');
		expect(image.getAttribute('src')).toBe('/one.png');
		expect(document.querySelector('.link')!.getAttribute('href')).toBe('/docs');
		expect(document.querySelector('.dynamic-script')!.hasAttribute('src')).toBe(false);
		expect(styled.classList.contains('base')).toBe(true);
		expect(styled.classList.contains('active')).toBe(true);
		expect(styled.style.color).toBe('red');
		expect(styled.style.fontSize).toBe('18px');
		expect(document.querySelector('button')!.hasAttribute('disabled')).toBe(true);
		expect(document.querySelector('.readonly')!.hasAttribute('readonly')).toBe(true);
		expect(document.querySelector('.checked')!.hasAttribute('checked')).toBe(true);
		expect(document.querySelector('.value')!.getAttribute('value')).toBe('Initial');
		expect(document.querySelector('option')!.hasAttribute('selected')).toBe(true);

		Object.assign(state, {
			src: '/two.png', alt: 'Two', title: 'Second', href: '/api', active: false,
			color: 'blue', size: 20, disabled: false, readonly: false, checked: false,
			value: 'Updated', selected: false
		});
		await flush();

		expect(image.getAttribute('alt')).toBe('Two');
		expect(image.getAttribute('title')).toBe('Second');
		expect(image.getAttribute('src')).toBe('/two.png');
		expect(document.querySelector('.link')!.getAttribute('href')).toBe('/api');
		expect(styled.classList.contains('active')).toBe(false);
		expect(styled.style.color).toBe('blue');
		expect(styled.style.fontSize).toBe('20px');
		expect(document.querySelector('button')!.hasAttribute('disabled')).toBe(false);
		expect(document.querySelector('.readonly')!.hasAttribute('readonly')).toBe(false);
		expect(document.querySelector('.checked')!.hasAttribute('checked')).toBe(false);
		expect(document.querySelector('.value')!.getAttribute('value')).toBe('Updated');
		expect(document.querySelector('option')!.hasAttribute('selected')).toBe(false);

		state.href = 'java\nscript:alert(1)';
		state.src = 'data:image/svg+xml,<svg onload=alert(1)></svg>';
		await flush();
		expect(document.querySelector('.link')!.hasAttribute('href')).toBe(false);
		expect(image.hasAttribute('src')).toBe(false);
	});

	it('supports documented model controls, modifiers, nested paths, and programmatic updates', async () => {
		const name = `ModelDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<input class="name" g-model.trim="user.name" />
				<input class="age" g-model.number="age" />
				<input class="accepted" type="checkbox" g-model="accepted" />
				<select class="category" g-model="category">
					<option value="news">News</option>
					<option value="guide">Guide</option>
				</select>
				<textarea class="message" g-model="message"></textarea>
				<p>{user.name}|{age}|{accepted}|{category}|{message}</p>
			</div>
		`;
		Gyos.scope(name, {
			user: { name: 'Ada' }, age: 20, accepted: false, category: 'news', message: 'Hello'
		});

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		input(document.querySelector('.name')!, '  Grace  ');
		input(document.querySelector('.age')!, '42');
		const checkbox = document.querySelector<HTMLInputElement>('.accepted')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('input', { bubbles: true }));
		input(document.querySelector('.category')!, 'guide');
		input(document.querySelector('.message')!, 'Updated');
		await flush();

		expect(state.user.name).toBe('Grace');
		expect(state.age).toBe(42);
		expect(state.accepted).toBe(true);
		expect(state.category).toBe('guide');
		expect(state.message).toBe('Updated');
		expect(document.querySelector('p')!.textContent).toBe('Grace|42|true|guide|Updated');

		state.user.name = 'Programmatic';
		state.category = 'news';
		state.accepted = false;
		await flush();
		expect((document.querySelector('.name') as HTMLInputElement).value).toBe('Programmatic');
		expect((document.querySelector('.category') as HTMLSelectElement).value).toBe('news');
		expect(checkbox.checked).toBe(false);
	});

	it('preserves radio values and synchronizes the checked option with g-model', async () => {
		const name = `RadioModelDocs${++scopeId}`;
		const autoName = `AutoRadioModelDocs${scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<input class="time-10" type="radio" name="time" value="10:00" g-model="time" />
				<input class="time-11" type="radio" name="time" value="11:00" g-model="time" />
				<input class="duration-30" type="radio" name="duration" value="30" g-model.number="duration" />
				<input class="duration-60" type="radio" name="duration" value="60" g-model.number="duration" />
			</div>
			<div id="auto-root" g-scope="${autoName}">
				<input class="auto-standard" type="radio" name="format" value="standard" g-model="format" />
				<input class="auto-premium" type="radio" name="format" value="premium" g-model="format" checked />
			</div>
		`;
		Gyos.scope(name, { time: '', duration: 30 });
		Gyos.scope(autoName, {});

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const time10 = document.querySelector<HTMLInputElement>('.time-10')!;
		const time11 = document.querySelector<HTMLInputElement>('.time-11')!;
		const duration30 = document.querySelector<HTMLInputElement>('.duration-30')!;
		const duration60 = document.querySelector<HTMLInputElement>('.duration-60')!;
		const autoState = Gyos.mountedScopes().get(document.getElementById('auto-root')!);

		expect(time10.value).toBe('10:00');
		expect(time11.value).toBe('11:00');
		expect(time10.checked).toBe(false);
		expect(time11.checked).toBe(false);
		expect(duration30.checked).toBe(true);
		expect(duration60.checked).toBe(false);
		expect(autoState.format).toBe('premium');
		expect(document.querySelector<HTMLInputElement>('.auto-standard')!.value).toBe('standard');
		expect(document.querySelector<HTMLInputElement>('.auto-premium')!.value).toBe('premium');

		time11.checked = true;
		time11.dispatchEvent(new Event('input', { bubbles: true }));
		duration60.checked = true;
		duration60.dispatchEvent(new Event('input', { bubbles: true }));
		await flush();

		expect(state.time).toBe('11:00');
		expect(state.duration).toBe(60);

		state.time = '10:00';
		state.duration = 30;
		await flush();
		expect(time10.checked).toBe(true);
		expect(time11.checked).toBe(false);
		expect(duration30.checked).toBe(true);
		expect(duration60.checked).toBe(false);
	});

	it('renders if, switch, keyed for, static, text, html, show, and pipe syntax', async () => {
		const name = `DirectiveDocs${++scopeId}`;
		const pipeName = `surroundDocs${scopeId}`;
		Gyos.pipe(pipeName, (value, left, right) => `${left}${value}${right}`);
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<p class="if-one" *if="step === 1">One</p>
				<p class="if-two" *elseif="step === 2">Two</p>
				<p class="if-other" *else>Other</p>
				<div *switch="status">
					<span class="loading" *case="'loading'">Loading</span>
					<span class="done" *case="'done'">Done</span>
					<span class="unknown" *default>Unknown</span>
				</div>
				<ul><li *for="item in items" g-key="item.id">{$index}:{item.label}</li></ul>
				<div class="shown" g-show="visible">Visible</div>
				<div class="text" g-text="plain"></div>
				<div class="html" g-html="markup"></div>
				<h1 g-static>{title}</h1>
				<p class="piped">{plain | ${pipeName}('[', ']')}</p>
			</div>
		`;
		Gyos.scope(name, {
			step: 1, status: 'loading', items: [{ id: 1, label: 'A' }], visible: true,
			plain: '<hello>', markup: '<strong>HTML</strong>', title: 'Initial'
		});

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		expect(document.querySelector('.if-one')!.textContent).toBe('One');
		expect(document.querySelector('.loading')!.textContent).toBe('Loading');
		expect(document.querySelector('li')!.textContent).toBe('0:A');
		expect(document.querySelector('.text')!.textContent).toBe('<hello>');
		expect(document.querySelector('.html strong')!.textContent).toBe('HTML');
		expect(document.querySelector('.piped')!.textContent).toBe('[<hello>]');

		Object.assign(state, {
			step: 2, status: 'done', visible: false, plain: 'Changed', markup: '<em>Changed</em>', title: 'Changed'
		});
		state.items.push({ id: 2, label: 'B' });
		await flush();

		expect(document.querySelector('.if-one')).toBeNull();
		expect(document.querySelector('.if-two')!.textContent).toBe('Two');
		expect(document.querySelector('.done')!.textContent).toBe('Done');
		expect(Array.from(document.querySelectorAll('li'), el => el.textContent)).toEqual(['0:A', '1:B']);
		expect((document.querySelector('.shown') as HTMLElement).style.display).toBe('none');
		expect(document.querySelector('.text')!.textContent).toBe('Changed');
		expect(document.querySelector('.html em')!.textContent).toBe('Changed');
		expect(document.querySelector('h1')!.textContent).toBe('Initial');
	});

	it('runs event modifiers with the documented semantics', async () => {
		vi.useFakeTimers();
		const name = `EventDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<button class="once" @click.once="count++">Once</button>
				<input class="debounced" @input.debounce.50="count++" />
				<div class="parent" @click="parentCount++">
					<button class="stop" @click.stop.prevent="count++">Stop</button>
				</div>
				<div class="escape" @keydown.escape.global="open = false"></div>
			</div>
		`;
		Gyos.scope(name, { count: 0, parentCount: 0, open: true });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		click(document.querySelector('.once')!);
		click(document.querySelector('.once')!);
		const stopEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
		document.querySelector('.stop')!.dispatchEvent(stopEvent);
		expect(stopEvent.defaultPrevented).toBe(true);
		expect(state.parentCount).toBe(0);

		const debounced = document.querySelector('.debounced')!;
		debounced.dispatchEvent(new Event('input', { bubbles: true }));
		debounced.dispatchEvent(new Event('input', { bubbles: true }));
		await vi.advanceTimersByTimeAsync(49);
		expect(state.count).toBe(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(state.count).toBe(3);

		document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(state.open).toBe(true);
		document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(state.open).toBe(false);
	});

	it('matches every documented keyboard alias without accepting unrelated keys', () => {
		const name = `KeyboardAliasDocs${++scopeId}`;
		const aliases = [
			['enter', 'Enter'],
			['esc', 'Escape'],
			['escape', 'Escape'],
			['space', ' '],
			['up', 'ArrowUp'],
			['down', 'ArrowDown'],
			['left', 'ArrowLeft'],
			['right', 'ArrowRight'],
			['delete', 'Delete'],
			['tab', 'Tab']
		];
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				${aliases.map(([alias]) =>
					`<input data-key="${alias}" @keydown.${alias}="hits.${alias}++">`
				).join('')}
			</div>
		`;
		Gyos.scope(name, {
			hits: Object.fromEntries(aliases.map(([alias]) => [alias, 0]))
		});
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		aliases.forEach(([alias, key]) => {
			const element = document.querySelector(`[data-key="${alias}"]`)!;
			element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true }));
			element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		});
		document.querySelector('[data-key="delete"]')!.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
		);

		aliases.forEach(([alias]) => {
			expect(state.hits[alias]).toBe(alias === 'delete' ? 2 : 1);
		});
	});

	it('consumes once only after a matching key or outside event runs', async () => {
		vi.useFakeTimers();
		const name = `OnceFilterDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<input class="enter-once" @keydown.enter.once="keyCount++">
				<div class="outside-once" @click.outside.once="outsideCount++">Menu</div>
			</div>
		`;
		Gyos.scope(name, { keyCount: 0, outsideCount: 0 });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const input = document.querySelector('.enter-once')!;

		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await vi.runAllTimersAsync();
		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(state.keyCount).toBe(1);
		expect(state.outsideCount).toBe(1);
	});

	it('consumes once before an accepted handler can synchronously re-enter', () => {
		const name = `OnceReentryDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<button class="reentrant" @click.once="reenter">Run once</button>
			</div>
		`;
		Gyos.scope(name, {
			count: 0,
			reenter(event: Event) {
				this.count++;
				if (this.count === 1) event.currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			}
		});
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);

		click(document.querySelector('.reentrant')!);

		expect(state.count).toBe(1);
	});

	it('keeps the latest promise result in an await block', async () => {
		const name = `AwaitDocs${++scopeId}`;
		let resolveFirst!: (value: { title: string }) => void;
		let resolveSecond!: (value: { title: string }) => void;
		const first = new Promise<{ title: string }>(resolve => { resolveFirst = resolve; });
		const second = new Promise<{ title: string }>(resolve => { resolveSecond = resolve; });
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<div *await="request">
					<p class="pending" *pending>Loading</p>
					<p class="result" *then="result">{result.title}</p>
					<p class="error" *catch="error">{error.message}</p>
				</div>
			</div>
		`;
		Gyos.scope(name, { request: first });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		expect(document.querySelector('.pending')!.textContent).toBe('Loading');

		state.request = second;
		await flush();
		resolveFirst({ title: 'Stale' });
		await flush();
		expect(document.querySelector('.pending')!.textContent).toBe('Loading');

		resolveSecond({ title: 'Latest' });
		await flush();
		expect(document.querySelector('.result')!.textContent).toBe('Latest');
	});

	it('runs the documented debounced search with a function-style computed list', async () => {
		vi.useFakeTimers();
		const name = `SearchDocs${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<input g-model.debounce.20="search" />
				<ul><li *for="student in filteredStudents" g-key="student.name">{student.name}:{student.age}</li></ul>
			</div>
		`;
		Gyos.scope(name, {
			students: [
				{ name: 'Alice', age: 20 },
				{ name: 'Bob', age: 22 },
				{ name: 'Charlie', age: 23 }
			],
			filteredStudents() {
				return this.students.filter((student: { name: string; age: number }) =>
					student.name.toLowerCase().includes(this.search.toLowerCase()) ||
					student.age.toString() === this.search
				);
			}
		});

		Gyos.mountAll();
		expect(Array.from(document.querySelectorAll('li'), el => el.textContent)).toEqual([
			'Alice:20', 'Bob:22', 'Charlie:23'
		]);
		input(document.querySelector('input')!, '22');
		await vi.advanceTimersByTimeAsync(20);
		await flush();
		expect(Array.from(document.querySelectorAll('li'), el => el.textContent)).toEqual(['Bob:22']);
	});

	it('delays interaction and idle hydration until their trigger', async () => {
		vi.useFakeTimers();
		const interactionName = `InteractionDocs${++scopeId}`;
		const idleName = `IdleDocs${scopeId}`;
		const interactionMount = vi.fn();
		const idleMount = vi.fn();
		document.body.innerHTML = `
			<div id="interaction" g-scope="${interactionName}" g-hydrate="interaction">{message}</div>
			<div id="idle" g-scope="${idleName}" g-hydrate="idle">{message}</div>
		`;
		Gyos.scope(interactionName, { message: 'Interactive', onMount: interactionMount });
		Gyos.scope(idleName, { message: 'Idle', onMount: idleMount });

		Gyos.mountAll();
		expect(Gyos.mountedScopes().has(document.getElementById('interaction')!)).toBe(false);
		expect(Gyos.mountedScopes().has(document.getElementById('idle')!)).toBe(false);

		document.getElementById('interaction')!.dispatchEvent(new MouseEvent('mouseenter'));
		await flush();
		expect(document.getElementById('interaction')!.textContent).toBe('Interactive');
		expect(interactionMount).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		await flush();
		expect(document.getElementById('idle')!.textContent).toBe('Idle');
		expect(idleMount).toHaveBeenCalledTimes(1);
	});

	it('passes custom directive arguments and reactive values', async () => {
		const directiveName = `docs-color-${++scopeId}`;
		const mounted = vi.fn();
		const updated = vi.fn();
		Gyos.directive(directiveName, { mounted, updated });
		document.body.innerHTML = `
			<div id="root" g-scope="{ color: 'red' }">
				<p g-${directiveName}:foreground:strong="color">Color</p>
			</div>
		`;

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		expect(mounted.mock.calls[0][1]).toMatchObject({ value: 'red', arg: ['foreground', 'strong'] });

		state.color = 'blue';
		await flush();
		expect(updated.mock.calls.at(-1)?.[1]).toMatchObject({ value: 'blue', oldValue: 'red' });
	});

	it('runs focus, tooltip, and cloak built-in directives', async () => {
		vi.useFakeTimers();
		document.body.innerHTML = `
			<div g-scope="{ tooltip: 'Helpful' }">
				<input g-focus />
				<button g-tooltip="tooltip">Help</button>
				<span g-cloak>Ready</span>
			</div>
		`;

		Gyos.mountAll();
		expect(document.activeElement).toBe(document.querySelector('input'));
		expect(document.querySelector('button')!.getAttribute('title')).toBe('Helpful');
		expect(document.querySelector('span')!.hasAttribute('g-cloak')).toBe(true);
		await vi.runAllTimersAsync();
		expect(document.querySelector('span')!.hasAttribute('g-cloak')).toBe(false);
	});
});
