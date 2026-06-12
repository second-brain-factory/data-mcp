/**
 * CSV parser — minimal RFC 4180 (quoted fields, embedded commas/newlines).
 * Small files become one labeled record; large files batch rows.
 */
const ROWS_PER_RECORD = 50;
/** Parse CSV text into rows of fields (RFC 4180 subset). */
export function parseCsvRows(content) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const push = () => { row.push(field); field = ''; };
    const pushRow = () => {
        push();
        if (row.length > 1 || row[0].trim() !== '')
            rows.push(row);
        row = [];
    };
    while (i < content.length) {
        const ch = content[i];
        if (inQuotes) {
            if (ch === '"') {
                if (content[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            i++;
            continue;
        }
        if (ch === ',') {
            push();
            i++;
            continue;
        }
        if (ch === '\r') {
            i++;
            continue;
        }
        if (ch === '\n') {
            pushRow();
            i++;
            continue;
        }
        field += ch;
        i++;
    }
    if (field.length > 0 || row.length > 0)
        pushRow();
    return rows;
}
function formatRows(header, rows) {
    return rows
        .map((r) => header.map((h, idx) => `${h}: ${r[idx] ?? ''}`).join('\n'))
        .join('\n\n---\n\n');
}
export const parseCsv = (content, ctx) => {
    const rows = parseCsvRows(content);
    if (rows.length === 0)
        return [];
    const [header, ...data] = rows;
    if (data.length === 0)
        return [];
    if (data.length <= ROWS_PER_RECORD) {
        return [{
                title: ctx.baseName,
                content: formatRows(header, data),
                type: 'reference',
                tags: [],
                source_meta: { rows: data.length, columns: header },
            }];
    }
    const items = [];
    const parts = Math.ceil(data.length / ROWS_PER_RECORD);
    for (let p = 0; p < parts; p++) {
        const slice = data.slice(p * ROWS_PER_RECORD, (p + 1) * ROWS_PER_RECORD);
        items.push({
            title: `${ctx.baseName} (rows ${p * ROWS_PER_RECORD + 1}-${p * ROWS_PER_RECORD + slice.length})`,
            content: formatRows(header, slice),
            type: 'reference',
            tags: [],
            source_meta: { rows: slice.length, columns: header },
        });
    }
    return items;
};
//# sourceMappingURL=csv.js.map