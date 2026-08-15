import { schedulesStore, nextOccurrence } from '@extension/storage';
import { createLogger } from '../log';

const logger = createLogger('scheduler');

/** Alarm-name prefix for scheduled tasks; the numeric schedule id rides after it. */
export const SCHEDULE_ALARM_PREFIX = 'flowkite-schedule-';

/** The schedule id an alarm name carries, or null for alarms that are not ours. */
export function scheduleIdFromAlarmName(name: string): number | null {
  if (!name.startsWith(SCHEDULE_ALARM_PREFIX)) return null;
  const id = Number.parseInt(name.slice(SCHEDULE_ALARM_PREFIX.length), 10);
  return Number.isFinite(id) ? id : null;
}

/**
 * Make chrome.alarms agree with the schedule store: one daily alarm per enabled schedule, none
 * for anything else. Rebuilt from scratch rather than diffed — a handful of alarms is not worth
 * a reconciliation algorithm, and rebuild is self-healing after any missed edit.
 */
export async function syncScheduleAlarms(): Promise<void> {
  const existing = await chrome.alarms.getAll();
  await Promise.all(
    existing
      .filter(alarm => alarm.name.startsWith(SCHEDULE_ALARM_PREFIX))
      .map(alarm => chrome.alarms.clear(alarm.name)),
  );

  const schedules = await schedulesStore.getAllSchedules();
  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    chrome.alarms.create(`${SCHEDULE_ALARM_PREFIX}${schedule.id}`, {
      when: nextOccurrence(schedule.hour, schedule.minute, Date.now()),
      periodInMinutes: 24 * 60,
    });
  }
  logger.debug(`schedule alarms synced (${schedules.filter(s => s.enabled).length} active)`);
}
