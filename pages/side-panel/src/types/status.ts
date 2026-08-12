import type { Actors } from '@extension/storage';

/**
 * The single line that says what the agent is doing right now.
 *
 * It is held in panel state and overwritten in place, never appended to the transcript, so a task
 * that takes minutes stays visibly alive without leaving a bubble behind for every action it took.
 */
export interface LiveStatus {
  actor: Actors;
  text: string;
  /** the step the task is on, when the event carried one; 0 for panel-side notices such as replay */
  step?: number;
  /** the step budget, when known; the counter is hidden unless this is above zero */
  maxSteps?: number;
}
