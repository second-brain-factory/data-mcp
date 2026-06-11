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
/** Max number of fallback terms (keeps adapter call fan-out bounded). */
export declare const MAX_FALLBACK_TERMS = 8;
/**
 * Split a query into lowercase word tokens.
 * Strips punctuation, drops stopwords and tokens shorter than 3 chars.
 */
export declare function tokenize(query: string): string[];
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
export declare function stemTerm(word: string): string;
/**
 * Build the deduplicated list of fallback search terms for a query:
 * stemmed query tokens first, then stemmed alias-expansion terms.
 * Capped at MAX_FALLBACK_TERMS.
 */
export declare function buildFallbackTerms(query: string, aliasTerms?: string[]): string[];
//# sourceMappingURL=term-utils.d.ts.map