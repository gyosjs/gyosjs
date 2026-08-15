const managedForms = new WeakSet<HTMLFormElement>();
const approvedSubmissions = new WeakSet<HTMLFormElement>();

// Coordinates the form capture validator with the Router's document listener
// without exposing state on application elements.

export function registerValidatedForm(form: HTMLFormElement): void {
	managedForms.add(form);
}

export function unregisterValidatedForm(form: HTMLFormElement): void {
	managedForms.delete(form);
	approvedSubmissions.delete(form);
}

export function approveNextFormSubmission(form: HTMLFormElement): void {
	approvedSubmissions.add(form);
}

export function cancelApprovedFormSubmission(form: HTMLFormElement): void {
	approvedSubmissions.delete(form);
}

export function shouldDeferToFormValidation(form: HTMLFormElement): boolean {
	if (!managedForms.has(form)) return false;
	if (approvedSubmissions.has(form)) {
		approvedSubmissions.delete(form);
		return false;
	}
	return true;
}
