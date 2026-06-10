/**
 * Tool: contact_create
 *
 * Create a contact record.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerContactCreate(server, adapter) {
    server.tool('contact_create', 'Create a new contact with name, company, role, and other details.', {
        name: z.string().min(1).max(200).describe('Contact name'),
        company: z.string().max(200).optional().describe('Company name'),
        role: z.string().max(200).optional().describe('Role/title'),
        email: z.string().max(200).optional().describe('Email address'),
        phone: z.string().max(50).optional().describe('Phone number'),
        relationship: z.enum(['colleague', 'client', 'prospect', 'partner', 'other']).optional().describe('Relationship type'),
        notes: z.string().max(5000).optional().describe('Notes about the contact'),
        tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
    }, withGracefulDegradation('contacts', adapter, async (params) => {
        try {
            const record = await adapter.create('contacts', {
                name: params.name.trim(),
                company: params.company ?? null,
                role: params.role ?? null,
                email: params.email ?? null,
                phone: params.phone ?? null,
                relationship: params.relationship ?? null,
                notes: params.notes ?? null,
                tags: params.tags ?? [],
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
                last_contact_date: null,
            });
            return makeToolResponse({
                created: true,
                item: { id: record.id, name: record.name, company: record.company, created_at: record.created_at },
                message: `Contact created: "${params.name}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'contact_create');
        }
    }));
}
//# sourceMappingURL=contact-create.js.map
