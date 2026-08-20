import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rowsToCsv, rowsToJson, datasetFilename, saveTextFile } from '../download';

describe('rowsToCsv', () => {
  it('writes the header first, then one line per row', () => {
    expect(
      rowsToCsv(
        ['Name', 'Price'],
        [
          ['Kite', '10'],
          ['Line', '4'],
        ],
      ),
    ).toBe(['Name,Price', 'Kite,10', 'Line,4'].join('\n'));
  });

  it('quotes the cells that would otherwise break the file', () => {
    const csv = rowsToCsv(
      ['Name', 'Note'],
      [
        ['with, comma', 'has "quotes"'],
        ['two\nlines', 'plain'],
      ],
    );

    expect(csv).toBe(['Name,Note', '"with, comma","has ""quotes"""', '"two\nlines",plain'].join('\n'));
  });

  it('writes a header-only file when nothing was collected', () => {
    expect(rowsToCsv(['Name'], [])).toBe('Name');
  });
});

describe('rowsToJson', () => {
  it('keys every cell by its column', () => {
    const json = rowsToJson(['name', 'price'], [['Kite', '10']]);

    expect(JSON.parse(json)).toEqual([{ name: 'Kite', price: '10' }]);
  });

  it('pads a short row rather than dropping its keys', () => {
    const json = rowsToJson(['name', 'price'], [['Kite']]);

    expect(JSON.parse(json)).toEqual([{ name: 'Kite', price: '' }]);
  });

  it('writes an empty array when nothing was collected', () => {
    expect(JSON.parse(rowsToJson(['name'], []))).toEqual([]);
  });
});

describe('datasetFilename', () => {
  it('names the file after the moment the rows were collected', () => {
    const at = new Date(2026, 7, 21, 9, 5).getTime();

    expect(datasetFilename(at, 'csv')).toBe('flowkite-20260821-0905.csv');
    expect(datasetFilename(at, 'json')).toBe('flowkite-20260821-0905.json');
  });

  it('is stable, so saving the same result twice asks for the same name', () => {
    const at = new Date(2026, 0, 2, 3, 4).getTime();

    expect(datasetFilename(at, 'csv')).toBe(datasetFilename(at, 'csv'));
    expect(datasetFilename(at, 'csv')).toBe('flowkite-20260102-0304.csv');
  });

  it('never produces a path, which Chrome would reject', () => {
    expect(datasetFilename(Date.now(), 'csv')).not.toMatch(/[/\\]/);
  });
});

describe('saveTextFile', () => {
  const listeners: Array<(delta: { id: number; state?: { current: string } }) => void> = [];
  let download: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners.length = 0;
    download = vi.fn(async () => 7);
    revoke = vi.fn();
    (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
      ...(globalThis as unknown as { chrome: Record<string, unknown> }).chrome,
      downloads: {
        download,
        onChanged: {
          addListener: vi.fn((listener: (typeof listeners)[number]) => listeners.push(listener)),
          removeListener: vi.fn((listener: (typeof listeners)[number]) => {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          }),
        },
      },
    };
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    globalThis.URL.revokeObjectURL = revoke;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks Chrome to save the blob under the given name, without a save dialog', async () => {
    await saveTextFile('a,b', 'flowkite-20260821-0905.csv', 'csv');

    expect(download).toHaveBeenCalledWith({
      url: 'blob:fake',
      filename: 'flowkite-20260821-0905.csv',
      saveAs: false,
    });
  });

  it('holds the blob URL until the download is done with it', async () => {
    await saveTextFile('a,b', 'file.csv', 'csv');
    expect(revoke).not.toHaveBeenCalled();

    listeners.forEach(listener => listener({ id: 7, state: { current: 'complete' } }));
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(listeners).toHaveLength(0);
  });

  it('releases it after an interrupted download too, rather than leaking it', async () => {
    await saveTextFile('a,b', 'file.csv', 'csv');
    listeners.forEach(listener => listener({ id: 7, state: { current: 'interrupted' } }));

    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });

  it('ignores progress on some other download', async () => {
    await saveTextFile('a,b', 'file.csv', 'csv');
    listeners.forEach(listener => listener({ id: 99, state: { current: 'complete' } }));

    expect(revoke).not.toHaveBeenCalled();
  });

  it('releases the URL and reports the failure when Chrome refuses the download', async () => {
    download.mockRejectedValueOnce(new Error('nope'));

    await expect(saveTextFile('a,b', 'file.csv', 'csv')).rejects.toThrow('nope');
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});
