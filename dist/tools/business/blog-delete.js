/**
 * Tool: blog_delete
 *
 * Delete a blog post by ID.
 */
import { z } from 'zod';
import { makeToolResponse, makeErrorResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerBlogDelete(server, adapter) {
    server.tool('blog_delete', 'Delete a blog post by ID. Requires confirm: true.', {
        id: z.string().min(1).describe('ID of the blog post to delete'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
    }, withGracefulDegradation('blog_posts', adapter, async (params) => {
        try {
            if (!params.confirm) {
                return makeErrorResponse('Deletion not confirmed. Set confirm: true to delete.');
            }
            await adapter.delete('blog_posts', params.id);
            return makeToolResponse({
                deleted: true,
                id: params.id,
                message: `Blog post ${params.id} deleted.`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'blog_delete');
        }
    }));
}
//# sourceMappingURL=blog-delete.js.map