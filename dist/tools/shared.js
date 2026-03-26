/**
 * Shared tool utilities — response builders, error handling, graceful degradation.
 *
 * Every tool uses withGracefulDegradation to handle missing collections.
 * Error responses never leak raw error messages to the MCP client.
 */
import { AdapterError } from '../errors/adapter-error.js';
/** Build a successful MCP tool response */
export function makeToolResponse(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}
/** Build an MCP error response (never leaks raw error details) */
export function makeErrorResponse(message) {
    return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
    };
}
/** User-friendly messages per error code */
const ERROR_MESSAGES = {
    COLLECTION_NOT_FOUND: 'This feature requires a database table that has not been set up yet. Run setup_migrate to create it.',
    RECORD_NOT_FOUND: 'The requested record was not found.',
    VALIDATION_ERROR: 'The data provided is invalid. Check fields and try again.',
    UNIQUE_VIOLATION: 'A record with these values already exists.',
    CONNECTION_ERROR: 'Cannot connect to the database. Check that your database is running.',
    AUTH_ERROR: 'Database authentication failed. Check your credentials.',
    UNKNOWN: 'An unexpected error occurred. Please try again.',
};
/** Convert an AdapterError to a safe MCP error response */
export function handleAdapterError(error, toolName) {
    if (error instanceof AdapterError) {
        console.error(`[${toolName}] AdapterError(${error.code}): ${error.message}`);
        return makeErrorResponse(ERROR_MESSAGES[error.code]);
    }
    // Unknown error — never leak the message
    console.error(`[${toolName}] Unexpected error:`, error);
    return makeErrorResponse(ERROR_MESSAGES.UNKNOWN);
}
// Cache of confirmed-existing collections (persists for process lifetime)
const confirmedCollections = new Set();
/**
 * Wrap a tool handler with graceful degradation.
 *
 * Before executing the handler, checks if the required collection exists.
 * If not, returns a helpful message instead of crashing.
 * Caches positive results to avoid an extra DB round-trip on every call.
 */
export function withGracefulDegradation(collection, adapter, handler) {
    return async (params) => {
        try {
            // Skip existence check if we've already confirmed this collection exists
            if (!confirmedCollections.has(collection)) {
                const exists = await adapter.collectionExists(collection);
                if (!exists) {
                    return makeErrorResponse(`The '${collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
                }
                confirmedCollections.add(collection);
            }
            return await handler(params);
        }
        catch (error) {
            if (error instanceof AdapterError && error.code === 'COLLECTION_NOT_FOUND') {
                // Remove from cache — table may have been dropped
                confirmedCollections.delete(collection);
                return makeErrorResponse(`The '${collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
            }
            throw error;
        }
    };
}
/**
 * Auto-generate a summary from content, truncating at a sentence boundary within ~200 chars.
 * Returns content as-is if it's 200 chars or shorter.
 */
export function generateSummary(content) {
    if (content.length <= 200)
        return content;
    const truncated = content.substring(0, 200);
    // Try to break at a sentence boundary (. ! ?)
    const sentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('! '), truncated.lastIndexOf('? '));
    if (sentenceEnd > 80) {
        return truncated.substring(0, sentenceEnd + 1);
    }
    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
}
//# sourceMappingURL=shared.js.map