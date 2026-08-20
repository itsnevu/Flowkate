import { HumanMessage, type SystemMessage } from '@langchain/core/messages';
import { createLogger } from '@src/background/log';
import { wrapUntrustedContent } from '../messages/utils';
import type { AgentContext } from '@src/background/agent/types';

const logger = createLogger('BasePrompt');
/**
 * Abstract base class for all prompt types
 */
abstract class BasePrompt {
  /**
   * Returns the system message that defines the AI's role and behavior
   * @returns SystemMessage from LangChain
   */
  abstract getSystemMessage(): SystemMessage;

  /**
   * Returns the user message for the specific prompt type
   * @param context - Optional context data needed for generating the user message
   * @returns HumanMessage from LangChain
   */
  abstract getUserMessage(context: AgentContext): Promise<HumanMessage>;

  /**
   * Builds the user message containing the browser state
   * @param context - The agent context
   * @returns HumanMessage from LangChain
   */
  async buildBrowserStateUserMessage(context: AgentContext): Promise<HumanMessage> {
    // Failure-triggered vision escalation: after a failed step, the next read attaches a numbered
    // screenshot even with vision off. A step usually fails because the DOM text under-describes
    // the page (canvas widgets, mis-grounded indices), and retrying on the same blind description
    // just burns the failure budget; one screenshot per retry, bounded by maxFailures, is the
    // cheapest way out of that loop. Full-blind pages (domGroundingFailed) already do this.
    const escalateVision = context.consecutiveFailures > 0;
    const stepVision = context.options.useVision || escalateVision;
    const browserState = await context.browserContext.getState(stepVision);
    // This is the parse the model's element indices are numbered against; actions resolve them here
    // rather than re-reading the DOM, which would renumber the page under the model's feet.
    context.stepState = browserState;
    const rawElementsText = browserState.elementTree.clickableElementsToString(context.options.includeAttributes);

    let formattedElementsText = '';
    if (rawElementsText !== '') {
      // Measured on whatever actually scrolls this page, which on an app-shell layout is an inner
      // pane rather than the window - hence the neutral field names. The remaining distance is
      // stated outright instead of as a ratio: the ratio's denominator is zero on a page that does
      // not scroll at all, and the model was being handed the string "Infinity%".
      const scrollable = Math.max(0, browserState.scrollHeight - browserState.visualViewportHeight);
      const remaining = Math.max(0, scrollable - browserState.scrollY);
      const scrollInfo = `[Scroll info of current page] scrolled: ${browserState.scrollY}px of ${scrollable}px, remaining below: ${remaining}px, viewport height: ${browserState.visualViewportHeight}px${scrollable === 0 ? ' (this page does not scroll)' : ''}\n`;
      logger.info(scrollInfo);
      const elementsText = wrapUntrustedContent(rawElementsText);
      formattedElementsText = `${scrollInfo}[Start of page]\n${elementsText}\n[End of page]\n`;
    } else if (browserState.domGroundingFailed && browserState.screenshot) {
      // Saying "empty page" here would be a lie the model acts on: it would conclude the task is
      // impossible and give up, when in fact the page is rendered and simply not readable via the DOM.
      formattedElementsText =
        'No interactive elements could be read from the DOM of this page, even after waiting for it to ' +
        'finish rendering. This usually means the page draws its UI in a way the DOM does not describe. ' +
        'A screenshot of the page is attached below - use it to decide what to do, and prefer keyboard ' +
        'navigation, scrolling or going back over clicking an element index you cannot see.';
    } else {
      formattedElementsText = 'empty page';
    }

    // Written into the state text so the model knows why it suddenly has eyes, and that the
    // numbered boxes in the screenshot map onto the element indices above.
    if (escalateVision && !context.options.useVision && browserState.screenshot && !browserState.domGroundingFailed) {
      formattedElementsText +=
        '\nNote: the previous step failed, so a screenshot with numbered element boxes is attached - ' +
        'use it to re-ground your element indices before retrying.';
    }

    let stepInfoDescription = '';
    if (context.stepInfo) {
      stepInfoDescription = `Current step: ${context.stepInfo.stepNumber + 1}/${context.stepInfo.maxSteps}`;
    }

    const timeStr = new Date().toISOString().slice(0, 16).replace('T', ' '); // Format: YYYY-MM-DD HH:mm
    stepInfoDescription += `Current date and time: ${timeStr}`;

    let actionResultsDescription = '';
    if (context.actionResults.length > 0) {
      for (let i = 0; i < context.actionResults.length; i++) {
        const result = context.actionResults[i];
        if (result.extractedContent) {
          actionResultsDescription += `\nAction result ${i + 1}/${context.actionResults.length}: ${result.extractedContent}`;
        }
        if (result.error) {
          // only use last line of error
          const error = result.error.split('\n').pop();
          actionResultsDescription += `\nAction error ${i + 1}/${context.actionResults.length}: ...${error}`;
        }
      }
    }

    const currentTab = `{id: ${browserState.tabId}, url: ${browserState.url}, title: ${browserState.title}}`;
    const otherTabs = browserState.tabs
      .filter(tab => tab.id !== browserState.tabId)
      .map(tab => `- {id: ${tab.id}, url: ${tab.url}, title: ${tab.title}}`);
    const stateDescription = `
[Task history memory ends]
[Current state starts here]
The following is one-time information - if you need to remember it write it to memory:
Current tab: ${currentTab}
Other available tabs:
  ${otherTabs.join('\n')}
Interactive elements from top layer of the current page inside the viewport:
${formattedElementsText}
${stepInfoDescription}
${actionResultsDescription}
`;

    // Attach the screenshot when vision is on for this step (setting or failure escalation), and
    // when DOM grounding failed - in that case it is the only description of the page the model has.
    if (browserState.screenshot && (stepVision || browserState.domGroundingFailed)) {
      return new HumanMessage({
        content: [
          { type: 'text', text: stateDescription },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${browserState.screenshot}` },
          },
        ],
      });
    }

    return new HumanMessage(stateDescription);
  }
}

export { BasePrompt };
