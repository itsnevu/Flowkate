<h1 align="center">Flowkate</h1>

<p align="center">
  An open-source AI browser agent that runs entirely in your browser — and asks before it does anything that matters.
</p>

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/itsnevu/Flowkate)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](LICENSE)

</div>

> **Status:** Flowkate is not on the Chrome Web Store yet. Install it from a [release](https://github.com/itsnevu/Flowkate/releases) or [build it from source](#build-from-source).

---

## What it is

You type a task in plain language — *"find the cheapest flight to Tokyo next month"* — and Flowkate carries it out in your browser. A **Planner** agent works out the approach, a **Navigator** agent clicks, types and scrolls, and you watch the whole thing happen in a side panel.

Everything runs locally. You bring your own LLM API key, and page data goes straight from your browser to the provider you chose. There is no Flowkate server, no Flowkate account, and nothing to sign up for.

## Why another browser agent

Most browser agents ask you to trust them with your logged-in browser session and then act. Flowkate is built the other way round: **the interesting parts are the places it stops.**

### It asks before it acts

- **Plan preview** — before touching a page, the agent shows you its plan and waits. Approve it or reject it. Only the first plan of each task is gated, so re-planning doesn't nag you.
- **Sensitive actions need a yes** — buying, deleting, submitting a form, downloading a file or typing into a password field all stop and ask. The check reads the **actual DOM element the agent picked** — its label, `type`, `aria-label` — not the model's description of what it thinks it's doing. That distinction matters: a page that manages to talk the model into clicking "Buy now" still has to get past you.
- **Undo** — roll back the last step. The page navigates back *and* the agent forgets the step, so it re-plans from the restored state instead of building on something you rejected.

### It remembers, on your machine only

The agent can remember preferences you tell it, so they carry across sessions. Memories live in `chrome.storage.local` — never uploaded, never synced. **Options → Memory** lists every stored fact with a delete button next to each one, and a switch to turn the whole thing off.

### It handles pages that fight back

- An empty DOM parse is ambiguous: it means either *"nothing here"* or *"React hasn't mounted yet"*. Flowkate retries on escalating delays before concluding a page is empty, and if the DOM still yields nothing it attaches a **screenshot** automatically — even with vision off — rather than telling the model the page is blank and watching it give up.
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

1. Download `flowkate.zip` from the [releases page](https://github.com/itsnevu/Flowkate/releases) and unzip it.
2. Open `chrome://extensions/`, turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

To upgrade, download the new zip, replace the folder, then hit refresh on the Flowkate card in `chrome://extensions/`.

### Build from source

**pnpm is required** — this is a pnpm workspace and 38 of its dependencies use the `workspace:*` protocol, which npm cannot resolve.

```bash
# Node.js >= 22.12.0 and pnpm >= 9.15.1
git clone https://github.com/itsnevu/Flowkate.git
cd Flowkate
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

Open the side panel, click the settings icon, add your API keys, then assign a model to each role.

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

- Planner: Claude Haiku 4.5 or GPT-4o
- Navigator: Gemini 2.5 Flash or GPT-4o-mini
- Fast: same as Navigator

Expect more iterations on complex tasks with the cheaper setup.

**Fully local** — run Ollama or any OpenAI-compatible endpoint. Zero API cost, nothing leaves your machine. Try Qwen3-30B-A3B-Instruct, Falcon3 10B, Qwen 2.5 Coder 14B or Mistral Small 24B. Local models need more specific prompts: break tasks into explicit steps and avoid high-level, ambiguous instructions.

Supported providers: OpenAI, Anthropic, Gemini, DeepSeek, Grok, Groq, Cerebras, Llama, Azure OpenAI, OpenRouter, Ollama, and any OpenAI-compatible endpoint.

## Keeping it on a leash

**Options → Firewall** takes an allow list and a deny list, enforced before every navigation — including inside parallel subtasks. If there is a site you never want an agent on, put it in the deny list.

**Options → General** holds the two safety switches (plan approval, sensitive-action confirmation). Both default to on. Turning them off is your call to make, but that is what they are protecting you from.

## Privacy

No backend, no account, and no telemetry you cannot turn off. Your API keys, history, settings and memories are stored locally and disappear when you uninstall.

Page structure and — when vision is on — screenshots go to the LLM provider **you** configured, using **your** key. Once data reaches your provider, their policy governs it. Full detail in [PRIVACY.md](PRIVACY.md); permission-by-permission justification in [PERMISSIONS.md](PERMISSIONS.md).

Page content is treated as untrusted input and wrapped in explicit delimiters before reaching the model, so text on a page cannot pose as an instruction to the agent.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please run `pnpm type-check && pnpm test` before opening a PR. Security issues: see [SECURITY.md](SECURITY.md).

Questions and ideas belong in [Discussions](https://github.com/itsnevu/Flowkate/discussions).

## Credits

Flowkate is a fork of [Nanobrowser](https://github.com/nanobrowser/nanobrowser) by alexchenzl and contributors, licensed under Apache-2.0. The multi-agent architecture and browser automation layer come from that project; this fork adds the human-in-the-loop controls, on-device memory, grounding retries, hybrid model routing and parallel research described above.

It also stands on:

- [Browser Use](https://github.com/browser-use/browser-use)
- [Agent-E](https://github.com/EmergenceAI/Agent-E)
- [Chrome Extension Boilerplate](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
- [LangChain.js](https://github.com/langchain-ai/langchainjs)

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Other languages

These translations predate this README and describe an older feature set: [Español](README-es.md) · [Türkçe](README-tr.md) · [繁體中文](README-zh-Hant.md)
