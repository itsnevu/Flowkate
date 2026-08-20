/**
 * Turning a collected table into a file on the user's disk.
 *
 * The serialisers are pure and the save is the only part that touches the browser, which is what
 * lets the formats be asserted without a download API standing by. CSV is what a spreadsheet
 * opens; JSON is what the next script reads. Both are offered because a table that can only be
 * looked at is a table the user still has to retype.
 */

/** RFC-4180-style escaping: quote any cell holding a comma, quote or newline; double the quotes. */
const csvCell = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

/** A header row and its data rows as CSV, CRLF-free and one line per row. */
export function rowsToCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

/**
 * The same rows as an array of objects, keyed by column.
 *
 * Ragged rows are padded rather than skipped: a missing cell is an empty string, so every object
 * carries every key and whatever reads the file next can count on the shape.
 */
export function rowsToJson(fields: string[], rows: string[][]): string {
  const records = rows.map(row => Object.fromEntries(fields.map((field, index) => [field, row[index] ?? ''])));
  return JSON.stringify(records, null, 2);
}

/**
 * The filename a result is saved under.
 *
 * Derived from the result's own timestamp rather than the clock, so saving the same table twice
 * overwrites nothing and downloading it again a week later still names the day it was collected.
 * Chrome rejects a path in `filename`, so the whole thing is reduced to characters that cannot
 * make one.
 */
export function datasetFilename(timestamp: number, extension: 'csv' | 'json'): string {
  const at = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    at.getFullYear(),
    pad(at.getMonth() + 1),
    pad(at.getDate()),
    '-',
    pad(at.getHours()),
    pad(at.getMinutes()),
  ].join('');
  return `flowkite-${stamp}.${extension}`;
}

const MIME_TYPES = { csv: 'text/csv', json: 'application/json' } as const;

/**
 * Hand the browser a file to save.
 *
 * A blob URL rather than a data URL: a two-thousand-row CSV makes a data URL megabytes long, and
 * that is exactly where the download API starts refusing them. The URL is released once Chrome
 * reports the download settled — released any earlier and a download still reading from it fails,
 * never released and the blob outlives the panel.
 */
export async function saveTextFile(text: string, filename: string, extension: 'csv' | 'json'): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: `${MIME_TYPES[extension]};charset=utf-8` }));
  try {
    const downloadId = await chrome.downloads.download({ url, filename, saveAs: false });
    releaseWhenSettled(downloadId, url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Release a blob URL once its download stops needing it, whether it finished or was interrupted. */
function releaseWhenSettled(downloadId: number, url: string): void {
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId) return;
    const state = delta.state?.current;
    if (state !== 'complete' && state !== 'interrupted') return;
    chrome.downloads.onChanged.removeListener(listener);
    URL.revokeObjectURL(url);
  };
  chrome.downloads.onChanged.addListener(listener);
}
