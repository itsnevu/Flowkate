/** One independent piece of research to run in its own tab. */
export interface Subtask {
  /** what to find out, phrased so the answer stands on its own */
  task: string;
  /** where to start looking */
  url: string;
}

export interface SubtaskResult {
  task: string;
  url: string;
  /** what the subtask gathered, or the reason it could not */
  findings: string;
  succeeded: boolean;
}

/**
 * Ceiling on how many subtasks run at once. Each one is a real tab driving a real model, so the cost
 * and the load on the machine scale linearly with this number while the benefit does not.
 */
export const MAX_PARALLEL_SUBTASKS = 3;

/**
 * Step budget per subtask. A subtask that cannot answer within this many steps is not going to, and
 * an unbounded background tab is the failure mode nobody notices until the bill arrives.
 */
export const MAX_SUBTASK_STEPS = 8;

/**
 * Fold subtask results into one block of text the parent agent can reason over.
 *
 * Failures are marked rather than dropped: a subtask that timed out must not read like a finding, or
 * the parent will merge "page timed out" into its answer as though it were data.
 */
export function summarizeSubtaskResults(results: SubtaskResult[]): string {
  return results
    .map((result, index) => {
      const status = result.succeeded ? 'OK' : 'FAILED';
      return `Subtask ${index + 1} [${status}] "${result.task}" (${result.url}):\n${result.findings}`;
    })
    .join('\n\n');
}
