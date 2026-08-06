/**
 * Expression Evaluation & Interpolation
 * Handles template expressions, pipes, and string interpolation
 */
import { parsePipeExpression, applyPipe } from "../core/pipe";

/**
 * Interpolate {expression} in template strings
 *
 * @param template - Template string with {expr} placeholders
 * @param scope - Scope object for evaluation
 * @returns Interpolated string
 *
 * @example
 * interpolate('Hello {name}!', { name: 'World' }) // 'Hello World!'
 */
export function interpolate(template: string, scope: any): string {
    return template.replace(/\{([^}]+)\}/g, (match, expr) => {
        try {
            const value = evaluateExpression(expr.trim(), scope);
            return value == null ? "" : String(value);
        } catch (e) {
            console.error("[GyosJS] Error in interpolation:", e);
            return match;
        }
    });
}

/**
 * Check if expression contains pipe (|) outside of quotes
 */
function hasPipeOutsideQuotes(expr: string): boolean {
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < expr.length; i++) {
        const char = expr[i];
        const prevChar = i > 0 ? expr[i - 1] : "";

        // Track quotes (ignore escaped quotes)
        if ((char === '"' || char === "'") && prevChar !== "\\") {
            if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar) {
                inQuote = false;
                quoteChar = "";
            }
        }

        // Check for pipe outside quotes
        if (char === "|" && !inQuote) {
            // Make sure it's not ||
            const nextChar = i < expr.length - 1 ? expr[i + 1] : "";
            if (nextChar !== "|" && prevChar !== "|") {
                return true;
            }
        }
    }

    return false;
}

/**
 * Evaluate expression with optional pipe support
 *
 * @param expr - Expression to evaluate
 * @param scope - Scope object
 * @param allowPipes - Whether to process pipes (default: true)
 * @returns Evaluated value
 *
 * @example
 * evaluateExpression('name | uppercase', scope) // 'JOHN'
 * evaluateExpression('count > 5', scope, false) // true
 */
export function evaluateExpression(
    expr: string,
    scope: any,
    allowPipes: boolean = true
): any {
    // Check if expression has pipes (single | not || and not in quotes)
    if (allowPipes && hasPipeOutsideQuotes(expr)) {
        const { base, pipes } = parsePipeExpression(expr);
        let value = evaluateSimpleExpression(base, scope);

        // Apply each pipe
        for (const { name, args } of pipes) {
            const pipeArgs = args.map((arg) => evaluateSimpleExpression(arg, scope));
            value = applyPipe(value, name, pipeArgs);
        }

        return value;
    }

    return evaluateSimpleExpression(expr, scope);
}

/**
 * Evaluate simple expression without pipes
 * Handles property access, method calls, and operators
 *
 * @param expr - Expression to evaluate
 * @param scope - Scope object
 * @returns Evaluated value
 */
function evaluateSimpleExpression(expr: string, scope: any): any {
    // Handle string literals
    if (
        (expr.startsWith("'") && expr.endsWith("'")) ||
        (expr.startsWith('"') && expr.endsWith('"'))
    ) {
        return expr.slice(1, -1);
    }

    // Handle numbers
    if (!isNaN(Number(expr))) {
        return Number(expr);
    }

    // Use Function to evaluate in scope context
    // This allows getters and signals to be tracked properly
    try {
        const method = scope[expr];
        if (typeof method === "function") {
            return method.call(scope);
        } else {
            // Wrap expression in try-catch to handle null/undefined access gracefully
            const safeExpr = `try { return ${expr} } catch(e) { return undefined }`;
            const fn = new Function("$scope", `with($scope) { ${safeExpr} }`);
            return fn(scope);
        }
    } catch (e) {
        console.error("[GyosJS] Error evaluating expression:", expr, e);
        return undefined;
    }
}
