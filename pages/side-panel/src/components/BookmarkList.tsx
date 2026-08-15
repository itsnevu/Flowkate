/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react';
import { FaTrash, FaPen, FaCheck, FaTimes, FaGripVertical } from 'react-icons/fa';
import { t } from '@extension/i18n';
import { findPlaceholders } from '../templates';

interface Bookmark {
  id: number;
  title: string;
  content: string;
}

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onBookmarkSelect: (content: string) => void;
  onBookmarkUpdateTitle?: (id: number, title: string) => void;
  onBookmarkDelete?: (id: number) => void;
  onBookmarkReorder?: (draggedId: number, targetId: number) => void;
}

/** Resting chip: a pill pressed out of the canvas. */
const CHIP =
  'group relative flex min-w-0 max-w-full items-center gap-1 rounded-pill bg-canvas-raised py-1.5 pl-2.5 pr-1.5 shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm';

/** While renaming, the chip opens into its own full-width row. */
const CHIP_EDITING = 'flex w-full items-center gap-1 rounded-soft bg-canvas-raised p-1.5 shadow-neu';

/** Flat icon button that lives inside a chip — the chip already carries the extrusion. */
const CHIP_ACTION =
  'grid size-6 shrink-0 place-items-center rounded-pill transition-all duration-150 ease-press active:shadow-neu-inset-sm';

/** Revealed on hover, opacity-only so it stays tabbable and returns on keyboard focus. */
const CHIP_ACTION_REVEAL = 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100';

/** Rename field: a well sunk into the chip. */
const EDIT_INPUT =
  'min-w-0 grow rounded-pill bg-canvas-sunk px-3 py-1 text-sm text-ink shadow-neu-inset-sm outline-none placeholder:text-ink-faint';

const BookmarkList: React.FC<BookmarkListProps> = ({
  bookmarks,
  onBookmarkSelect,
  onBookmarkUpdateTitle,
  onBookmarkDelete,
  onBookmarkReorder,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEditClick = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditTitle(bookmark.title);
  };

  const handleSaveEdit = (id: number) => {
    if (onBookmarkUpdateTitle && editTitle.trim()) {
      onBookmarkUpdateTitle(id, editTitle);
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id.toString());
    // Add more transparent effect
    e.currentTarget.classList.add('opacity-25');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-25');
    setDraggedId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) return;

    if (onBookmarkReorder) {
      onBookmarkReorder(draggedId, targetId);
    }
  };

  // Focus the input field when entering edit mode
  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  return (
    <div className="p-3">
      <h3 className="mb-3 text-sm font-medium text-ink-soft">{t('chat_bookmarks_header')}</h3>
      <div className="flex flex-wrap gap-2">
        {bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            draggable={editingId !== bookmark.id}
            onDragStart={e => handleDragStart(e, bookmark.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, bookmark.id)}
            className={editingId === bookmark.id ? CHIP_EDITING : CHIP}>
            {editingId === bookmark.id ? (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className={EDIT_INPUT}
                />
                <button
                  onClick={() => handleSaveEdit(bookmark.id)}
                  className={`${CHIP_ACTION} text-ink-faint hover:text-signal-ok`}
                  aria-label={t('chat_bookmarks_saveEdit')}
                  type="button">
                  <FaCheck size={12} />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className={`${CHIP_ACTION} text-ink-faint hover:text-signal-bad`}
                  aria-label={t('chat_bookmarks_cancelEdit')}
                  type="button">
                  <FaTimes size={12} />
                </button>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="shrink-0 cursor-grab text-ink-faint">
                  <FaGripVertical size={10} />
                </span>
                <button
                  type="button"
                  onClick={() => onBookmarkSelect(bookmark.content)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onBookmarkSelect(bookmark.content);
                    }
                  }}
                  className="flex min-w-0 items-center gap-1.5 text-left">
                  <div className="truncate text-sm text-ink-soft transition-colors group-hover:text-ink">
                    {bookmark.title}
                  </div>
                  {/* Marks a template: picking this chip starts a fill-in, not a send. */}
                  {findPlaceholders(bookmark.content).length > 0 && (
                    <span
                      className="shrink-0 rounded-pill bg-canvas-sunk px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-faint shadow-neu-inset-sm"
                      title={t('chat_bookmarks_template')}
                      aria-label={t('chat_bookmarks_template')}>
                      {'{ }'}
                    </span>
                  )}
                </button>

                {/* Rename */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleEditClick(bookmark);
                  }}
                  className={`${CHIP_ACTION} ${CHIP_ACTION_REVEAL} text-ink-faint hover:text-ink`}
                  aria-label={t('chat_bookmarks_edit')}
                  type="button">
                  <FaPen size={11} />
                </button>

                {/* Delete */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (onBookmarkDelete) {
                      onBookmarkDelete(bookmark.id);
                    }
                  }}
                  className={`${CHIP_ACTION} ${CHIP_ACTION_REVEAL} text-ink-faint hover:text-signal-bad`}
                  aria-label={t('chat_bookmarks_delete')}
                  type="button">
                  <FaTrash size={11} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookmarkList;
