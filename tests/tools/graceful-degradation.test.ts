import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { withGracefulDegradation, makeToolResponse } from '../../src/tools/shared.js';

describe('withGracefulDegradation', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
  });

  it('returns error when collection does not exist', async () => {
    const handler = withGracefulDegradation('knowledge', adapter, async () => {
      return makeToolResponse({ success: true });
    });

    const result = await handler({});
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('knowledge');
    expect(text).toContain('does not exist');
  });

  it('executes handler when collection exists', async () => {
    adapter.addCollection('knowledge');

    const handler = withGracefulDegradation('knowledge', adapter, async () => {
      return makeToolResponse({ success: true });
    });

    const result = await handler({});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('suggests setup_migrate in error message', async () => {
    const handler = withGracefulDegradation('missing_table', adapter, async () => {
      return makeToolResponse({ success: true });
    });

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('setup_migrate');
  });
});
