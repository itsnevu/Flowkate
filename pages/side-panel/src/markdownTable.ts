/**
 * GitHub-style pipe tables inside a chat message, without a markdown engine.
 *
 * The final answer of a research or extraction task frequently arrives as a pipe table (the
 * extractor is told to format tabular results that way). Rendering it as monospace soup wastes the
 * best part of the result, and pulling in a markdown library for one block type is a dependency
 * this repo has deliberately avoided. So: exactly one construct is recognised — a header row, a
 * separator row of dashes, then data rows — and everything else stays untouched text.
 */

export interface TableBlock {
  type: 'table';
  header: string[];
  rows: string[][];
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type MessageBlock = TableBlock | TextBlock;

/** A row line: starts with an optional pipe and contains at least one more pipe. */
const looksLikeRow = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  // "a | b" and "| a | b |" both count; a line with a single leading pipe and nothing else does not
  return trimmed.replace(/[^|]/g, '').length >= (trimmed.startsWith('|') && trimmed.endsWith('|') ? 2 : 1);
};

/** The separator under the header: only pipes, dashes, colons and spaces, with at least one dash. */
const isSeparatorRow = (line: string): boolean => {
  const trimmed = line.trim();
  return looksLikeRow(trimmed) && /-/.test(trimmed) && /^[|\s:-]+$/.test(trimmed);
};

/** Split one row line into trimmed cells, dropping the empty edges a leading/trailing pipe makes. */
const splitRow = (line: string): string[] => {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(cell => cell.trim());
};

/**
 * Split a message into text and table blocks, in order.
 *
 * Deliberately strict about what counts as a table: a header row, a separator row, and at least
 * one data row, all adjacent. A lone line with a pipe in it ("see options | pricing") never
 * qualifies, so prose cannot be eaten by accident.
 */
export function splitMarkdownTables(text: string): MessageBlock[] {
  const lines = text.split('\n');
  const blocks: MessageBlock[] = [];
  let textStart = 0;

  let i = 0;
  while (i < lines.length) {
    const isTableStart =
      looksLikeRow(lines[i]) &&
      i + 2 < lines.length &&
      isSeparatorRow(lines[i + 1]) &&
      looksLikeRow(lines[i + 2]) &&
      !isSeparatorRow(lines[i + 2]);

    if (!isTableStart) {
      i += 1;
      continue;
    }

    if (i > textStart) {
      const before = lines.slice(textStart, i).join('\n');
      if (before.trim()) blocks.push({ type: 'text', text: before });
    }

    const header = splitRow(lines[i]);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && looksLikeRow(lines[j]) && !isSeparatorRow(lines[j])) {
      // Ragged rows are padded rather than dropped: a model that misses one cell in one row
      // should not cost the reader the whole row.
      const cells = splitRow(lines[j]);
      while (cells.length < header.length) cells.push('');
      rows.push(cells.slice(0, header.length));
      j += 1;
    }

    blocks.push({ type: 'table', header, rows });
    i = j;
    textStart = j;
  }

  if (textStart < lines.length) {
    const rest = lines.slice(textStart).join('\n');
    if (rest.trim()) blocks.push({ type: 'text', text: rest });
  }

  // A message with no table comes back as itself, untrimmed, so rendering stays byte-identical.
  if (blocks.length === 0 || blocks.every(block => block.type === 'text')) {
    return [{ type: 'text', text }];
  }
  return blocks;
}

/** RFC-4180-style escaping: quote any cell holding a comma, quote or newline; double the quotes. */
const csvCell = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

export function tableToCsv(table: TableBlock): string {
  return [table.header, ...table.rows].map(row => row.map(csvCell).join(',')).join('\n');
}
