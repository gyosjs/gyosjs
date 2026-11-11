const persistEntries = new Map<string, HTMLElement>();
let persistIdCounter = 0;

function getPersistKey(el: HTMLElement, generateIfMissing = false): string | null {
	if (el.dataset.gyosPersistId) return el.dataset.gyosPersistId;
	const attrVal = el.getAttribute('g-persist');
	if (attrVal && attrVal.trim().length) {
		el.dataset.gyosPersistId = attrVal.trim();
		return el.dataset.gyosPersistId;
	}
	if (el.id) {
		el.dataset.gyosPersistId = `id:${el.id}`;
		return el.dataset.gyosPersistId;
	}
	if (!generateIfMissing) return null;
	const key = `gyos-persist-${persistIdCounter++}`;
	el.dataset.gyosPersistId = key;
	return key;
}

// Keep the parking host outside body: body itself may be the swap target.
// A disconnected parking host makes browsers pause otherwise persisted media.
const persistParking: HTMLElement | null =
	typeof document !== 'undefined'
		? (() => {
			const park = document.createElement('div');
			park.style.position = 'fixed';
			park.style.left = '-99999px';
			park.style.top = '-99999px';
			park.style.width = '0';
			park.style.height = '0';
			document.documentElement.appendChild(park);
			return park;
		})()
		: null;

function elementsIn(root: ParentNode): HTMLElement[] {
	const elements = Array.from(root.querySelectorAll<HTMLElement>('[g-persist]'));
	if (root instanceof HTMLElement && root.matches('[g-persist]')) elements.unshift(root);
	return elements;
}

function ensureParkingIsConnected(): void {
	if (persistParking && persistParking.parentElement !== document.documentElement) {
		document.documentElement.appendChild(persistParking);
	}
}

export function detachPersist(root: ParentNode = document): void {
	if (!persistParking) return;
	ensureParkingIsConnected();
	elementsIn(root).forEach(el => {
		if (el === persistParking || persistParking.contains(el)) return;
		const key = getPersistKey(el, true);
		if (!key) return;
		persistEntries.set(key, el);
		persistParking.appendChild(el); // park but keep alive
	});
}

export function mergePersistIntoLive(root: ParentNode): void {
	// Return the host to the current body before scope mounting/cleanup inspects it.
	if (persistParking && persistParking.parentElement !== document.body) {
		document.body.appendChild(persistParking);
	}
	if (!persistEntries.size) return;

	// If placeholders lack ids but we only have one persist entry, assign its key for convenience
	if (persistEntries.size === 1) {
		const loneKey = Array.from(persistEntries.keys())[0];
		elementsIn(root).forEach(el => {
			if (persistParking?.contains(el)) return;
			if (!getPersistKey(el, false)) {
				el.dataset.gyosPersistId = loneKey;
			}
		});
	}

	// Element placeholders
	elementsIn(root).forEach(placeholder => {
		if (persistParking?.contains(placeholder)) return;
		const key = getPersistKey(placeholder, false);
		if (!key) return;
		const persisted = persistEntries.get(key);
		if (persisted) {
			placeholder.replaceWith(persisted);
			persistEntries.delete(key);
		} else {
			placeholder.dataset.gyosPersistId = key;
		}
	});

	// Comment placeholders: <!-- g-persist:player -->
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null);
	const toReplace: Array<{ node: Comment; key: string }> = [];
	while (walker.nextNode()) {
		const comment = walker.currentNode as Comment;
		if (persistParking?.contains(comment)) continue;
		const match = comment.data.match(/g-persist[:=]\s*([A-Za-z0-9_\-:.]+)/);
		if (match) {
			toReplace.push({ node: comment, key: match[1] });
		}
	}
	toReplace.forEach(({ node, key }) => {
		const persisted = persistEntries.get(key);
		if (persisted) {
			node.replaceWith(persisted);
			persistEntries.delete(key);
		}
	});
}

export function resetPersistState(): void {
	persistEntries.clear();
	persistIdCounter = 0;
	persistParking?.replaceChildren();
}
