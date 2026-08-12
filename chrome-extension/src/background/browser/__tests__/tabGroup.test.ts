import { describe, it, expect, beforeEach, vi } from 'vitest';
import TaskTabGroup, { TabGroupStatus } from '../tabGroup';

/**
 * The chrome.tabs/tabGroups surface TaskTabGroup touches. `group` returns the id of the group the
 * tab landed in, matching the real API: a call without a groupId mints a new one.
 */
function stubChrome() {
  const update = vi.fn().mockResolvedValue(undefined);
  const group = vi.fn(async (options: { groupId?: number; tabIds: number[] }) => options.groupId ?? 100);
  vi.stubGlobal('chrome', { tabs: { group }, tabGroups: { update } });
  return { group, update };
}

describe('TaskTabGroup', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the group on the first tab and titles it with the task', async () => {
    const { group, update } = stubChrome();
    const tabGroup = new TaskTabGroup('Search GitHub issues');

    await tabGroup.adopt(1);

    expect(group).toHaveBeenCalledWith({ tabIds: [1] });
    expect(update).toHaveBeenCalledWith(100, { title: '⏳Search GitHub issues', color: 'orange' });
    expect(tabGroup.groupId).toBe(100);
  });

  it('adds later tabs to the same group without retitling it', async () => {
    const { group, update } = stubChrome();
    const tabGroup = new TaskTabGroup('Search GitHub issues');

    await tabGroup.adopt(1);
    await tabGroup.adopt(2);

    expect(group).toHaveBeenLastCalledWith({ groupId: 100, tabIds: [2] });
    // Re-titling on every tab would repaint the chip for no reason.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('groups each tab only once, so Chrome never re-sorts the tab strip', async () => {
    const { group } = stubChrome();
    const tabGroup = new TaskTabGroup('task');

    await tabGroup.adopt(7);
    await tabGroup.adopt(7);

    expect(group).toHaveBeenCalledTimes(1);
  });

  it('swaps the glyph when the task reaches a final state', async () => {
    const { update } = stubChrome();
    const tabGroup = new TaskTabGroup('Search GitHub issues');

    await tabGroup.adopt(1);
    await tabGroup.setStatus(TabGroupStatus.Done);

    expect(update).toHaveBeenLastCalledWith(100, { title: '✅Search GitHub issues' });
  });

  it('clips a long task label and collapses its whitespace', async () => {
    const { update } = stubChrome();
    const label = 'Find every open issue that mentions the tab grouping regression and summarise them';
    await new TaskTabGroup(`  ${label}  `).adopt(1);

    const title = update.mock.calls[0][1].title as string;
    expect(title.startsWith('⏳Find every open issue')).toBe(true);
    // Glyph plus 40 clipped characters.
    expect(title).toHaveLength('⏳'.length + 40);
    expect(title.endsWith('…')).toBe(true);
  });

  it('does nothing when the browser has no tab-group API', async () => {
    vi.stubGlobal('chrome', { tabs: {}, tabGroups: undefined });
    const tabGroup = new TaskTabGroup('task');

    await tabGroup.adopt(1);
    await tabGroup.setStatus(TabGroupStatus.Done);

    expect(tabGroup.groupId).toBeNull();
  });

  it('never throws when Chrome refuses to group a tab', async () => {
    const group = vi.fn().mockRejectedValue(new Error('No tab with id: 42.'));
    vi.stubGlobal('chrome', { tabs: { group }, tabGroups: { update: vi.fn() } });
    const tabGroup = new TaskTabGroup('task');

    await expect(tabGroup.adopt(42)).resolves.toBeUndefined();
    expect(tabGroup.groupId).toBeNull();
  });

  it('drops a group whose id went stale, so later updates stay quiet', async () => {
    const update = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('No group with id: 100.'));
    vi.stubGlobal('chrome', { tabs: { group: vi.fn().mockResolvedValue(100) }, tabGroups: { update } });
    const tabGroup = new TaskTabGroup('task');

    await tabGroup.adopt(1);
    await tabGroup.setStatus(TabGroupStatus.Done);

    expect(tabGroup.groupId).toBeNull();
    await tabGroup.setStatus(TabGroupStatus.Failed);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('re-adopts a tab that was forgotten after being closed', async () => {
    const { group } = stubChrome();
    const tabGroup = new TaskTabGroup('task');

    await tabGroup.adopt(3);
    tabGroup.forget(3);
    await tabGroup.adopt(3);

    expect(group).toHaveBeenCalledTimes(2);
  });
});
