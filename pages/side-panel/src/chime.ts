import { generalSettingsStore } from '@extension/storage';

/**
 * A short two-note chime for the end of a task.
 *
 * Synthesised with Web Audio rather than shipped as an audio file: two oscillators cost nothing in
 * bundle size, need no `web_accessible_resources` entry, and dodge the packaging question of which
 * codec every supported browser decodes. It has to live in the panel, not the background worker -
 * an MV3 service worker has no `AudioContext` and no document to borrow one from.
 */

/** Rising for success, falling for anything that did not finish the job. */
const TONES: Record<TaskChime, [number, number]> = {
  ok: [660, 880],
  fail: [440, 330],
};

const NOTE_SECONDS = 0.12;
/** Well under the system alert volume - this fires unattended, possibly while music is playing. */
const PEAK_GAIN = 0.08;

export type TaskChime = 'ok' | 'fail';

/**
 * Reused across tasks. Browsers cap how many AudioContexts a document may hold, and a panel that
 * runs task after task would otherwise leak one per completion.
 */
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

/** One sine note, enveloped at both ends so it does not click on start or stop. */
function playNote(context: AudioContext, frequency: number, startAt: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + NOTE_SECONDS);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + NOTE_SECONDS);
}

/**
 * Play the end-of-task chime, unless the user has turned it off.
 *
 * Never throws and never rejects: a missing audio device or a context the browser refuses to
 * resume is not a reason to disturb the panel, which is in the middle of rendering the result the
 * user actually came for.
 */
export async function playTaskChime(outcome: TaskChime): Promise<void> {
  try {
    const { soundOnComplete } = await generalSettingsStore.getSettings();
    if (!soundOnComplete) {
      return;
    }

    const context = getContext();
    if (!context) {
      return;
    }
    // Chrome starts the context suspended until the document has been interacted with. Sending a
    // task counts, but a panel restored mid-task may not have been touched yet.
    if (context.state === 'suspended') {
      await context.resume();
    }

    const [first, second] = TONES[outcome];
    playNote(context, first, context.currentTime);
    playNote(context, second, context.currentTime + NOTE_SECONDS);
  } catch {
    // Deliberately silent - this is an ornament on top of the real notification.
  }
}
