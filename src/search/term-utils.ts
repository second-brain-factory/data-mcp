/**
 * Term utilities for search fallback (issue #1297).
 *
 * Tokenizes queries and produces prefix-tolerant stems so that
 * inflected English words (plurals, -ing/-ed forms) match the stored
 * text under substring/LIKE backends.
 *
 * The stemmer is intentionally conservative: it only strips common
 * suffixes and returns a PREFIX of the word, because all three
 * backends can do substring matching ("pric" matches "pricing",
 * "prices", "price"). It is not a linguistic stemmer.
 */

/** Common English stopwords — excluded from fallback terms. */
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on',
    'with', 'at', 'by', 'from', 'as', 'and', 'but', 'or', 'not', 'so',
    'if', 'when', 'how', 'what', 'which', 'who', 'this', 'that', 'these',
    'those', 'it', 'its', 'my', 'our', 'your', 'their', 'we', 'you',
    'they', 'about', 'into', 'over', 'under', 'all', 'any', 'some',
]);

/** Max number of fallback terms (keeps adapter call fan-out bounded). */
export const MAX_FALLBACK_TERMS = 8;

/**
 * Split a query into lowercase word tokens.
 * Strips punctuation, drops stopwords and tokens shorter than 3 chars.
 */
export function tokenize(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Conservative prefix-stem for English words.
 *
 * Returns a prefix of the word with common suffixes stripped, so a
 * substring search on the stem matches the word's inflections:
 *   experiments -> experiment, pricing -> pric, deployed -> deploy,
 *   running -> run, studies -> stud
 *
 * Words that are too short to stem safely are returned unchanged.
 */
export function stemTerm(word: string): string {
    const w = word.toLowerCase();
    if (w.length > 4 && w.endsWith('ies')) {
        return w.slice(0, -3);
    }
    if (w.length > 5 && w.endsWith('ing')) {
        let s = w.slice(0, -3);
        // doubled final consonant: running -> runn -> run
        if (s.length >= 3 && s[s.length - 1] === s[s.length - 2] && !'aeiou'.includes(s[s.length - 1])) {
            s = s.slice(0, -1);
        }
        return s;
    }
    if (w.length > 4 && w.endsWith('ed')) {
        let s = w.slice(0, -2);
        if (s.length >= 3 && s[s.length - 1] === s[s.length - 2] && !'aeiou'.includes(s[s.length - 1])) {
            s = s.slice(0, -1);
        }
        return s;
    }
    if (w.length > 4 && w.endsWith('es')) {
        return w.slice(0, -2);
    }
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
        return w.slice(0, -1);
    }
    return w;
}

/**
 * Build the deduplicated list of fallback search terms for a query:
 * stemmed query tokens first, then stemmed alias-expansion terms.
 * Capped at MAX_FALLBACK_TERMS.
 */
export function buildFallbackTerms(query: string, aliasTerms: string[] = []): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string) => {
        const stem = stemTerm(raw);
        if (stem.length >= 3 && !seen.has(stem) && out.length < MAX_FALLBACK_TERMS) {
            seen.add(stem);
            out.push(stem);
        }
    };
    for (const token of tokenize(query)) push(token);
    for (const alias of aliasTerms) {
        for (const token of tokenize(alias)) push(token);
    }
    return out;
}
