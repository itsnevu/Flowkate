import { describe, it, expect } from 'vitest';
import { splitMarkdownTables, tableToCsv } from '../markdownTable';
import type { TableBlock } from '../markdownTable';

describe('splitMarkdownTables', () => {
  it('returns slot-free text as a single untouched block', () => {
    const text = 'no tables here\njust prose';
    expect(splitMarkdownTables(text)).toEqual([{ type: 'text', text }]);
  });

  it('leaves prose with a stray pipe alone — a lone row is not a table', () => {
    const text = 'see options | pricing for details';
    expect(splitMarkdownTables(text)).toEqual([{ type: 'text', text }]);
  });

  it('parses a piped table with surrounding text', () => {
    const text = [
      'The cheapest options:',
      '',
      '| Shop | Price |',
      '| --- | --- |',
      '| A | $10 |',
      '| B | $12 |',
      '',
      'B ships faster.',
    ].join('\n');
    const blocks = splitMarkdownTables(text);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'text' });
    expect(blocks[1]).toEqual({
      type: 'table',
      header: ['Shop', 'Price'],
      rows: [
        ['A', '$10'],
        ['B', '$12'],
      ],
    });
    expect(blocks[2]).toMatchObject({ type: 'text' });
  });

  it('handles rows without leading/trailing pipes and aligned separators', () => {
    const text = ['Name | Count', ':--- | ---:', 'x | 1', 'y | 2'].join('\n');
    const blocks = splitMarkdownTables(text);
    expect(blocks).toEqual([
      {
        type: 'table',
        header: ['Name', 'Count'],
        rows: [
          ['x', '1'],
          ['y', '2'],
        ],
      },
    ]);
  });

  it('pads a ragged row instead of dropping it, and trims extra cells', () => {
    const text = ['| A | B |', '| - | - |', '| only |', '| 1 | 2 | 3 |'].join('\n');
    const [table] = splitMarkdownTables(text);
    expect(table).toEqual({
      type: 'table',
      header: ['A', 'B'],
      rows: [
        ['only', ''],
        ['1', '2'],
      ],
    });
  });

  it('requires at least one data row — header plus separator alone stays text', () => {
    const text = ['| A | B |', '| - | - |'].join('\n');
    expect(splitMarkdownTables(text)).toEqual([{ type: 'text', text }]);
  });

  it('parses two separate tables in one message', () => {
    const text = ['| A |', '| - |', '| 1 |', '', 'and also', '', '| B |', '| - |', '| 2 |'].join('\n');
    const tables = splitMarkdownTables(text).filter(block => block.type === 'table');
    expect(tables).toHaveLength(2);
  });
});

describe('tableToCsv', () => {
  const table: TableBlock = {
    type: 'table',
    header: ['Name', 'Note'],
    rows: [
      ['plain', 'fine'],
      ['with, comma', 'has "quotes"'],
    ],
  };

  it('escapes commas and quotes RFC-4180 style', () => {
    expect(tableToCsv(table)).toBe(['Name,Note', 'plain,fine', '"with, comma","has ""quotes"""'].join('\n'));
  });
});
