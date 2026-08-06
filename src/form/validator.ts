/**
 * Form Validation System
 * 
 * Provides a flexible validation system with built-in validators and custom validator support.
 * Validators can be chained using pipe syntax and support both sync and async validation.
 * 
 * @example Basic usage
 * ```javascript
 * // Register custom validator
 * Gyos.validator('username', (value) => {
 *   return value.length >= 3 || 'Username must be at least 3 characters';
 * });
 * 
 * // Validate with rules
 * const error = await Gyos.validate(value, 'required|email|minLength(5)');
 * if (error) {
 *   console.log(error); // "Invalid email address"
 * }
 * ```
 * 
 * @example Async validator
 * ```javascript
 * Gyos.validator('uniqueEmail', async (value) => {
 *   const exists = await checkEmailExists(value);
 *   return !exists || 'Email already taken';
 * });
 * ```
 * 
 * @example In component
 * ```javascript
 * Gyos.scope('LoginForm', {
 *   email: '',
 *   emailError: '',
 *   
 *   async validateEmail() {
 *     this.emailError = await Gyos.validate(this.email, 'required|email');
 *   }
 * });
 * ```
 */
import { ValidatorFn } from "../types";

export interface ValidationContext {
	field?: string;
	form?: Record<string, any>;
	messages?: Record<string, string>;
}

/**
 * Validator registry
 */
const validators = new Map<string, ValidatorFn>();

/**
 * Register a custom validator
 * 
 * @param name - Validator name
 * @param fn - Validator function (return true for valid, string for error message)
 * 
 * @example
 * ```javascript
 * Gyos.validator('even', (value) => {
 *   return value % 2 === 0 || 'Must be an even number';
 * });
 * ```
 */
export function validator(name: string, fn: ValidatorFn): void {
	validators.set(name, fn);
}

/**
 * Get registered validator by name
 * 
 * @param name - Validator name
 * @returns Validator function or undefined
 */
export function getValidator(name: string): ValidatorFn | undefined {
	return validators.get(name);
}

/**
 * Get all registered validator names
 * 
 * @returns Array of validator names
 * 
 * @example
 * ```javascript
 * console.log('Available validators:', Gyos.getValidatorNames());
 * // ['required', 'email', 'minLength', ...]
 * ```
 */
export function getValidatorNames(): string[] {
	return Array.from(validators.keys());
}

/**
 * Validate a value against validation rules
 * 
 * Supports custom error messages in two ways:
 * 1. Inline: "required:Custom message|email:Invalid email"
 * 2. Via context: { messages: { required: "Custom message" } }
 * 
 * @param value - Value to validate
 * @param rules - Validation rules (pipe-separated: "required|email|minLength(5)")
 * @param context - Optional context with form data and custom messages
 * @returns Error message or null if valid
 * 
 * @example Basic validation
 * ```javascript
 * const error = await Gyos.validate('test@', 'required|email');
 * // Returns: "Invalid email address"
 * ```
 * 
 * @example Inline custom messages
 * ```javascript
 * const error = await Gyos.validate('', 'required:This field is mandatory|email:Enter valid email');
 * // Returns: "This field is mandatory"
 * ```
 * 
 * @example Custom messages via context
 * ```javascript
 * const error = await Gyos.validate('abc', 'required|minLength(5)', {
 *   messages: {
 *     required: 'Please fill this field',
 *     minLength: 'Too short! Need at least 5 characters'
 *   }
 * });
 * // Returns: "Too short! Need at least 5 characters"
 * ```
 * 
 * @example With form context
 * ```javascript
 * const error = await Gyos.validate(confirmPw, 'required|same(password)', {
 *   form: { password: 'MyPass123' },
 *   messages: { same: 'Passwords do not match' }
 * });
 * ```
 */
