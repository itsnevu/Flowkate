import { describe, it, expect } from 'vitest';
import { TaskDataset, parseRecords, MAX_DATASET_FIELDS, MAX_DATASET_ROWS, MAX_CELL_CHARS } from '../dataset';

describe('TaskDataset', () => {
  it('starts empty and takes its columns from the first records', () => {
    const dataset = new TaskDataset();
    expect(dataset.isEmpty()).toBe(true);

    const outcome = dataset.add([{ name: 'Kite', price: '10' }]);

    expect(outcome).toEqual({ added: 1, duplicates: 0, dropped: 0, total: 1 });
    expect(dataset.columns).toEqual(['name', 'price']);
    expect(dataset.snapshot().rows).toEqual([['Kite', '10']]);
  });

  it('accumulates across calls, which is what makes paginating cheap', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite' }, { name: 'Line' }]);
    const second = dataset.add([{ name: 'Reel' }]);

    expect(second.added).toBe(1);
    expect(second.total).toBe(3);
    expect(dataset.rowCount).toBe(3);
  });

  it('drops a record it already holds, so re-reading a page costs nothing', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite', price: '10' }]);
    const again = dataset.add([
      { name: 'Kite', price: '10' },
      { name: 'Line', price: '4' },
    ]);

    expect(again).toEqual({ added: 1, duplicates: 1, dropped: 0, total: 2 });
  });

  it('recognises a duplicate whatever order its keys arrive in', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite', price: '10' }]);

    expect(dataset.add([{ price: '10', name: 'Kite' }]).duplicates).toBe(1);
  });

  it('drops a record with nothing in it rather than storing a row of blanks', () => {
    const dataset = new TaskDataset();

    expect(dataset.add([{ name: '', price: '' }, {}])).toEqual({ added: 0, duplicates: 0, dropped: 2, total: 0 });
    expect(dataset.isEmpty()).toBe(true);
  });

  it('widens the table for a new column and pads the rows already stored', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite' }]);
    dataset.add([{ name: 'Line', price: '4' }]);

    expect(dataset.columns).toEqual(['name', 'price']);
    expect(dataset.snapshot().rows).toEqual([
      ['Kite', ''],
      ['Line', '4'],
    ]);
  });

  it('collapses whitespace, because a newline in a cell breaks every table that renders it', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: '  Big\n  Kite  ' }]);

    expect(dataset.snapshot().rows).toEqual([['Big Kite']]);
  });

  it('coerces a value the model sent as a number rather than a string', () => {
    const dataset = new TaskDataset();
    dataset.add([{ price: 10 } as unknown as Record<string, string>]);

    expect(dataset.snapshot().rows).toEqual([['10']]);
  });

  it('truncates a runaway cell and says the table was capped', () => {
    const dataset = new TaskDataset();
    dataset.add([{ blurb: 'x'.repeat(MAX_CELL_CHARS + 50) }]);

    const snapshot = dataset.snapshot();
    expect(snapshot.rows[0][0]).toHaveLength(MAX_CELL_CHARS + 1); // the ellipsis rides on the end
    expect(snapshot.rows[0][0].endsWith('…')).toBe(true);
  });

  it('ignores columns past the cap without losing the record that carried them', () => {
    const dataset = new TaskDataset();
    const wide = Object.fromEntries(
      Array.from({ length: MAX_DATASET_FIELDS + 3 }, (_, index) => [`f${index}`, String(index)]),
    );
    dataset.add([wide]);

    expect(dataset.columns).toHaveLength(MAX_DATASET_FIELDS);
    expect(dataset.rowCount).toBe(1);
    expect(dataset.snapshot().truncated).toBe(true);
  });

  it('stops at the row cap and reports the rows it turned away', () => {
    const dataset = new TaskDataset();
    const records = Array.from({ length: MAX_DATASET_ROWS + 5 }, (_, index) => ({ n: String(index) }));

    const outcome = dataset.add(records);

    expect(outcome.added).toBe(MAX_DATASET_ROWS);
    expect(outcome.dropped).toBe(5);
    expect(dataset.snapshot().truncated).toBe(true);
  });

  it('previews the last rows as a sample, never the whole set', () => {
    const dataset = new TaskDataset();
    dataset.add([
      { name: 'Kite', price: '10' },
      { name: 'Line', price: '' },
      { name: 'Reel', price: '7' },
    ]);

    expect(dataset.preview()).toBe('name: Line\nname: Reel | price: 7');
  });

  it('forgets everything on clear, so a follow-up task starts its own table', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite' }]);
    dataset.clear();

    expect(dataset.isEmpty()).toBe(true);
    expect(dataset.columns).toEqual([]);
    // and the same record is new again, rather than remembered as a duplicate
    expect(dataset.add([{ name: 'Kite' }]).added).toBe(1);
  });

  it('hands out copies, so a snapshot already delivered cannot be changed underneath the reader', () => {
    const dataset = new TaskDataset();
    dataset.add([{ name: 'Kite' }]);
    const snapshot = dataset.snapshot();
    dataset.add([{ name: 'Line' }]);

    expect(snapshot.rows).toEqual([['Kite']]);
  });
});

describe('parseRecords', () => {
  it('reads a bare JSON array', () => {
    expect(parseRecords('[{"name":"Kite"}]')).toEqual([{ name: 'Kite' }]);
  });

  it('reads an array inside a fenced code block', () => {
    expect(parseRecords('```json\n[{"name":"Kite"}]\n```')).toEqual([{ name: 'Kite' }]);
  });

  it('reads an array a model wrapped in prose it was asked not to write', () => {
    expect(parseRecords('Here you go:\n[{"name":"Kite"}]\nHope that helps.')).toEqual([{ name: 'Kite' }]);
  });

  it('unwraps the object some providers put the array inside', () => {
    expect(parseRecords('{"records":[{"name":"Kite"}]}')).toEqual([{ name: 'Kite' }]);
  });

  it('takes a lone object as a single record', () => {
    expect(parseRecords('{"name":"Kite"}')).toEqual([{ name: 'Kite' }]);
  });

  it('drops entries that are not records', () => {
    expect(parseRecords('[{"name":"Kite"}, "Line", null, 7, []]')).toEqual([{ name: 'Kite' }]);
  });

  it('reads an empty page as no records rather than an error', () => {
    expect(parseRecords('[]')).toEqual([]);
    expect(parseRecords('')).toEqual([]);
    expect(parseRecords('I could not find any products on this page.')).toEqual([]);
  });

  it('reads unparseable JSON as no records', () => {
    expect(parseRecords('[{"name": "Kite"')).toEqual([]);
  });
});
