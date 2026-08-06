/**
 * Form Validation Directives
 * Provides g-form, g-validate, and g-errors directives for reactive form validation
 */
import { effect, signal } from '../reactivity/signal';
import type { Signal } from '../types';
import { validate } from './validator';
import { hasUnsafePropertyPath, isInIgnoredTree } from '../utils/helpers';

/**
 * Form validation state with typed signals
 * Stores validation errors and computed state for each form
 */
interface FormState {
    errors: Signal<Record<string, string | null>>;
    touched: Signal<Record<string, boolean>>;
    $invalid: Signal<boolean>;
    $valid: Signal<boolean>;
    $dirty: Signal<boolean>;
    $pristine: Signal<boolean>;
    validateAll?: () => Promise<boolean>;
}

const formStates = new WeakMap<HTMLFormElement, FormState>();
const formValidators = new WeakMap<HTMLFormElement, Array<() => Promise<void>>>();
const validationFieldKey = Symbol('gyos.validation-field');

function getFieldName(el: Element): string {
    const storedName = (el as any)[validationFieldKey];
    if (storedName) return storedName;

    const modelAttr = Array.from(el.attributes).find(attr =>
        attr.name === 'g-model' || attr.name.startsWith('g-model.')
    );
    return modelAttr?.value || el.getAttribute('name') || (el as HTMLElement).id;
}

/**
 * Get or create form validation state
 */
function getFormState(form: HTMLFormElement): FormState {
    if (!formStates.has(form)) {
        // Create reactive state using signals
        formStates.set(form, {
            errors: signal({}),
            touched: signal({}),
            $invalid: signal(false),
            $valid: signal(true),
            $dirty: signal(false), // dirty when any field touched
            $pristine: signal(true) // pristine when no fields touched
        });
    }
    return formStates.get(form)!;
}

/**
 * Update form computed properties
 * Only updates when values actually change
 */
function updateFormState(state: FormState): void {
    const errors = state.errors.value;
    const touched = state.touched.value;

    const hasErrors = Object.values(errors).some(error => error !== null);
    const anyTouched = Object.values(touched).some(t => t);

    // Only update if changed
    if (state.$invalid.value !== hasErrors) {
        state.$invalid.value = hasErrors;
        state.$valid.value = !hasErrors;
    }

    if (state.$dirty.value !== anyTouched) {
        state.$dirty.value = anyTouched;
        state.$pristine.value = !anyTouched;
    }
}

/**
 * Process g-form directive
 * Binds form validation state to scope
 * 
 * @example
 * <form g-form="formData">
 *   <button :disabled="formData.$invalid">Submit</button>
 * </form>
 */
export function processFormDirective(form: HTMLFormElement, scope: any): void {
    const formName = form.getAttribute('g-form');
    if (!formName || hasUnsafePropertyPath(formName)) return;

    form.removeAttribute('g-form');

    const state = getFormState(form);

    // Create validateAll function
    const validateAll = async (): Promise<boolean> => {
        const validators = formValidators.get(form) || [];

        const touchedObj = { ...state.touched.value };
        Object.keys(touchedObj).forEach(fieldName => {
            touchedObj[fieldName] = true;
        });

        // Trigger signal update once
        state.touched.value = { ...touchedObj };

        // Run all validators in parallel
        await Promise.all(validators.map(validator => validator()));

        updateFormState(state);

        return !state.$invalid.value;
    };

    state.validateAll = validateAll;

    // Directly assign signals to scope properties
    // Scope will wrap these in signals automatically during component mounting
    const formStateObj: any = {
        errors: state.errors,
        touched: state.touched,
        $invalid: state.$invalid,
        $valid: state.$valid,
        $dirty: state.$dirty,
        $pristine: state.$pristine,
        validateAll: validateAll
    };

    if (!(formName in scope)) {
        scope[formName] = formStateObj;
    } else {
        // Merge signals into existing object
        Object.assign(scope[formName], formStateObj);
    }

    // Prevent default form submission and validate first
    const submitListener = async (e: Event) => {
        e.preventDefault();

        const isValid = await validateAll();

        if (!isValid) return;

        const submitMethod = form.getAttribute('g-submit');

        // If not defined, submit the form normally
        if (!submitMethod) {
            form.submit();
            return;
        }

        // Trigger custom submit handler if exists
        const submitHandler = (scope as any)[submitMethod];
        if (typeof submitHandler === 'function') {
            submitHandler.call(scope);
        }
    };
    form.addEventListener('submit', submitListener);

    if (!(form as any).__gyos_effects__) {
        (form as any).__gyos_effects__ = [];
    }
    (form as any).__gyos_effects__.push(() => {
        form.removeEventListener('submit', submitListener);
        formStates.delete(form);
        formValidators.delete(form);
    });
}

/**
 * Process g-validate directive on input elements
 * Validates input value against rules and updates form state
 * 
 * @example
 * <input g-model="email" g-validate="required|email">
 * <input g-model="password" g-validate="required|minLength(8)|password">
 */
