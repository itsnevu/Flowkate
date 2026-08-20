import { createLogger } from '@src/background/log';
import BrowserContext from '../../browser/context';
import { AgentContext, type AgentOptions, DEFAULT_AGENT_OPTIONS } from '../types';
import MessageManager, { MessageManagerSettings } from '../messages/service';
import { EventManager } from '../event/manager';
import { ActionBuilder } from '../actions/builder';
import { NavigatorAgent, NavigatorActionRegistry } from '../agents/navigator';
import { NavigatorPrompt } from '../prompts/navigator';
import { MAX_PARALLEL_SUBTASKS, MAX_SUBTASK_STEPS, type Subtask, type SubtaskResult } from './subtaskTypes';
import type { TokenUsageTracker } from '../usage';
import type { TaskDataset } from '../dataset';
import type { BrowserContextConfig } from '../../browser/views';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export * from './subtaskTypes';

const logger = createLogger('SubtaskRunner');

export interface SubtaskRunnerOptions {
  navigatorLLM: BaseChatModel;
  agentOptions: Partial<AgentOptions>;
  /**
   * Read lazily rather than captured, so a subtask always starts from the parent's current allow and
   * deny lists — a firewall change between task start and subtask launch must not be missed.
   */
  getBrowserConfig: () => BrowserContextConfig;
  /**
   * The parent task's tracker. Subtasks build their own AgentContext, so without sharing this their
   * spend - potentially several parallel navigators - would be invisible in the headline number.
   */
  usage?: TokenUsageTracker;
  /**
   * The parent task's dataset. Subtasks read pages the parent never visits, so without sharing
   * this any rows they collect would be built up in a context that is thrown away with the tab.
   */
  dataset?: TaskDataset;
}

/**
 * Run one subtask to completion in a tab of its own.
 *
 * Each subtask gets its own BrowserContext, so its idea of "the current page" cannot be moved by a
 * sibling running at the same time — that isolation is what makes running several of these at once
 * safe. The tab is closed and the debugger detached on every path out, including failure.
 */
async function runOne(subtask: Subtask, options: SubtaskRunnerOptions): Promise<SubtaskResult> {
  const browserContext = new BrowserContext(options.getBrowserConfig());
  let tabId: number | null = null;

  try {
    const page = await browserContext.openTab(subtask.url);
    tabId = page.tabId;

    const messageManager = new MessageManager(
      new MessageManagerSettings({
        maxInputTokens: options.agentOptions.maxInputTokens ?? DEFAULT_AGENT_OPTIONS.maxInputTokens,
      }),
    );
    const navigatorPrompt = new NavigatorPrompt(options.agentOptions.maxActionsPerStep ?? 5);
    const context = new AgentContext(`subtask-${tabId}`, browserContext, messageManager, new EventManager(), {
      ...options.agentOptions,
      maxSteps: MAX_SUBTASK_STEPS,
      // A background tab has no way to reach the user, so it must not be able to raise a prompt -
      // the promise would never resolve and the subtask would hang.
      //
      // This override is the ONLY thing preventing that, so do not remove it on the grounds that
      // subtasks run the read-only action set: READ_ONLY_ACTION_NAMES contains go_to_url,
      // search_google and go_back, and none of those are in SILENT_ACTION_NAMES, so `manual` gates
      // all three. It is written after the spread deliberately - `options.agentOptions` is the
      // parent's live options object, which setApprovalMode mutates when the user changes mode
      // mid-task.
      approvalMode: 'auto',
    });
    if (options.usage) context.tokenUsage = options.usage;
    if (options.dataset) context.dataset = options.dataset;

    const actionBuilder = new ActionBuilder(context, options.navigatorLLM);
    const navigator = new NavigatorAgent(new NavigatorActionRegistry(actionBuilder.buildReadOnlyActions()), {
      chatLLM: options.navigatorLLM,
      context,
      prompt: navigatorPrompt,
    });

    messageManager.initTaskMessages(navigatorPrompt.getSystemMessage(), subtask.task);

    for (let step = 0; step < MAX_SUBTASK_STEPS; step++) {
      context.stepInfo = { stepNumber: context.nSteps, maxSteps: MAX_SUBTASK_STEPS };
      const output = await navigator.execute();
      context.nSteps++;

      if (output.error) {
        return { ...subtask, findings: output.error, succeeded: false };
      }
      if (output.result?.done) break;
    }

    // whatever the subtask chose to cache is its answer; without it there is nothing to report back
    const findings = context.actionResults
      .map(result => result.extractedContent)
      .filter(Boolean)
      .join('\n');

    return {
      ...subtask,
      findings: findings || 'No findings were gathered within the step budget.',
      succeeded: Boolean(findings),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Subtask failed: ${subtask.task}: ${message}`);
    return { ...subtask, findings: message, succeeded: false };
  } finally {
    // always detach and close, or a failed subtask leaves an orphaned tab with a debugger attached
    try {
      await browserContext.cleanup();
    } catch (error) {
      logger.error(`Failed to clean up subtask browser context: ${error}`);
    }
    if (tabId !== null) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (error) {
        logger.error(`Failed to close subtask tab ${tabId}: ${error}`);
      }
    }
  }
}

/**
 * Run several independent subtasks at once, each in its own tab, and return every result.
 *
 * Subtasks must be genuinely independent: they run concurrently and cannot see each other, so one
 * that depends on another's answer will simply fail. Results come back in the order requested, and a
 * subtask that fails reports why rather than taking the others down with it.
 */
export async function runSubtasksInParallel(
  subtasks: Subtask[],
  options: SubtaskRunnerOptions,
): Promise<SubtaskResult[]> {
  const capped = subtasks.slice(0, MAX_PARALLEL_SUBTASKS);
  if (capped.length < subtasks.length) {
    logger.warning(`Only running the first ${MAX_PARALLEL_SUBTASKS} of ${subtasks.length} requested subtasks`);
  }

  logger.info(`Running ${capped.length} subtask(s) in parallel`);
  return Promise.all(capped.map(subtask => runOne(subtask, options)));
}
