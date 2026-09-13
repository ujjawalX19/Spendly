/**
 * Shared 400 response for Zod failures.
 *
 * Zod 4 exposes problems as `error.issues`. The old code read `error.errors`
 * (the Zod 3 alias, removed in v4), which threw inside the handler and turned
 * every invalid request into a 500.
 */
function formatIssues(error) {
    return (error?.issues || []).map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}

function validationError(res, error, message = 'Validation failed') {
    return res.status(400).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message,
        errors: formatIssues(error),
    });
}

module.exports = { validationError, formatIssues };
