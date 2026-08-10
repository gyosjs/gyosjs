const managedForms = new WeakSet<HTMLFormElement>();
const approvedSubmissions = new WeakSet<HTMLFormElement>();

// Coordinates the validation listener on a form with the Router's earlier
// document-capture listener without exposing state on application elements.

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
