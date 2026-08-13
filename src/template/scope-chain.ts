const PARENT_SCOPE = Symbol('gyos.parent-scope');

export function attachParentScope(childScope: object, parentScope: object): void {
	Object.defineProperty(childScope, PARENT_SCOPE, {
		value: parentScope,
		configurable: false,
		enumerable: false,
		writable: false
	});
}

function parentOf(scope: any): any | undefined {
	return scope?.[PARENT_SCOPE];
}

export function ensureModelPropertyOwner(scope: any, property: string): void {
	if (!parentOf(scope) || property in scope) return;

	let owner = scope;
	let parent = parentOf(owner);
	while (parent) {
		owner = parent;
		parent = parentOf(owner);
	}

	if (!(property in owner)) owner[property] = undefined;
	Object.defineProperty(scope, property, {
		get: () => owner[property],
		set: value => {
			owner[property] = value;
		},
		configurable: true,
		enumerable: true
	});
}