export function processValidateDirective(el: HTMLElement): void {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        return;
    }

    const rules = el.getAttribute('g-validate');
    if (!rules) return;

    el.removeAttribute('g-validate');

    // Get field name from g-model attribute
    const modelAttr = getFieldName(el);
    if (!modelAttr) return;
    (el as any)[validationFieldKey] = modelAttr;

    // Find parent form
    const form = el.closest('form');
    if (!form) return;

    const state = getFormState(form);

    // Initialize error state - direct mutation
    state.errors.value[modelAttr] = null;
    state.touched.value[modelAttr] = false;

    // Validation function
    const validateField = async () => {
        const value = el.value;

        // Get form context for validators that need it (like 'same')
        const formData: Record<string, any> = {};
        const formInputs = form.querySelectorAll('input, textarea, select');
        formInputs.forEach(input => {
            if (isInIgnoredTree(input)) return;
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
                const fieldName = getFieldName(input);
                if (fieldName) {
                    formData[fieldName] = input.value;
                }
            }
        });

        const error = await validate(value, rules, { form: formData, field: modelAttr });

        // Update errors - only if changed
        const currentErrors = state.errors.value;

        if (currentErrors[modelAttr] !== error) {
            currentErrors[modelAttr] = error;
            // Trigger reactivity by reassigning
            state.errors.value = { ...currentErrors };
            updateFormState(state);
        }
    };

    // Register validator for validateAll
    if (!formValidators.has(form)) {
        formValidators.set(form, []);
    }
    formValidators.get(form)!.push(validateField);

    // Mark as touched on blur
    const blurListener = () => {
        const touchedObj = state.touched.value;

        if (!touchedObj[modelAttr]) {
            touchedObj[modelAttr] = true;
            state.touched.value = { ...touchedObj };
            updateFormState(state);
        }

        validateField();
    };
    el.addEventListener('blur', blurListener);

    // Validate on input (with debounce)
    let timeout: any;
    const inputListener = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            validateField();
        }, 300);
    };
    el.addEventListener('input', inputListener);

    if (!(el as any).__gyos_effects__) {
        (el as any).__gyos_effects__ = [];
    }
    (el as any).__gyos_effects__.push(() => {
        el.removeEventListener('blur', blurListener);
        el.removeEventListener('input', inputListener);
        clearTimeout(timeout);
    });
}

/**
 * Process g-errors directive
 * Displays validation errors for a specific field or all fields
 * 
 * @example
 * <!-- Show errors for specific field -->
 * <span g-errors="email" class="error"></span>
 * 
 * <!-- Show all form errors -->
 * <div g-errors class="error-summary"></div>
 */
export function processErrorsDirective(el: HTMLElement): void {
    const fieldName = el.getAttribute('g-errors');
    el.removeAttribute('g-errors');

    // Find parent form
    const form = el.closest('form');
    if (!form) return;

    const state = getFormState(form);

    if (fieldName === '' || fieldName === null) {
        // Show all errors
        const dispose = effect(() => {
            const errors = state.errors.value;
			const errorEntries = Object.entries(errors).filter(([_, error]) => error !== null);
			el.replaceChildren(...errorEntries.map(([field, error]) => {
				const row = document.createElement('div');
				const label = document.createElement('strong');
				label.textContent = `${field}:`;
				row.append(label, document.createTextNode(` ${String(error)}`));
				return row;
			}));
			el.style.display = errorEntries.length ? '' : 'none';
        });

        if (!(el as any).__gyos_effects__) {
            (el as any).__gyos_effects__ = [];
        }
        (el as any).__gyos_effects__.push(dispose);
    } else {
        // Show specific field error (removed isTouched check as requested)
        const dispose = effect(() => {
            const errors = state.errors.value;
            const error = errors[fieldName];

            if (error) {
                el.textContent = error;
                el.style.display = '';
            } else {
                el.textContent = '';
                el.style.display = 'none';
            }
        });

        if (!(el as any).__gyos_effects__) {
            (el as any).__gyos_effects__ = [];
        }
        (el as any).__gyos_effects__.push(dispose);
    }
}

/**
 * Process all form validation directives in an element tree
 */
export function processFormValidation(root: HTMLElement, scope: any): void {
    // Process g-form first
    if (root instanceof HTMLFormElement && root.hasAttribute('g-form')) {
        processFormDirective(root, scope);
    }

    // Then process g-validate
    root.querySelectorAll('[g-validate]').forEach(el => {
        if (isInIgnoredTree(el)) return;
        if (el instanceof HTMLElement) {
            processValidateDirective(el);
        }
    });

    // Finally process g-errors
    root.querySelectorAll('[g-errors]').forEach(el => {
        if (isInIgnoredTree(el)) return;
        if (el instanceof HTMLElement) {
            processErrorsDirective(el);
        }
    });
}
