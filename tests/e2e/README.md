# End-to-end tests

These drive the built extension in a real browser. They exist because the parts most likely to break
here cannot fail a type check or a unit test: the approval gates park the agent on a promise, and a
resolver that never fires produces a silent hang rather than an error.

## Setup

Build the extension, then run a test:

```bash
pnpm build
pnpm e2e
```

Your ordinary Chrome is enough. On macOS it is found automatically; anywhere else, point
`CHROME_PATH` at the binary.

Chrome 137 removed `--load-extension` for automated sessions and Chrome 151 dropped the escape-hatch
feature flag with it, so a run built on that switch starts with **no extension at all** and fails
every `chrome-extension://` navigation with `ERR_BLOCKED_BY_CLIENT`. The harness uses puppeteer's
`browser.installExtension()` instead, which is the supported path and needs no special Chrome build.

Runs are headful, and not by preference: an MV3 service worker never starts in headless Chrome, and
the background is the thing under test.

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