export async function validate(value: any, rules: string, context?: ValidationContext): Promise<string | null> {
	const ruleParts = rules.split('|');

	for (const rule of ruleParts) {
		// Parse rule: "required:Custom message" or "required" or "minLength(5):Custom message"
		const colonIndex = rule.lastIndexOf(':');
		let rulePart = rule;
		let customMessage: string | undefined;

		// Check if there's a custom message after colon (but not inside parentheses)
		if (colonIndex > 0) {
			const beforeColon = rule.substring(0, colonIndex);
			// Only treat as custom message if colon is not inside function args
			const openParen = beforeColon.indexOf('(');
			const closeParen = beforeColon.lastIndexOf(')');

			if (openParen === -1 || (closeParen > openParen && closeParen === beforeColon.length - 1)) {
				// Colon is after closing paren or no parens at all
				rulePart = beforeColon;
				customMessage = rule.substring(colonIndex + 1).trim();
			}
		}

		const match = rulePart.match(/^(\w+)(?:\((.*?)\))?$/);
		if (!match) continue;

		const [, ruleName, argsStr] = match;
		const args = argsStr ? argsStr.split(',').map(a => a.trim().replace(/['"]/g, '')) : [];

		const validatorFn = validators.get(ruleName);
		if (!validatorFn) {
			console.warn(`[GyosJS] Validator "${ruleName}" not found`);
			continue;
		}

		// Pass context as last argument for validators that need it
		const result = await validatorFn(value, ...args, context);
		if (result !== true) {
			// Priority: inline message > context messages > default validator message
			if (customMessage) {
				return customMessage;
			} else if (context?.messages?.[ruleName]) {
				return context.messages[ruleName];
			} else {
				return typeof result === 'string' ? result : `Validation failed for ${ruleName}`;
			}
		}
	}

	return null;
}

// ============================================================================
// Built-in Validators
// ============================================================================

/**
 * Required - Field must not be empty
 * 
 * @example "required"
 */
validator('required', (value) => {
	if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
		return 'This field is required';
	}
	return true;
});

/**
 * Email - Valid email format
 * 
 * @example "email"
 */
validator('email', (value) => {
	if (!value) return true;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(value) || 'Invalid email address';
});

/**
 * Min length - Minimum string/array length
 * 
 * @example "minLength(5)"
 */
validator('minLength', (value, length) => {
	if (!value) return true;
	const minLen = parseInt(length);
	return value.length >= minLen || `Minimum length is ${minLen}`;
});

/**
 * Max length - Maximum string/array length
 * 
 * @example "maxLength(100)"
 */
validator('maxLength', (value, length) => {
	if (!value) return true;
	const maxLen = parseInt(length);
	return value.length <= maxLen || `Maximum length is ${maxLen}`;
});

/**
 * Min - Minimum numeric value
 * 
 * @example "min(18)"
 */
validator('min', (value, min) => {
	if (!value) return true;
	const minVal = parseFloat(min);
	return parseFloat(value) >= minVal || `Minimum value is ${minVal}`;
});

/**
 * Max - Maximum numeric value
 * 
 * @example "max(100)"
 */
validator('max', (value, max) => {
	if (!value) return true;
	const maxVal = parseFloat(max);
	return parseFloat(value) <= maxVal || `Maximum value is ${maxVal}`;
});

/**
 * Number - Must be a valid number
 * 
 * @example "number"
 */
validator('number', (value) => {
	if (!value) return true;
	return !isNaN(parseFloat(value)) && isFinite(value) || 'Must be a number';
});

/**
 * Integer - Must be a valid integer
 * 
 * @example "integer"
 */
validator('integer', (value) => {
	if (!value) return true;
	return Number.isInteger(parseFloat(value)) || 'Must be an integer';
});

/**
 * Numeric - Must contain only digits
 * 
 * @example "numeric"
 */
validator('numeric', (value) => {
	if (!value) return true;
	return /^\d+$/.test(value) || 'Must contain only digits';
});

/**
 * Alpha - Must contain only letters
 * 
 * @example "alpha"
 */
validator('alpha', (value) => {
	if (!value) return true;
	return /^[a-zA-Z]+$/.test(value) || 'Must contain only letters';
});

/**
 * Alphanumeric - Must contain only letters and numbers
 * 
 * @example "alphanumeric"
 */
validator('alphanumeric', (value) => {
	if (!value) return true;
	return /^[a-zA-Z0-9]+$/.test(value) || 'Must contain only letters and numbers';
});

/**
 * Pattern - Must match regex pattern
 * 
 * @example "pattern(^[A-Z]{3}$)"
 */
validator('pattern', (value, pattern) => {
	if (!value) return true;
	const regex = new RegExp(pattern);
	return regex.test(value) || 'Invalid format';
});

/**
 * Same - Must match another field value
 * 
 * @example "same(password)" - Useful for password confirmation
 */
validator('same', (value, fieldName, context?: ValidationContext) => {
	if (!value) return true;
	if (!context?.form) {
		console.warn('[GyosJS] "same" validator requires form context');
		return true;
	}
	const otherValue = context.form[fieldName];
	return value === otherValue || `Must match ${fieldName}`;
});

/**
 * Different - Must not match another field value
 * 
 * @example "different(oldPassword)"
 */
validator('different', (value, fieldName, context?: ValidationContext) => {
	if (!value) return true;
	if (!context?.form) {
		console.warn('[GyosJS] "different" validator requires form context');
		return true;
	}
	const otherValue = context.form[fieldName];
	return value !== otherValue || `Must be different from ${fieldName}`;
});

/**
 * URL - Valid URL format
 * 
 * @example "url"
 */
validator('url', (value) => {
	if (!value) return true;
	try {
		new URL(value);
		return true;
	} catch {
		return 'Invalid URL';
	}
});

/**
 * Phone - Valid Vietnamese phone format (0xxxxxxxxx)
 * 
 * @example "phone"
 */
validator('phone', (value) => {
	if (!value) return true;
	const phoneRegex = /^0\d{9}$/;
	return phoneRegex.test(value) || 'Invalid phone number (format: 0xxxxxxxxx)';
});

/**
 * Date - Valid date format (YYYY-MM-DD)
 * 
 * @example "date"
 */
validator('date', (value) => {
	if (!value) return true;
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(value)) {
		return 'Invalid date format (use YYYY-MM-DD)';
	}
	const date = new Date(value);
	return !isNaN(date.getTime()) || 'Invalid date';
});

/**
 * Before - Date must be before specified date
 * 
 * @example "before(2025-12-31)"
 */
validator('before', (value, targetDate) => {
	if (!value) return true;
	const date = new Date(value);
	const target = new Date(targetDate);
	return date < target || `Must be before ${targetDate}`;
});

/**
 * After - Date must be after specified date
 * 
 * @example "after(2025-01-01)"
 */
validator('after', (value, targetDate) => {
	if (!value) return true;
	const date = new Date(value);
	const target = new Date(targetDate);
	return date > target || `Must be after ${targetDate}`;
});

/**
 * Password - Strong password (uppercase, lowercase, number, min 8 chars)
 * 
 * @example "password"
 */
validator('password', (value) => {
	if (!value) return true;

	if (value.length < 8) {
		return 'Password must be at least 8 characters';
	}

	const hasUpper = /[A-Z]/.test(value);
	const hasLower = /[a-z]/.test(value);
	const hasNumber = /[0-9]/.test(value);

	if (!hasUpper) {
		return 'Password must contain at least one uppercase letter';
	}
	if (!hasLower) {
		return 'Password must contain at least one lowercase letter';
	}
	if (!hasNumber) {
		return 'Password must contain at least one number';
	}

	return true;
});

/**
 * In - Value must be in allowed list
 * 
 * @example "in(red,green,blue)"
 */
validator('in', (value, ...allowedValues) => {
	if (!value) return true;
	// Remove context if it's the last argument
	const values = allowedValues.filter(v => typeof v === 'string' || typeof v === 'number');
	return values.includes(value) || `Must be one of: ${values.join(', ')}`;
});

/**
 * NotIn - Value must not be in forbidden list
 * 
 * @example "notIn(admin,root,system)"
 */
validator('notIn', (value, ...forbiddenValues) => {
	if (!value) return true;
	const values = forbiddenValues.filter(v => typeof v === 'string' || typeof v === 'number');
	return !values.includes(value) || `Cannot be: ${values.join(', ')}`;
});

/**
 * Between - Numeric value must be between min and max
 * 
 * @example "between(18,65)"
 */
validator('between', (value, min, max) => {
	if (!value) return true;
	const num = parseFloat(value);
	const minVal = parseFloat(min);
	const maxVal = parseFloat(max);
	return (num >= minVal && num <= maxVal) || `Must be between ${minVal} and ${maxVal}`;
});
