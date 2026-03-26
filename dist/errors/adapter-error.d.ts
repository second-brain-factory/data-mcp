/**
 * Adapter error taxonomy.
 *
 * All adapter implementations throw AdapterError with a specific code.
 * Tool handlers use handleAdapterError() to convert these to safe MCP responses.
 */
export type AdapterErrorCode = 'COLLECTION_NOT_FOUND' | 'RECORD_NOT_FOUND' | 'VALIDATION_ERROR' | 'UNIQUE_VIOLATION' | 'CONNECTION_ERROR' | 'AUTH_ERROR' | 'UNKNOWN';
export declare class AdapterError extends Error {
    readonly code: AdapterErrorCode;
    constructor(code: AdapterErrorCode, message: string);
}
//# sourceMappingURL=adapter-error.d.ts.map