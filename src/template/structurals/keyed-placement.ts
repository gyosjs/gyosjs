/** Keep the longest already-ordered run of rows connected; move only the rest. */
export function placeKeyedRows(placeholder: Comment, rows: HTMLElement[]): void {
	const parent = placeholder.parentNode;
	if (!parent || rows.length === 0) return;
	const managed = new Set(rows);
	const positions = new Map<Node, number>();
	let boundary = placeholder.nextSibling;
	while (boundary && managed.has(boundary as HTMLElement)) {
		positions.set(boundary, positions.size);
		boundary = boundary.nextSibling;
	}

	const active = placeholder.ownerDocument.activeElement as HTMLElement | null;
	const ownsFocus = !!active && rows.some((row) => row === active || row.contains(active));
	const selection =
		ownsFocus && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
			? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }
			: null;

	if (positions.size !== rows.length) {
		// Leaving transition nodes, foreign siblings or externally detached rows:
		// preserve the established contiguous-after-placeholder placement contract.
		let previous: Node = placeholder;
		for (const row of rows) {
			if (row !== previous.nextSibling) parent.insertBefore(row, previous.nextSibling);
			previous = row;
		}
	} else {
		const order = rows.map((row) => positions.get(row)!);
		let sorted = true;
		for (let i = 1; i < order.length; i++)
			if (order[i] < order[i - 1]) {
				sorted = false;
				break;
			}
		if (sorted) return;
		// Patience sorting: indices of a longest increasing subsequence, O(n log n).
		const tails: number[] = [],
			predecessors = new Array<number>(order.length).fill(-1);
		for (let i = 0; i < order.length; i++) {
			let low = 0,
				high = tails.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (order[tails[middle]] < order[i]) low = middle + 1;
				else high = middle;
			}
			if (low > 0) predecessors[i] = tails[low - 1];
			tails[low] = i;
		}
		const retained = new Set<number>();
		for (let i = tails[tails.length - 1]; i >= 0; i = predecessors[i]) retained.add(i);
		for (let i = rows.length - 1; i >= 0; i--) {
			const row = rows[i];
			if (!retained.has(i) && row.nextSibling !== boundary) parent.insertBefore(row, boundary);
			boundary = row;
		}
	}

	// insertBefore can blur a moved input. Restore only a surviving owned focus,
	// and never steal focus assigned to another control by application callbacks.
	const document = placeholder.ownerDocument;
	if (ownsFocus && active!.isConnected && document.activeElement === document.body) {
		active!.focus({ preventScroll: true });
		if (selection?.start != null && selection.end != null) {
			(active as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
				selection.start,
				selection.end,
				selection.direction || undefined
			);
		}
	}
}
