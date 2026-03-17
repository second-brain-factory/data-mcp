/**
 * Tests for shared tool utilities: handleAdapterError, generateSummary, makeToolResponse, makeErrorResponse.
 */

import { describe, it, expect } from 'vitest';
import { AdapterError } from '../../src/errors/adapter-error.js';
import {
  handleAdapterError,
  generateSummary,
  makeToolResponse,
  makeErrorResponse,
} from '../../src/tools/shared.js';

describe('handleAdapterError', () => {
  it('maps COLLECTION_NOT_FOUND to setup_migrate message', () => {
    const error = new AdapterError('COLLECTION_NOT_FOUND', 'table missing');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('setup_migrate');
    expect(text).not.toContain('table missing');
  });

  it('maps RECORD_NOT_FOUND to user-friendly message', () => {
    const error = new AdapterError('RECORD_NOT_FOUND', 'not found');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('not found');
  });

  it('maps VALIDATION_ERROR to user-friendly message', () => {
    const error = new AdapterError('VALIDATION_ERROR', 'bad data');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('invalid');
  });

  it('maps UNIQUE_VIOLATION to user-friendly message', () => {
    const error = new AdapterError('UNIQUE_VIOLATION', 'dup key');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('already exists');
  });

  it('maps CONNECTION_ERROR to user-friendly message', () => {
    const error = new AdapterError('CONNECTION_ERROR', 'ECONNREFUSED');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('connect');
  });

  it('maps AUTH_ERROR to user-friendly message', () => {
    const error = new AdapterError('AUTH_ERROR', 'forbidden');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('authentication');
  });

  it('maps UNKNOWN to generic message', () => {
    const error = new AdapterError('UNKNOWN', 'some internal detail');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).not.toContain('some internal detail');
    expect(parsed.error).toContain('unexpected');
  });

  it('never leaks raw error messages for non-AdapterError', () => {
    const error = new Error('secret internal detail');
    const result = handleAdapterError(error, 'test_tool');
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).not.toContain('secret internal detail');
  });
});

describe('generateSummary', () => {
  it('returns content as-is if 200 chars or shorter', () => {
    const short = 'This is a short content.';
    expect(generateSummary(short)).toBe(short);
  });

  it('returns content as-is at exactly 200 chars', () => {
    const exact200 = 'A'.repeat(200);
    expect(generateSummary(exact200)).toBe(exact200);
  });

  it('breaks at sentence boundary when available', () => {
    const content = 'First sentence about something interesting. Second sentence with more details that goes on and on. ' +
      'Third sentence continues. Fourth sentence keeps going and is even more verbose to make this exceed 200 characters easily.';
    const summary = generateSummary(content);
    expect(summary.length).toBeLessThanOrEqual(201);
    expect(summary).toMatch(/\.$/);
    expect(summary).not.toContain('...');
  });

  it('falls back to word boundary when no sentence boundary after char 80', () => {
    // Create content >200 chars with no sentence boundary (. ! ?) after position 80
    const content = 'One short sentence. ' + 'word '.repeat(50);
    const summary = generateSummary(content);
    expect(summary).toContain('...');
    expect(summary.length).toBeLessThanOrEqual(205);
  });
});

describe('makeToolResponse', () => {
  it('wraps data as JSON text content', () => {
    const data = { foo: 'bar', count: 42 };
    const result = makeToolResponse(data);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.foo).toBe('bar');
    expect(parsed.count).toBe(42);
  });

  it('does not set isError', () => {
    const result = makeToolResponse({ ok: true });
    expect((result as Record<string, unknown>).isError).toBeUndefined();
  });
});

describe('makeErrorResponse', () => {
  it('wraps error message as JSON with isError: true', () => {
    const result = makeErrorResponse('Something went wrong');
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('Something went wrong');
  });
});
