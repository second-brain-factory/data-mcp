/**
 * Tool: brain_stats
 *
 * Aggregate counts and health metrics across all collections.
 * Knowledge breakdown by type. Stale item count.
 * Uses Promise.all to parallelize queries.
 */
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
const COLLECTIONS = ['knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts'];
const KNOWLEDGE_TYPES = ['fact', 'pattern', 'insight', 'lesson', 'reference'];
// Items not validated in 90+ days are considered stale
const STALE_THRESHOLD_DAYS = 90;
export function registerBrainStats(server, adapter) {
    server.tool('brain_stats', 'Get aggregate statistics about your Second Brain. Shows counts for all collections, knowledge breakdown by type, and stale item count.', {}, { readOnlyHint: true }, withGracefulDegradation('knowledge', adapter, async () => {
        try {
            // Count all collections in parallel
            const countEntries = await Promise.all(COLLECTIONS.map(async (collection) => {
                try {
                    const exists = await adapter.collectionExists(collection);
                    return [collection, exists ? await adapter.count(collection) : 0];
                }
                catch {
                    return [collection, 0];
                }
            }));
            const counts = Object.fromEntries(countEntries);
            // Knowledge breakdown by type in parallel
            const typeEntries = await Promise.all(KNOWLEDGE_TYPES.map(async (type) => {
                try {
                    return [type, await adapter.count('knowledge', [
                            [{ field: 'type', op: 'eq', value: type }],
                        ])];
                }
                catch {
                    return [type, 0];
                }
            }));
            const knowledgeByType = Object.fromEntries(typeEntries);
            // Stale count
            let staleCount = 0;
            try {
                const staleDate = new Date();
                staleDate.setDate(staleDate.getDate() - STALE_THRESHOLD_DAYS);
                staleCount = await adapter.count('knowledge', [
                    [{ field: 'last_validated_at', op: 'lt', value: staleDate.toISOString() }],
                ]);
            }
            catch {
                // last_validated_at might not exist
            }
            return makeToolResponse({
                counts,
                knowledge_by_type: knowledgeByType,
                stale_count: staleCount,
                stale_threshold_days: STALE_THRESHOLD_DAYS,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'brain_stats');
        }
    }));
}
//# sourceMappingURL=brain-stats.js.map