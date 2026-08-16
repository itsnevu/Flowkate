/**
 * End-to-end check that the plan-approval gate really gates.
 *
 * The assertion that matters is the LLM call count, not the UI. While the gate is open the navigator
 * must never be invoked at all — a card that merely covers the screen while the agent keeps working
 * would pass a DOM check and fail this one.
 *
 * Run with: pnpm build && CHROME_PATH=... node tests/e2e/plan-gate.e2e.mjs
 */
import { startMockLLM } from './mock-llm.mjs';
import { launchWithExtension, seedMockProvider, openSidePanel, waitForPanelText, clickButton } from './browser.mjs';

const TASK = 'Open example.com and tell me the first heading';
const results = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${actual}, want ${expected})`}`);
}

/** Drive one run up to the gate, then answer it with `decision`. */
async function runToGate(decision) {
  const mock = await startMockLLM();
  const { browser, extensionId, close } = await launchWithExtension();
  try {
    await seedMockProvider(browser, extensionId);
    const panel = await openSidePanel(browser, extensionId);

    await (await panel.$('textarea')).type(TASK);
    await panel.keyboard.press('Enter');

    const gateShown = await waitForPanelText(panel, 'Review the plan before it runs');
    const callsAtGate = mock.callCount();

    await clickButton(panel, decision);
    await new Promise(resolve => setTimeout(resolve, 9000));

    return {
      gateShown,
      callsAtGate,
      callsAfter: mock.callCount(),
      panelText: await panel.evaluate(() => document.body.innerText),
      // A parked task leaves the composer disabled, so this is the state that says the run
      // really ended rather than merely printing that it did.
      composerUsable: await panel.evaluate(() => {
        const box = document.querySelector('textarea');
        return !!box && !box.disabled;
      }),
    };
  } finally {
    await close();
    await mock.close();
  }
}

const approved = await runToGate('Approve & run');
check('gate appears before anything runs', approved.gateShown, true);
// one planner call and nothing more: the navigator never got to act
check('navigator is not invoked while gated', approved.callsAtGate, 1);
check('approving lets the agent continue', approved.callsAfter > approved.callsAtGate, true);

const rejected = await runToGate('Reject');
check('rejecting invokes nothing further', rejected.callsAfter, rejected.callsAtGate);
check('rejecting reports the task stopped', rejected.panelText.includes('Plan rejected, task stopped'), true);
// A gate that neither proceeds nor cancels would leave the agent parked forever. This used to
// look for a second "Task cancelled" message, which the one-task-one-answer consolidation
// folded into the line above; the composer coming back is the durable signal.
check('rejecting does not hang the task', rejected.composerUsable, true);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
