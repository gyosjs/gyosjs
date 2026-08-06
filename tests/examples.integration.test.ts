import { describe, it, expect, beforeEach, vi } from 'vitest';
import Gyos from '../src/index';

const click = (el: Element) => {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const input = (el: HTMLInputElement, value: string) => {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('example flows', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('todo flow: add, toggle, remove', async () => {
		document.body.innerHTML = `
			<form g-scope="Todo" @submit="add(event)">
				<input id="new" g-model="newTodo" />
				<button type="submit">Add</button>
				<ul>
					<li *for="todo in todos" g-key="todo.id">
						<label>
							<input class="toggle" type="checkbox" @change="toggle(todo)" />
							<span class="text">{todo.text}</span>
						</label>
						<button class="remove" @click="remove(todo)">x</button>
					</li>
				</ul>
			</form>
		`;

		let idCounter = 0;
		Gyos.scope('Todo', {
			newTodo: '',
			todos: [] as Array<{ id: number; text: string; done: boolean }>,
			add(ev?: Event) {
				ev?.preventDefault();
				if (!this.newTodo.trim()) return;
				this.todos = [...this.todos, { id: ++idCounter, text: this.newTodo, done: false }];
				this.newTodo = '';
			},
			toggle(todo: any) {
				todo.done = !todo.done;
			},
			remove(todo: any) {
				this.todos = this.todos.filter((t: any) => t !== todo);
			}
		});

		Gyos.mountAll();

		// Add two todos
		input(document.getElementById('new') as HTMLInputElement, 'First');
		document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		input(document.getElementById('new') as HTMLInputElement, 'Second');
		document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

		const items = () => Array.from(document.querySelectorAll('li'));
		expect(items().length).toBe(2);
		expect(items()[0].querySelector('.text')!.textContent).toBe('First');

		// Toggle first item
		click(items()[0].querySelector('.toggle')!);
		expect((items()[0].querySelector('.toggle') as HTMLInputElement).checked).toBe(true);

		// Remove second item
		click(items()[1].querySelector('.remove')!);
		expect(items().length).toBe(1);
	});

	it('keeps keyed row scopes aligned after splice removes a middle item', async () => {
		document.body.innerHTML = `
			<div g-scope="SpliceLines">
				<div class="line" *for="line, index in lines" g-key="line.id">
					<input class="label" g-model.trim="line.label" />
					<span class="value">{index}:{line.label}</span>
					<button class="remove" @click="removeLine(line.id)">Remove</button>
				</div>
			</div>
		`;

		Gyos.scope('SpliceLines', {
			lines: [
				{ id: 1, label: 'First' },
				{ id: 2, label: 'Second' },
				{ id: 3, label: 'Third' },
				{ id: 4, label: 'Fourth' },
				{ id: 5, label: 'Fifth' }
			],
			removeLine(id: number) {
				const index = this.lines.findIndex((line: any) => line.id === id);
				if (index !== -1) this.lines.splice(index, 1);
			}
		});

		Gyos.mountAll();
		click(document.querySelectorAll('.remove')[2]);
		await Promise.resolve();
		await Promise.resolve();

		const labels = Array.from(document.querySelectorAll<HTMLInputElement>('.label'));
		expect(labels.map(label => label.value)).toEqual([
			'First',
			'Second',
			'Fourth',
			'Fifth'
		]);
		expect(Array.from(document.querySelectorAll('.value'), el => el.textContent)).toEqual([
			'0:First',
			'1:Second',
			'2:Fourth',
			'3:Fifth'
		]);

		input(labels[2], 'Updated Fourth');
		await Promise.resolve();
		expect(document.querySelectorAll('.value')[2].textContent).toBe('2:Updated Fourth');
	});
});
