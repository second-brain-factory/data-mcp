/**
 * In-memory DataAdapter for unit tests.
 *
 * Uses Maps to simulate collections. No network calls.
 */

import { AdapterError } from '../../src/errors/adapter-error.js';
import type { DataAdapter, Filter, FilterClause, ListResult, SortClause, PageOptions } from '../../src/adapter/types.js';

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return `mock_${idCounter.toString().padStart(6, '0')}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

export class MockAdapter implements DataAdapter {
  readonly backend = 'pocketbase' as const;
  private collections: Map<string, Map<string, Record<string, unknown>>> = new Map();

  /** Pre-create a collection (so collectionExists returns true) */
  addCollection(name: string): void {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
  }

  /** Get raw data from a collection (for test assertions) */
  getCollectionData(name: string): Map<string, Record<string, unknown>> | undefined {
    return this.collections.get(name);
  }

  /** Clear all collections */
  reset(): void {
    this.collections.clear();
    resetIdCounter();
  }

  async create<T extends Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>
  ): Promise<T> {
    this.ensureCollection(collection);
    const id = generateId();
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };
    this.collections.get(collection)!.set(id, record);
    return { ...record } as T;
  }

  async getOne<T extends Record<string, unknown>>(
    collection: string,
    id: string
  ): Promise<T> {
    this.ensureCollection(collection);
    const record = this.collections.get(collection)!.get(id);
    if (!record) {
      throw new AdapterError('RECORD_NOT_FOUND', `Record '${id}' not found in '${collection}'`);
    }
    return { ...record } as T;
  }

  async list<T extends Record<string, unknown>>(
    collection: string,
    options?: {
      filter?: Filter;
      sort?: SortClause[];
      page?: PageOptions;
    }
  ): Promise<ListResult<T>> {
    this.ensureCollection(collection);
    let items = Array.from(this.collections.get(collection)!.values());

    // Apply filter
    if (options?.filter) {
      items = items.filter((item) => matchesFilter(item, options.filter!));
    }

    // Apply sort
    if (options?.sort) {
      items = sortItems(items, options.sort);
    }

    const totalItems = items.length;
    const limit = options?.page?.limit ?? 50;
    const offset = options?.page?.offset ?? 0;
    items = items.slice(offset, offset + limit);

    return {
      items: items.map((i) => ({ ...i }) as T),
      totalItems,
      page: Math.floor(offset / limit) + 1,
      perPage: limit,
    };
  }

  async textSearch<T extends Record<string, unknown>>(
    collection: string,
    query: string,
    options?: {
      fields?: string[];
      filter?: Filter;
      limit?: number;
    }
  ): Promise<T[]> {
    this.ensureCollection(collection);
    const fields = options?.fields ?? ['title', 'content'];
    const limit = options?.limit ?? 20;
    const lowerQuery = query.toLowerCase();
    const queryTerms = lowerQuery.split(/\s+/).filter(Boolean);

    let items = Array.from(this.collections.get(collection)!.values());

    // Apply additional filter
    if (options?.filter) {
      items = items.filter((item) => matchesFilter(item, options.filter!));
    }

    // Text search: any term matches any field
    items = items.filter((item) => {
      return queryTerms.some((term) =>
        fields.some((field) => {
          const value = item[field];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term);
          }
          return false;
        })
      );
    });

    return items.slice(0, limit).map((i) => ({ ...i }) as T);
  }

  async update<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T> {
    this.ensureCollection(collection);
    const existing = this.collections.get(collection)!.get(id);
    if (!existing) {
      throw new AdapterError('RECORD_NOT_FOUND', `Record '${id}' not found in '${collection}'`);
    }
    const updated: Record<string, unknown> = {
      ...existing,
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    this.collections.get(collection)!.set(id, updated);
    return { ...updated } as T;
  }

  async delete(collection: string, id: string): Promise<void> {
    this.ensureCollection(collection);
    if (!this.collections.get(collection)!.has(id)) {
      throw new AdapterError('RECORD_NOT_FOUND', `Record '${id}' not found in '${collection}'`);
    }
    this.collections.get(collection)!.delete(id);
  }

  async upsert<T extends Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>,
    uniqueFields: string[]
  ): Promise<T> {
    this.ensureCollection(collection);

    // Find existing record by unique fields
    const items = Array.from(this.collections.get(collection)!.values());
    const existing = items.find((item) =>
      uniqueFields.every((field) => {
        const a = typeof item[field] === 'string' ? (item[field] as string).toLowerCase() : item[field];
        const b = typeof data[field] === 'string' ? (data[field] as string).toLowerCase() : data[field];
        return a === b;
      })
    );

    if (existing) {
      return this.update<T>(collection, existing.id as string, data);
    }

    return this.create<T>(collection, data);
  }

  async count(collection: string, filter?: Filter): Promise<number> {
    this.ensureCollection(collection);
    let items = Array.from(this.collections.get(collection)!.values());
    if (filter) {
      items = items.filter((item) => matchesFilter(item, filter));
    }
    return items.length;
  }

  async collectionExists(collection: string): Promise<boolean> {
    return this.collections.has(collection);
  }

  async listCollections(): Promise<string[]> {
    return Array.from(this.collections.keys());
  }

  private ensureCollection(collection: string): void {
    if (!this.collections.has(collection)) {
      throw new AdapterError('COLLECTION_NOT_FOUND', `Collection '${collection}' not found`);
    }
  }
}

function matchesFilter(item: Record<string, unknown>, filter: Filter): boolean {
  if (filter.length === 0) return true;

  // OR of AND groups
  return filter.some((andGroup) =>
    andGroup.every((clause) => matchesClause(item, clause))
  );
}

function matchesClause(item: Record<string, unknown>, clause: FilterClause): boolean {
  const itemValue = item[clause.field];
  const { op, value } = clause;

  switch (op) {
    case 'eq':
      return itemValue === value;
    case 'neq':
      return itemValue !== value;
    case 'gt':
      return (itemValue as number) > (value as number);
    case 'gte':
      return (itemValue as number) >= (value as number);
    case 'lt':
      if (typeof itemValue === 'string' && typeof value === 'string') {
        return itemValue < value;
      }
      return (itemValue as number) < (value as number);
    case 'lte':
      return (itemValue as number) <= (value as number);
    case 'like': {
      if (typeof itemValue !== 'string' || typeof value !== 'string') return false;
      return itemValue.toLowerCase().includes(value.toLowerCase());
    }
    case 'in':
      return (value as string[]).includes(itemValue as string);
    case 'contains': {
      if (!Array.isArray(itemValue)) return false;
      return itemValue.includes(value);
    }
    default:
      return itemValue === value;
  }
}

function sortItems(items: Record<string, unknown>[], sorts: SortClause[]): Record<string, unknown>[] {
  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (aVal === bVal) continue;
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (aVal === null || aVal === undefined) return direction;
      if (bVal === null || bVal === undefined) return -direction;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * direction;
      }
      return ((aVal as number) - (bVal as number)) * direction;
    }
    return 0;
  });
}
