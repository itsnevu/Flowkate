import { useState } from 'react';
import { t } from '@extension/i18n';
import { datasetFilename, rowsToCsv, rowsToJson, saveTextFile } from '../download';
import type { MessageDataset } from '@extension/storage';

interface ResultDatasetProps {
  dataset: MessageDataset;
  /** the message's own timestamp, which is what names the saved file */
  timestamp: number;
}

/**
 * Rows rendered into the panel. The rest are in the file: putting two thousand rows in the DOM
 * would cost more to scroll than the whole result cost to collect.
 */
const VISIBLE_ROWS = 100;

/**
 * Rows the agent never spoke aloud. Shown once the collection is over, at whatever size it reached.
 *
 * A table this size is the result of the task rather than a decoration on it, so unlike the trail
 * it is open by default, and unlike the answer text it comes with a way off the screen. The two
 * formats are not a preference to be configured: CSV is what a spreadsheet opens and JSON is what
 * the next script reads, and which one is wanted is known only by the person clicking.
 */
const ResultDataset = ({ dataset, timestamp }: ResultDatasetProps) => {
  const [failed, setFailed] = useState(false);
  const { fields, rows, truncated } = dataset;

  if (fields.length === 0 || rows.length === 0) {
    return null;
  }

  const shown = rows.slice(0, VISIBLE_ROWS);

  const save = (extension: 'csv' | 'json') => {
    const text = extension === 'csv' ? rowsToCsv(fields, rows) : rowsToJson(fields, rows);
    saveTextFile(text, datasetFilename(timestamp, extension), extension)
      .then(() => setFailed(false))
      .catch(() => setFailed(true));
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 rounded-pill bg-canvas-sunk px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink-faint shadow-neu-inset-sm">
        <span>{t('chat_dataset_summary', [String(rows.length), String(fields.length)])}</span>
        {truncated && <span className="text-signal-bad">{t('chat_dataset_truncated')}</span>}
      </div>

      <div className="mt-1.5 max-h-80 overflow-auto rounded-soft bg-canvas-sunk p-2 shadow-neu-inset-sm">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {fields.map((field, index) => (
                <th
                  key={index}
                  className="sticky top-0 whitespace-nowrap bg-canvas-sunk px-2 py-1.5 font-semibold text-ink">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className="border-t border-black/5">
                {row.map((cell, c) => (
                  <td key={c} className="px-2 py-1.5 align-top text-ink-soft">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length && (
        <div className="mt-1 px-1 text-[11px] text-ink-faint">
          {t('chat_dataset_showing', [String(shown.length), String(rows.length)])}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <DownloadKey label={t('chat_dataset_downloadCsv')} onClick={() => save('csv')} />
        <DownloadKey label={t('chat_dataset_downloadJson')} onClick={() => save('json')} />
        {failed && <span className="text-[11px] text-signal-bad">{t('chat_dataset_downloadFailed')}</span>}
      </div>
    </div>
  );
};

/** The same key as the copy-CSV one under a parsed table — one gesture, one control. */
export const DownloadKey = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-pill bg-canvas-raised px-2.5 py-1 text-[11px] font-medium text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm">
    {label}
  </button>
);

export default ResultDataset;
