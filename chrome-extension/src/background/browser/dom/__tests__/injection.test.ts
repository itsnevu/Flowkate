import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getClickableElements, injectBuildDomTreeScripts } from '../service';
import { PageNotInjectableError } from '../../views';

/**
 * Cover for the injection step every DOM read depends on.
 *
 * Chrome will not run extension scripts in its own error pages, and a tab sitting on one still
 * reports the http(s) URL that failed - so an unreadable page is indistinguishable from a readable
 * one until the injection is attempted. That makes the return value of injectBuildDomTreeScripts
 * the only place the difference is knowable, and the reason it is a boolean rather than void: a
 * version that swallows the refusal sends the parse on to fail somewhere further downstream, where
 * the cause no longer travels with it.
 *
 * The other property here is that main-frame and sub-frame failures are not the same failure. The
 * tree is built from the main frame; sub-frames only fill in what it could not reach. An ad iframe
 * that will not take the script has to stay a non-event.
 */

interface ScriptCall {
  target: { tabId: number; allFrames?: boolean; frameIds?: number[] };
  files?: string[];
  func?: unknown;
  args?: unknown[];
}

type FrameProbe = { frameId: number; result: boolean };

const isProbe = (call: ScriptCall) => call.target.allFrames === true;
const isInjection = (call: ScriptCall) => call.files?.[0] === 'buildDomTree.js';
const injectionTargets = (calls: ScriptCall[]) => calls.filter(isInjection).map(call => call.target);

function stubScripting(handler: (call: ScriptCall) => unknown) {
  const calls: ScriptCall[] = [];
  const executeScript = vi.fn(async (call: ScriptCall) => {
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('chrome', { scripting: { executeScript } });
  return { calls, executeScript };
}

/** A tab whose frames answer the probe as described, and accept the script everywhere. */
function healthyTab(frames: FrameProbe[]) {
  return (call: ScriptCall) => (isProbe(call) ? frames : []);
}

describe('injectBuildDomTreeScripts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports failure when Chrome refuses the tab outright', async () => {
    stubScripting(() => {
      throw new Error('Frame with ID 0 is showing error page');
    });

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(false);
  });

  it('falls back to the main frame when the frame probe is refused', async () => {
    const { calls } = stubScripting(call => {
      if (isProbe(call)) throw new Error('Frame with ID 0 is showing error page');
      return [];
    });

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(true);
    expect(injectionTargets(calls)).toEqual([{ tabId: 1 }]);
  });

  it('injects nothing when every frame already has the script', async () => {
    const { calls } = stubScripting(
      healthyTab([
        { frameId: 0, result: true },
        { frameId: 3, result: true },
      ]),
    );

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(true);
    expect(injectionTargets(calls)).toEqual([]);
  });

  it('injects only the frames that are missing the script', async () => {
    const { calls } = stubScripting(
      healthyTab([
        { frameId: 0, result: true },
        { frameId: 3, result: false },
        { frameId: 4, result: false },
      ]),
    );

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(true);
    expect(injectionTargets(calls)).toEqual([{ tabId: 1, frameIds: [3, 4] }]);
  });

  it('injects the main frame separately from the sub-frames', async () => {
    const { calls } = stubScripting(
      healthyTab([
        { frameId: 0, result: false },
        { frameId: 3, result: false },
      ]),
    );

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(true);
    // Batched into one call, the sub-frame's refusal below would sink the main frame with it.
    expect(injectionTargets(calls)).toEqual([{ tabId: 1 }, { tabId: 1, frameIds: [3] }]);
  });

  it('survives a sub-frame that will not take the script', async () => {
    stubScripting(call => {
      if (isProbe(call)) {
        return [
          { frameId: 0, result: true },
          { frameId: 3, result: false },
        ];
      }
      if (call.target.frameIds) throw new Error('Frame with ID 3 was removed');
      return [];
    });

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(true);
  });

  it('reports failure when the main frame is the frame that refuses', async () => {
    const { calls } = stubScripting(call => {
      if (isProbe(call)) {
        return [
          { frameId: 0, result: false },
          { frameId: 3, result: false },
        ];
      }
      if (!call.target.frameIds) throw new Error('Frame with ID 0 is showing error page');
      return [];
    });

    await expect(injectBuildDomTreeScripts(1)).resolves.toBe(false);
    // No point injecting sub-frames of a page whose tree can never be built.
    expect(injectionTargets(calls)).toEqual([{ tabId: 1 }]);
  });
});

describe('getClickableElements on a page Chrome will not script', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names the reason instead of failing on the parse that follows', async () => {
    const { calls } = stubScripting(() => {
      throw new Error('Frame with ID 0 is showing error page');
    });

    await expect(getClickableElements(1, 'https://example.com/missing')).rejects.toBeInstanceOf(PageNotInjectableError);
    // buildDomTree is the only call that carries args; it must never have been attempted.
    expect(calls.some(call => call.args !== undefined)).toBe(false);
  });
});
