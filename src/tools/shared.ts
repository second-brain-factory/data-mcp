/**
 * Shared tool utilities — response builders, error handling, graceful degradation.
 *
 * Every tool uses withGracefulDegradation to handle missing collections.
 * Error responses never leak raw error messages to the MCP client.
 */

import { AdapterError, type AdapterErrorCode } from '../errors/adapter-error.js';
import type { DataAdapter } from '../adapter/types.js';

/** Build a successful MCP tool response */
export function makeToolResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Build an MCP error response (never leaks raw error details) */
export function makeErrorResponse(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/** User-friendly messages per error code */
const ERROR_MESSAGES: Record<AdapterErrorCode, string> = {
  COLLECTION_NOT_FOUND: 'This feature requires a database table that has not been set up yet. Run setup_migrate to create it.',
  RECORD_NOT_FOUND: 'The requested record was not found.',
  VALIDATION_ERROR: 'The data provided is invalid. Check fields and try again.',
  UNIQUE_VIOLATION: 'A record with these values already exists.',
  CONNECTION_ERROR: 'Cannot connect to the database. Check that your database is running.',
  AUTH_ERROR: 'Database authentication failed. Check your credentials.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

/** Convert an AdapterError to a safe MCP error response */
export function handleAdapterError(error: unknown, toolName: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (error instanceof AdapterError) {
    console.error(`[${toolName}] AdapterError(${error.code}): ${error.message}`);
    return makeErrorResponse(ERROR_MESSAGES[error.code]);
  }

  // Unknown error — never leak the message
  console.error(`[${toolName}] Unexpected error:`, error);
  return makeErrorResponse(ERROR_MESSAGES.UNKNOWN);
}

/**
 * Wrap a tool handler with graceful degradation.
 *
 * Before executing the handler, checks if the required collection exists.
 * If not, returns a helpful message instead of crashing.
 */
export function withGracefulDegradation<TParams>(
  collection: string,
  adapter: DataAdapter,
  handler: (params: TParams) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
): (params: TParams) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  return async (params: TParams) => {
    try {
      const exists = await adapter.collectionExists(collection);
      if (!exists) {
        return makeErrorResponse(
          `The '${collection}' table does not exist yet. Run setup_migrate to create the database schema.`
        );
      }
      return await handler(params);
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'COLLECTION_NOT_FOUND') {
        return makeErrorResponse(
          `The '${collection}' table does not exist yet. Run setup_migrate to create the database schema.`
        );
      }
      throw error;
    }
  };
}

/**
 * Auto-generate a summary from content, truncating at a sentence boundary within ~200 chars.
 * Returns content as-is if it's 200 chars or shorter.
 */
export function generateSummary(content: string): string {
  if (content.length <= 200) return content;

  const truncated = content.substring(0, 200);

  // Try to break at a sentence boundary (. ! ?)
  const sentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
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
