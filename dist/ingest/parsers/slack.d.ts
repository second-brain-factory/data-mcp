/**
 * Slack export parser (issue #19) — one record per channel per day file.
 *
 * Day files live at `<channel>/<YYYY-MM-DD>.json` inside a workspace
 * export. Routing happens ONLY inside a detected slack export context
 * (runner pre-pass) so a random date-named JSON elsewhere stays generic.
 *
 * Rendering: `<display_name>: text` with <@U…> mentions resolved via the
 * ctx users map; thread replies grouped under their parent (`  ↳` prefix);
 * join/leave noise and empty bot messages skipped. Title `#<channel>
 * <date>` gives natural re-export dedupe (new days only).
 */
import type { Parser } from '../types.js';
/** Resolve <@U123> mentions and unescape Slack's &amp;/&lt;/&gt;. */
export declare function renderSlackText(text: string, users?: Map<string, string>): string;
export declare const parseSlackDay: Parser;
//# sourceMappingURL=slack.d.ts.map