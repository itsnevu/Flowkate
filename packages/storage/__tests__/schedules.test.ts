import { describe, it, expect, beforeEach } from 'vitest';
import { schedulesStore, nextOccurrence } from '../lib/settings/schedules';

describe('nextOccurrence', () => {
  // A fixed local reference: what matters is the relationship between `now` and the target time,
  // not the wall-clock values, so the assertions are built from the same Date the helper uses.
  const at = (hour: number, minute: number, base: Date): number => {
    const d = new Date(base);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  it('picks today when the time is still ahead', () => {
    const now = new Date();
    now.setHours(6, 0, 0, 0);
    expect(nextOccurrence(7, 30, now.getTime())).toBe(at(7, 30, now));
  });

  it('rolls to tomorrow when the time already passed today', () => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expect(nextOccurrence(7, 30, now.getTime())).toBe(at(7, 30, expected));
  });

  it('rolls to tomorrow when the time is exactly now — an alarm for "now" would misfire', () => {
    const now = new Date();
    now.setHours(7, 30, 0, 0);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expect(nextOccurrence(7, 30, now.getTime())).toBe(at(7, 30, expected));
  });

  it('clamps out-of-range time parts instead of producing an invalid date', () => {
    const now = new Date();
    now.setHours(1, 0, 0, 0);
    expect(nextOccurrence(99, 99, now.getTime())).toBe(at(23, 59, now));
  });
});

describe('schedulesStore', () => {
  // Cleared through the store's own API: the storage layer keeps an in-memory snapshot, so a raw
  // chrome.storage.local.remove would reset the disk while the cache marched on.
  beforeEach(async () => {
    for (const schedule of await schedulesStore.getAllSchedules()) {
      await schedulesStore.removeSchedule(schedule.id);
    }
  });

  it('adds a schedule enabled by default, with clamped time and increasing ids', async () => {
    const created = await schedulesStore.addSchedule({
      title: '  Morning check ',
      prompt: 'do it',
      hour: 7,
      minute: 30,
    });
    expect(created).toMatchObject({ title: 'Morning check', prompt: 'do it', hour: 7, minute: 30 });
    expect(created.enabled).toBe(true);
    expect(created.lastRunAt).toBeNull();

    const second = await schedulesStore.addSchedule({ title: 'B', prompt: 'x', hour: 30, minute: -5 });
    expect(second.id).toBe(created.id + 1);
    expect(second.hour).toBe(23);
    expect(second.minute).toBe(0);
  });

  it('updates in place and clamps patched times', async () => {
    const { id } = await schedulesStore.addSchedule({ title: 'A', prompt: 'x', hour: 7, minute: 0 });
    await schedulesStore.updateSchedule(id, { enabled: false, minute: 90 });
    const stored = await schedulesStore.getScheduleById(id);
    expect(stored?.enabled).toBe(false);
    expect(stored?.minute).toBe(59);
  });

  it('removes only the targeted schedule', async () => {
    const a = await schedulesStore.addSchedule({ title: 'A', prompt: 'x', hour: 7, minute: 0 });
    const b = await schedulesStore.addSchedule({ title: 'B', prompt: 'y', hour: 8, minute: 0 });
    await schedulesStore.removeSchedule(a.id);
    const remaining = await schedulesStore.getAllSchedules();
    expect(remaining.map(s => s.id)).toEqual([b.id]);
  });

  it('stamps a run without touching the rest', async () => {
    const { id } = await schedulesStore.addSchedule({ title: 'A', prompt: 'x', hour: 7, minute: 0 });
    await schedulesStore.markRun(id, 123456);
    const stored = await schedulesStore.getScheduleById(id);
    expect(stored?.lastRunAt).toBe(123456);
    expect(stored?.enabled).toBe(true);
  });
});
