/**
 * Launching the extension for end-to-end runs.
 *
 * Chrome 137 removed `--load-extension` for automated sessions and Chrome 151 dropped the
 * escape-hatch feature flag too, so a run built on that switch starts with no extension loaded at
 * all: every navigation to a chrome-extension:// URL then fails with ERR_BLOCKED_BY_CLIENT, which
 * is what this harness used to do against any current Chrome.
 *
 * `browser.installExtension()` is the supported replacement. It works on an ordinary Chrome, so
 * CHROME_PATH can point at the one already installed, and it returns the id rather than leaving it
 * to be derived from the path.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIST = path.resolve(HERE, '..', '..', 'dist');

/**
 * Chrome derives an unpacked extension's id from the absolute path it was loaded from.
 *
 * Kept for the id's stability across runs, which is what makes a seeded profile reusable; the
 * launch itself no longer has to rely on it, since installExtension() reports the real one.
 */
export function extensionIdFor(extensionPath) {
  const hash = crypto.createHash('sha256').update(extensionPath).digest('hex').slice(0, 32);
  return [...hash].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/** Where Chrome lives on a stock macOS install, so CHROME_PATH is optional there. */
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Launch Chrome with the built extension installed, in a throwaway profile.
 *
 * Headful on purpose: an MV3 service worker does not start in headless Chrome, and the whole
 * point of these runs is to exercise the background.
 *
 * @returns {Promise<{browser: import('puppeteer-core').Browser, extensionId: string, close: () => Promise<void>}>}
 */
export async function launchWithExtension({ distPath = DIST, headless = false } = {}) {
  const executablePath = process.env.CHROME_PATH || (fs.existsSync(DEFAULT_CHROME) ? DEFAULT_CHROME : undefined);
  if (!executablePath) {
    throw new Error('Set CHROME_PATH to a Chrome binary.');
  }
  if (!fs.existsSync(path.join(distPath, 'manifest.json'))) {
    throw new Error(`No built extension at ${distPath}. Run \`pnpm build\` first.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkite-e2e-'));
  const browser = await launch({
    executablePath,
    headless,
    userDataDir,
    // Required before installExtension() may be called; without it the call throws rather than
    // quietly doing nothing.
    enableExtensions: true,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const extensionId = await browser.installExtension(distPath);

  return {
    browser,
    extensionId,
    close: async () => {
      await browser.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/** Point the extension at the mock provider by writing straight into its storage. */
export async function seedMockProvider(browser, extensionId, port = 8787) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/index.html`, { waitUntil: 'networkidle2' });
  await page.evaluate(async baseUrl => {
    const model = { provider: 'mock', modelName: 'mock-model', parameters: { temperature: 0.1, topP: 0.1 } };
    await chrome.storage.local.set({
      'llm-api-keys': {
        providers: {
          mock: {
            name: 'Mock',
            type: 'custom_openai',
            apiKey: 'test-key',
            baseUrl,
            modelNames: ['mock-model'],
            createdAt: 1,
          },
        },
      },
      'agent-models': { agents: { planner: model, navigator: model } },
    });
  }, `http://127.0.0.1:${port}`);
  return page;
}

/** Open the side panel. It is an ordinary extension page, so it can be driven as a tab. */
export async function openSidePanel(browser, extensionId) {
  const page = await browser.newPage();
  await page.setViewport({ width: 460, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/side-panel/index.html`, { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 1200));
  return page;
}

/** Poll the panel until `text` appears, or give up. */
export async function waitForPanelText(page, text, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if ((await page.evaluate(() => document.body.innerText)).includes(text)) return true;
  }
  return false;
}

/** Click the first button whose label contains `text`. */
export function clickButton(page, text) {
  return page.evaluate(label => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(label));
    if (!button) return false;
    button.click();
    return true;
  }, text);
}
