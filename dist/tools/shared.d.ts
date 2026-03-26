/**
 * Shared tool utilities — response builders, error handling, graceful degradation.
 *
 * Every tool uses withGracefulDegradation to handle missing collections.
 * Error responses never leak raw error messages to the MCP client.
 */
import type { DataAdapter } from '../adapter/types.js';
/** Build a successful MCP tool response */
export declare function makeToolResponse(data: unknown): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
/** Build an MCP error response (never leaks raw error details) */
export declare function makeErrorResponse(message: string): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError: true;
};
/** Convert an AdapterError to a safe MCP error response */
export declare function handleAdapterError(error: unknown, toolName: string): {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError: true;
};
/**
 * Wrap a tool handler with graceful degradation.
 *
 * Before executing the handler, checks if the required collection exists.
 * If not, returns a helpful message instead of crashing.
 * Caches positive results to avoid an extra DB round-trip on every call.
 */
export declare function withGracefulDegradation<TParams>(collection: string, adapter: DataAdapter, handler: (params: TParams) => Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>): (params: TParams) => Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
/**
 * Auto-generate a summary from content, truncating at a sentence boundary within ~200 chars.
 * Returns content as-is if it's 200 chars or shorter.
 */
export declare function generateSummary(content: string): string;
//# sourceMappingURL=shared.d.ts.map