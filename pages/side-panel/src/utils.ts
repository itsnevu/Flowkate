export function generateNewTaskId(): string {
  /**
   * Generate a new task id based on the current timestamp and a random number.
   */
  return `${Date.now()}-${Math.floor(Math.random() * (999999 - 100000 + 1) + 100000)}`;
}

export function getCurrentTimestampStr(): string {
  /**
   * Get the current timestamp as a string in the format yyyy-MM-dd HH:mm:ss
   * using local timezone.
   *
   * @returns Formatted datetime string in local time
   */
  return new Date()
    .toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '');
}

/**
 * The title a session gets when it is pinned to the bookmark strip.
 *
 * Shared rather than inlined at the one call site, because the history list has to answer "is this
 * session already bookmarked?" from session metadata alone - it never loads the messages - and the
 * only thing the two sides can compare on is this title. Two copies of the rule would drift, and
 * the drift would show up as a bookmark icon that never fills.
 */
export function bookmarkTitleForSession(sessionTitle: string): string {
  return sessionTitle.split(' ').slice(0, 8).join(' ');
}
