import { createLogger } from '@src/background/log';

const logger = createLogger('TaskTabGroup');

/**
 * Terminal and running states a task group can advertise. The emoji is the whole point: a Chrome
 * tab group chip is only a few characters wide before it truncates, so the leading glyph is the
 * only part of the label a user reliably reads at a glance.
 */
export enum TabGroupStatus {
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
  Paused = 'paused',
  Cancelled = 'cancelled',
}

const STATUS_GLYPH: Record<TabGroupStatus, string> = {
  [TabGroupStatus.Running]: '⏳',
  [TabGroupStatus.Done]: '✅',
  [TabGroupStatus.Failed]: '⚠️',
  [TabGroupStatus.Paused]: '⏸️',
  [TabGroupStatus.Cancelled]: '⏹️',
};

/**
 * Chrome renders group titles in a fixed-width chip and truncates with an ellipsis of its own, so
 * this only exists to keep the stored title from carrying a whole paragraph of task text.
 */
const MAX_LABEL_LENGTH = 40;

/** One of Chrome's nine fixed group colours. Not a hex value - the API only accepts these names. */
const GROUP_COLOR: `${chrome.tabGroups.Color}` = 'orange';

/**
 * True when the running browser exposes the tab-group APIs. Firefox has neither, and `tabs.group`
 * arrived in Chrome 88, so every call site treats grouping as optional decoration.
 */
function isSupported(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.tabs?.group && !!chrome.tabGroups?.update;
}

function buildTitle(label: string, status: TabGroupStatus): string {
  const trimmed = label.trim().replace(/\s+/g, ' ');
  const clipped = trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1)}…` : trimmed;
  return `${STATUS_GLYPH[status]}${clipped}`;
}

/**
 * Collects every tab a task drives into one labelled Chrome tab group, so the user can see at a
 * glance which windows the agent is holding and what it is doing with them.
 *
 * Every method is best-effort. Grouping is a visual affordance, never a precondition for
 * automation, so a browser that refuses to group - a tab already closed, a window that cannot host
 * groups, a build without the permission - must degrade to no grouping rather than fail the task.
 */
export default class TaskTabGroup {
  private _groupId: number | null = null;
  private _status: TabGroupStatus = TabGroupStatus.Running;
  /**
   * Tabs already handed to `chrome.tabs.group`. Re-grouping a tab is harmless but forces Chrome to
   * re-sort the tab strip, which visibly jumps under the user's cursor, so each tab is added once.
   */
  private _adopted = new Set<number>();

  constructor(private readonly label: string) {}

  get groupId(): number | null {
    return this._groupId;
  }

  /**
   * Put a tab in the task's group, creating the group on the first call. Tabs the agent merely
   * reads are adopted the same as tabs it opened: from the user's side both are "a tab something
   * else is driving", which is exactly what the group is there to disclose.
   */
  public async adopt(tabId: number): Promise<void> {
    if (!isSupported() || this._adopted.has(tabId)) {
      return;
    }

    try {
      // Passing an existing groupId adds to it; omitting it makes Chrome mint a new group.
      const groupId = await chrome.tabs.group(
        this._groupId === null ? { tabIds: [tabId] } : { groupId: this._groupId, tabIds: [tabId] },
      );
      this._adopted.add(tabId);

      if (this._groupId === null) {
        this._groupId = groupId;
        await chrome.tabGroups.update(groupId, {
          title: buildTitle(this.label, this._status),
          color: GROUP_COLOR,
        });
        logger.info(`created tab group ${groupId} for "${this.label}"`);
      }
    } catch (error) {
      // A tab that closed between attach and group, or a window that cannot host groups.
      logger.warning(`Failed to group tab ${tabId}: ${error}`);
    }
  }

  /**
   * Retitle the group with a new status glyph. The group and its tabs are deliberately left in
   * place after a task ends: the tabs hold the result the user asked for, and the ✅ chip is the
   * record of which ones the agent touched.
   */
  public async setStatus(status: TabGroupStatus): Promise<void> {
    this._status = status;
    if (!isSupported() || this._groupId === null) {
      return;
    }

    try {
      await chrome.tabGroups.update(this._groupId, { title: buildTitle(this.label, status) });
    } catch (error) {
      // The user can dissolve the group by hand at any point, which invalidates the id.
      logger.warning(`Failed to update tab group ${this._groupId}: ${error}`);
      this._groupId = null;
    }
  }

  /**
   * Drop a tab from the bookkeeping without touching Chrome, for tabs that were closed elsewhere -
   * a finished parallel subtask, say. Chrome removes closed tabs from the group on its own.
   */
  public forget(tabId: number): void {
    this._adopted.delete(tabId);
  }
}
