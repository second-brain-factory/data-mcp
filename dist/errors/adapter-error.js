/**
 * Adapter error taxonomy.
 *
 * All adapter implementations throw AdapterError with a specific code.
 * Tool handlers use handleAdapterError() to convert these to safe MCP responses.
 */
export class AdapterError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'AdapterError';
        this.code = code;
    }
}
//# sourceMappingURL=adapter-error.js.map