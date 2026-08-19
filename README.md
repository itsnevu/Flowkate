<h1 align="center">Flowkite</h1>

<p align="center">
  A free AI browser agent that runs entirely in your browser — and asks before it does anything that matters.
</p>

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/itsnevu/Flowkite)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](LICENSE)

</div>

> **Status:** Flowkite is not on the Chrome Web Store yet. Install it from a [release](https://github.com/itsnevu/Flowkite/releases) or [build it from source](#build-from-source).

---

## What it is

You type a task in plain language — *"find the cheapest flight to Tokyo next month"* — and Flowkite carries it out in your browser. A **Planner** agent works out the approach, a **Navigator** agent clicks, types and scrolls, and you watch the whole thing happen in a side panel.

Everything runs locally. You bring your own LLM API key, and page data goes straight from your browser to the provider you chose. There is no Flowkite server, no Flowkite account, and nothing to sign up for.

## Why another browser agent

Most browser agents ask you to trust them with your logged-in browser session and then act. Flowkite is built the other way round: **the interesting parts are the places it stops.**

### It asks before it acts

- **Plan preview** — before touching a page, the agent shows you its plan and waits. Approve it or reject it. Only the first plan of each task is gated, so re-planning doesn't nag you.
- **Sensitive actions need a yes** — buying, deleting, submitting a form, downloading a file or typing into a password field all stop and ask. The check reads the **actual DOM element the agent picked** — its label, `type`, `aria-label` — not the model's description of what it thinks it's doing. That distinction matters: a page that manages to talk the model into clicking "Buy now" still has to get past you.
- **Undo** — roll back the last step. The page navigates back *and* the agent forgets the step, so it re-plans from the restored state instead of building on something you rejected.

### It remembers, on your machine only

The agent can remember preferences you tell it, so they carry across sessions. Memories live in `chrome.storage.local` — never uploaded, never synced. **Options → Memory** lists every stored fact with a delete button next to each one, and a switch to turn the whole thing off.

### It handles pages that fight back

- An empty DOM parse is ambiguous: it means either *"nothing here"* or *"React hasn't mounted yet"*. Flowkite retries on escalating delays before concluding a page is empty, and if the DOM still yields nothing it attaches a **screenshot** automatically — even with vision off — rather than telling the model the page is blank and watching it give up.
- Cross-origin iframes are read too, so embedded checkout and login widgets aren't invisible.
- If a page re-renders between reading the element list and clicking, the action is retried once against fresh state.

### It doesn't waste your tokens

Configure an optional cheap **Fast** model and routine steps go to it. Anything that isn't routine — a failure to recover from, a dense page, a step reasoning over a screenshot, the first step of a new plan — escalates to your main model. The bias is deliberately toward the good model: a wrong cheap step costs a retry *and* a wrong page state, which is worse than the tokens it saved.

### It can research in parallel

Independent lookups — the same product across three shops — run concurrently, each in its own tab, then merge. Those background tabs are **read-only by construction**: they physically cannot click, type or submit, because the action registry they are given does not contain those actions. A background tab is the one place you could not intervene, so it is not allowed to act.

## Browser support

| Browser | Status |
| --- | --- |
| Chrome | Fully supported |
| Edge | Fully supported |
| Firefox, Safari | Not supported |
| Other Chromium browsers (Opera, Arc, Brave…) | May work, not tested |

## Install

### From a release

1. Download `flowkite-<version>.zip` from the [releases page](https://github.com/itsnevu/Flowkite/releases) and unzip it.
2. Open `chrome://extensions/`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

To upgrade, download the new zip, replace the folder, then hit refresh on the Flowkite card in `chrome://extensions/`.

### Build from source

**pnpm is required** — this is a pnpm workspace and 38 of its dependencies use the `workspace:*` protocol, which npm cannot resolve.

```bash
# Node.js >= 22.12.0 and pnpm >= 9.15.1
git clone https://github.com/itsnevu/Flowkite.git
cd Flowkite
pnpm install
pnpm build          # output lands in dist/
```

Then load `dist/` as an unpacked extension, as above.

```bash
pnpm dev            # development build with hot reload
pnpm test           # run every workspace's test suite
pnpm type-check     # typecheck every workspace
pnpm zip            # build and package into a distributable zip
```

## Set up your models

Open the side panel — the toolbar icon, or **Alt+Shift+F** — then pick a provider, paste your key and press **Save and start**. The key is checked with the provider before anything is stored, so a typo is caught there instead of halfway through your first task. Choose **Ollama** and there is no key at all, only the address it listens on.

That is the whole setup. Saving your first provider points the Planner and Navigator at its flagship model, and the Fast agent at its cheap tier when the provider has one. **Options → Models** is where you change any of that, add more providers, or tune sampling per role — and it never overrides a model you picked yourself.

| Role | What it does | Required |
| --- | --- | --- |
| **Planner** | Works out the approach and decides when the task is done | Yes |
| **Navigator** | Reads the page and performs the actions | Yes |
| **Fast** | Handles routine navigation steps to cut cost | Optional |

### Suggested configurations

**Best results**

- Planner: Claude Sonnet 4.5 — stronger reasoning and recovery
- Navigator: Claude Haiku 4.5 — good balance for navigation
- Fast: Gemini 2.5 Flash or GPT-5 mini

**Cheapest that still works**

- Planner: Claude Haiku 4.5 or GPT-5 mini
- Navigator: Gemini 2.5 Flash or GPT-4.1 mini
- Fast: same as Navigator

Expect more iterations on complex tasks with the cheaper setup.

**Fully local** — run Ollama or any OpenAI-compatible endpoint. Zero API cost, nothing leaves your machine. Try Qwen3-30B-A3B-Instruct, Falcon3 10B, Qwen 2.5 Coder 14B or Mistral Small 24B. Local models need more specific prompts: break tasks into explicit steps and avoid high-level, ambiguous instructions.

Supported providers: OpenAI, Anthropic, Gemini, DeepSeek, Grok, Groq, Cerebras, Llama, Azure OpenAI, OpenRouter, Ollama, and any OpenAI-compatible endpoint.

## Keeping it on a leash

**Options → Firewall** takes an allow list and a deny list, enforced before every navigation — including inside parallel subtasks. If there is a site you never want an agent on, put it in the deny list.

**Approval mode** is picked in the composer, per task, and there are three of them:

| Mode | What it gates |
| --- | --- |
| **Planner** (default) | The first plan of a task, plus every sensitive action |
| **Manual** | Every action that touches a page, navigation included |
| **Auto** | Nothing at all, including before money and credentials |

Switching to Auto takes an acknowledgement that spells out what it turns off — it is your call to make, but not one to make by accident. The mode in force is shown in **Options → General**.

It also holds the knobs that decide how hard the agent works before it gives up:

| Setting | Default | What it does |
| --- | --- | --- |
| Max Input Tokens | 128000 | Ceiling on the prompt the agent may build. Keep it under your model's context window — Ollama in particular is pinned to a 64k window. Once the history passes this, the oldest exchanges are dropped before anything is sent. |
| Pause Between Actions | 0 | Extra fixed wait after each action within a step. The agent already waits for the page to settle on its own; raise this only for pages that keep re-rendering after they finish loading. |
| Retry Backoff Cap | 10s | Longest the agent will wait before trying a failed model call again. A rate limit or a dropped connection is retried up to twice with an exponential, jittered backoff; anything the provider says is wrong with the request itself is not retried at all. |

## What a task costs

The side panel shows a **Tokens** strip above the input once a task starts, and expands to a per-model breakdown. The numbers come from the providers themselves, not from an estimate — a call whose provider reported nothing is counted separately and marks the total as a floor (`≥`). Totals are saved with the session, so reopening it from history still shows what it cost.

There are deliberately no prices. This extension talks to OpenRouter's open catalogue, Azure deployments you named yourself, arbitrary OpenAI-compatible endpoints and locally-free Ollama, so any built-in price table would be wrong for some of them and stale for the rest. Check your provider's dashboard for the bill.

## Privacy

No backend, no account, and no telemetry you cannot turn off. Your API keys, history, settings and memories are stored locally and disappear when you uninstall.

Page structure and — when vision is on — screenshots go to the LLM provider **you** configured, using **your** key. Once data reaches your provider, their policy governs it. Full detail in [PRIVACY.md](PRIVACY.md); permission-by-permission justification in [PERMISSIONS.md](PERMISSIONS.md).

Page content is treated as untrusted input and wrapped in explicit delimiters before reaching the model, so text on a page cannot pose as an instruction to the agent.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please run `pnpm type-check && pnpm test` before opening a PR. Security issues: see [SECURITY.md](SECURITY.md).

Questions and ideas belong in [Discussions](https://github.com/itsnevu/Flowkite/discussions).

## Credits

Flowkite stands on:

- [Browser Use](https://github.com/browser-use/browser-use)
- [Agent-E](https://github.com/EmergenceAI/Agent-E)
- [Chrome Extension Boilerplate](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
- [LangChain.js](https://github.com/langchain-ai/langchainjs)

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Other languages

These translations predate this README and describe an older feature set: [Español](README-es.md) · [Türkçe](README-tr.md) · [繁體中文](README-zh-Hant.md)
