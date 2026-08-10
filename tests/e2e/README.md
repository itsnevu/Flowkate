# End-to-end tests

These drive the built extension in a real browser. They exist because the parts most likely to break
here cannot fail a type check or a unit test: the approval gates park the agent on a promise, and a
resolver that never fires produces a silent hang rather than an error.

## Setup

Chrome 137 removed `--load-extension`, and as of Chrome 151 the escape-hatch feature flag no longer
works either — a normal Chrome starts with **no extensions at all** and reports no error. These tests
therefore need a **Chrome for Testing** build:

```bash
npx @puppeteer/browsers install chrome@stable
```

That prints a path. Export it, build the extension, then run a test:

```bash
export CHROME_PATH="/path/to/Google Chrome for Testing"
pnpm build
node tests/e2e/plan-gate.e2e.mjs
```

This affects automation only. Installing an unpacked extension by hand through `chrome://extensions`
works normally in regular Chrome.

## How it works

- **`mock-llm.mjs`** — an OpenAI-compatible server returning canned agent output, so runs are
  deterministic and cost nothing. The extension requests structured output with
  `response_format: {type: 'json_schema'}` and names the schema after the calling agent, so the schema
  name is enough to answer the planner and the navigator differently.
- **`browser.mjs`** — launches Chrome for Testing with the extension loaded in a throwaway profile,
  seeds the mock provider directly into extension storage, and opens the side panel. The extension id
  is computed from the load path rather than discovered, which avoids racing the service worker.
- **`plan-gate.e2e.mjs`** — asserts on the **LLM call count**, not the DOM. A card that merely covers
  the screen while the agent keeps working would pass a DOM check and fail this one.

## Still to cover

- Confirmation for sensitive actions (needs a mock run that reaches a risky element)
- Undo
- Memory recall reaching the prompt
- Parallel subtasks
