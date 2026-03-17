/**
 * CRUD round-trip tests: create -> list -> update -> search for contacts, prospects, goals, tasks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

describe('CRUD round-trips', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
  });

  describe('contacts', () => {
    beforeEach(() => {
      adapter.addCollection('contacts');
    });

    it('create -> list -> update -> search', async () => {
      // Create
      const contact = await adapter.create('contacts', {
        name: 'Alice Johnson',
        company: 'TechCorp',
        role: 'CTO',
        email: 'alice@techcorp.com',
        relationship: 'client',
        notes: 'Met at conference.',
        tags: ['enterprise'],
      });
      expect(contact.id).toBeDefined();
      expect(contact.name).toBe('Alice Johnson');

      // List
      const listResult = await adapter.list('contacts', {
        sort: [{ field: 'created_at', direction: 'desc' }],
        page: { limit: 20, offset: 0 },
      });
      expect(listResult.items.length).toBe(1);
      expect(listResult.totalItems).toBe(1);

      // Update
      const updated = await adapter.update('contacts', contact.id as string, {
        company: 'NewCorp',
        role: 'CEO',
      });
      expect(updated.company).toBe('NewCorp');
      expect(updated.role).toBe('CEO');
      expect(updated.name).toBe('Alice Johnson');

      // Search
      const searchResults = await adapter.textSearch('contacts', 'Alice', {
        fields: ['name', 'company', 'notes'],
        limit: 10,
      });
      expect(searchResults.length).toBe(1);
      expect(searchResults[0].name).toBe('Alice Johnson');
    });
  });

  describe('prospects', () => {
    beforeEach(() => {
      adapter.addCollection('prospects');
    });

    it('create -> list -> update -> search', async () => {
      // Create
      const prospect = await adapter.create('prospects', {
        name: 'Bob Smith',
        email: 'bob@example.com',
        company: 'StartupXYZ',
        stage: 'new',
        source: 'LinkedIn',
        notes: 'Interested in enterprise plan.',
        tags: ['high-value'],
      });
      expect(prospect.id).toBeDefined();
      expect(prospect.stage).toBe('new');

      // List with stage filter
      const listResult = await adapter.list('prospects', {
        filter: [[{ field: 'stage', op: 'eq', value: 'new' }]],
        sort: [{ field: 'created_at', direction: 'desc' }],
        page: { limit: 20, offset: 0 },
      });
      expect(listResult.items.length).toBe(1);

      // Update stage
      const updated = await adapter.update('prospects', prospect.id as string, {
        stage: 'contacted',
        last_contact_date: new Date().toISOString(),
      });
      expect(updated.stage).toBe('contacted');

      // List with new stage filter should be empty for 'new'
      const emptyResult = await adapter.list('prospects', {
        filter: [[{ field: 'stage', op: 'eq', value: 'new' }]],
        page: { limit: 20, offset: 0 },
      });
      expect(emptyResult.items.length).toBe(0);

      // Search by company
      const searchResults = await adapter.textSearch('prospects', 'StartupXYZ', {
        fields: ['name', 'company', 'notes'],
        limit: 10,
      });
      expect(searchResults.length).toBe(1);
    });
  });

  describe('goals', () => {
    beforeEach(() => {
      adapter.addCollection('goals');
    });

    it('create -> list -> update -> list with filter', async () => {
      // Create
      const goal = await adapter.create('goals', {
        title: 'Ship v1',
        description: 'Release the first version.',
        timeframe: 'monthly',
        status: 'active',
        key_results: [{ description: 'All tests passing', target: 1, current: 0 }],
        tags: ['product'],
      });
      expect(goal.id).toBeDefined();
      expect(goal.status).toBe('active');

      // List active goals
      const activeGoals = await adapter.list('goals', {
        filter: [[{ field: 'status', op: 'eq', value: 'active' }]],
        sort: [{ field: 'created_at', direction: 'desc' }],
        page: { limit: 20, offset: 0 },
      });
      expect(activeGoals.items.length).toBe(1);

      // Update to completed
      const updated = await adapter.update('goals', goal.id as string, {
        status: 'completed',
        key_results: [{ description: 'All tests passing', target: 1, current: 1 }],
      });
      expect(updated.status).toBe('completed');

      // List completed goals
      const completedGoals = await adapter.list('goals', {
        filter: [[{ field: 'status', op: 'eq', value: 'completed' }]],
        page: { limit: 20, offset: 0 },
      });
      expect(completedGoals.items.length).toBe(1);

      // Active goals should be empty now
      const noActive = await adapter.list('goals', {
        filter: [[{ field: 'status', op: 'eq', value: 'active' }]],
        page: { limit: 20, offset: 0 },
      });
      expect(noActive.items.length).toBe(0);
    });
  });

  describe('tasks', () => {
    beforeEach(() => {
      adapter.addCollection('tasks');
    });

    it('create -> list -> update -> list with filter', async () => {
      // Create
      const task = await adapter.create('tasks', {
        title: 'Write tests',
        description: 'Write unit tests for all tools.',
        status: 'todo',
        priority: 'high',
        tags: ['testing'],
      });
      expect(task.id).toBeDefined();
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('high');

      // Create another task
      await adapter.create('tasks', {
        title: 'Fix bugs',
        status: 'todo',
        priority: 'medium',
        tags: ['bugs'],
      });

      // List all tasks
      const allTasks = await adapter.list('tasks', {
        sort: [{ field: 'created_at', direction: 'desc' }],
        page: { limit: 20, offset: 0 },
      });
      expect(allTasks.items.length).toBe(2);

      // Filter by priority
      const highPriority = await adapter.list('tasks', {
        filter: [[{ field: 'priority', op: 'eq', value: 'high' }]],
        page: { limit: 20, offset: 0 },
      });
      expect(highPriority.items.length).toBe(1);

      // Update status
      const updated = await adapter.update('tasks', task.id as string, {
        status: 'in_progress',
      });
      expect(updated.status).toBe('in_progress');

      // Search by text
      const searchResults = await adapter.textSearch('tasks', 'tests', {
        fields: ['title', 'description'],
        limit: 10,
      });
      expect(searchResults.length).toBe(1);
      expect(searchResults[0].title).toBe('Write tests');
    });
  });
});
