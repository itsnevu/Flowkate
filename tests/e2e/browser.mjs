/**
 * Launching the extension for end-to-end runs.
 *
 * Chrome 137 removed `--load-extension`, and as of Chrome 151 the escape-hatch feature flag no longer
 * works either — a normal Chrome silently starts with no extensions at all. Runs therefore need a
 * Chrome for Testing build, which still honours the switch:
 *
 *     npx @puppeteer/browsers install chrome@stable
 *
 * and then point CHROME_PATH at the binary it prints. This affects automation only; installing an
 * unpacked extension by hand through chrome://extensions works normally.
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
 * Chrome derives an unpacked extension's id from the absolute path it was loaded from, so it can be
 * computed up front instead of racing the service worker target to find out.
 */
export function extensionIdFor(extensionPath) {
  const hash = crypto.createHash('sha256').update(extensionPath).digest('hex').slice(0, 32);
  return [...hash].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/**
 * Launch Chrome for Testing with the built extension loaded, in a throwaway profile.
 *
 * @returns {Promise<{browser: import('puppeteer-core').Browser, extensionId: string, close: () => Promise<void>}>}
 */
export async function launchWithExtension({ distPath = DIST, headless = false } = {}) {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) {
    throw new Error(
      'Set CHROME_PATH to a Chrome for Testing binary. Install one with:\n' +
        '  npx @puppeteer/browsers install chrome@stable',
    );
  }
  if (!fs.existsSync(path.join(distPath, 'manifest.json'))) {
    throw new Error(`No built extension at ${distPath}. Run \`pnpm build\` first.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkite-e2e-'));
  const browser = await launch({
    executablePath,
    headless,
    userDataDir,
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  return {
    browser,
    extensionId: extensionIdFor(distPath),
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
