# Privacy Policy for Flowkite

## Introduction

[Flowkite](https://chromewebstore.google.com/detail/flowkite-ai-web-agent-aut/kacmblccfhnfcjfpeageldmmbkocafab) is a free AI web automation Chrome extension. This Privacy Policy explains how your data is handled.

## Licence

Flowkite is free to download and licensed under Apache License 2.0. The build on the Chrome Web Store and the zip on the website are the same files, and both carry the licence and the attribution notice inside them.

## Where your data lives

Flowkite has no backend. There is no Flowkite account, no Flowkite server, and nothing you do is uploaded to us. Everything the extension stores lives in your browser's local extension storage (`chrome.storage.local`) and is removed when you uninstall the extension.

That covers:

- **Your API keys** for LLM providers
- **Conversation history** and saved prompts
- **Settings**, including firewall allow and deny lists
- **Remembered preferences** (see below)

None of this is synced across your devices, and none of it leaves your machine except as described in "What is sent to your LLM provider".

## Remembered preferences (Memory)

Flowkite can remember preferences you tell it, so they carry across sessions — for example a delivery address preference or a unit preference.

- Memories are stored **on this device only**, in `chrome.storage.local`. They are never sent to a server and never synced.
- The agent only writes a memory when it decides you told it a preference directly. It is instructed not to store passwords, card numbers or other secrets, and not to store things it merely read on a page.
- You can see every stored memory, delete any single one, delete all of them, or turn memory off entirely, under **Options → Memory**.

## What is sent to your LLM provider

To do anything useful, Flowkite sends page context to whichever LLM provider **you** configured, using **your** API key. Depending on your settings, that includes:

- A text description of the page's interactive elements
- The page URL and title
- **Screenshots of the page**, when vision is enabled, and also automatically when the page cannot be read from the DOM at all
- Your task instructions and the conversation so far
- Your remembered preferences, when memory is enabled

This data goes directly from your browser to your provider. It does not pass through any Flowkite infrastructure. **Once it reaches your provider, their privacy policy governs it, not this one.** If a page contains sensitive information and you run a task on it, that information may be included in what is sent.

Page content is treated as untrusted input and is wrapped in explicit delimiters before being given to the model, so that text on a page is not able to act as an instruction to the agent.

## Browser access and permissions

Flowkite requests broad browser access because a web automation agent cannot work without it. Specifically:

- **`debugger`** — Flowkite attaches Chrome's debugger to the tab it is working on. This is how it reads the page structure, takes screenshots, and performs clicks and typing reliably across sites. Chrome shows a visible "Flowkite started debugging this browser" banner the whole time it is attached. The debugger is detached when a task finishes, when a task fails, and when you close the side panel.
- **`tabs`** and **`activeTab`** — to see the current page and to open, switch and close tabs. Parallel research tasks open additional tabs and close them again when they finish.
- **`scripting`** — to inject the script that reads a page's interactive elements into the page being worked on.
- **`webNavigation`** — to know when a page has finished loading, so the agent acts on a settled page rather than a half-rendered one.
- **`storage`** and **`unlimitedStorage`** — for everything described under "Where your data lives". Conversation history with long tasks can exceed the default extension storage quota.
- **`sidePanel`** — to show the chat interface.
- **Host permissions (`<all_urls>`)** — Flowkite cannot know in advance which sites you will ask it to work on, so it requests access to all of them. You can narrow this yourself with the firewall allow and deny lists under **Options → Firewall**.

Flowkite does not read your browsing history, and it does not act on pages outside the task you gave it.

## Actions that need your permission

Flowkite will not spend money, delete data, submit a form, download a file or type into a password field without stopping to ask you first. It also shows you its plan before it begins acting on a page. Both behaviours are on by default and can be turned off under **Options → General**, which is your decision to make.

## Anonymous analytics (optional)

Analytics is **enabled by default and can be disabled anytime** under **Options → Analytics**. It is also inert in any build that has no analytics key configured, in which case nothing is collected at all.

**Collected when enabled:**

- Task metrics (execution times, error categories)
- Domain names visited (e.g. `amazon.com` — not full URLs)
- Anonymous usage statistics
- A randomly generated anonymous identifier

**Never collected:**

- Personal information, credentials, or authentication data
- Full URLs, page content, screenshots, or task instructions
- Your remembered preferences
- Any personally identifiable information

Analytics data is processed by PostHog and used solely to improve the extension. It is never sold or shared with advertisers.

## Your control

- Review and delete remembered preferences under **Options → Memory**
- Clear conversation history at any time from the side panel
- Enable or disable analytics under **Options → Analytics**
- Restrict which sites the agent may touch under **Options → Firewall**
- Uninstalling the extension removes all local data

## Children

Flowkite is not directed at children and is not intended for use by anyone under 13.

## Changes to this Privacy Policy

This policy may be updated as the extension changes. Material changes will be noted in the repository's release notes, and the date below will be updated.

## Contact

Questions or concerns? Reach us on [X](https://x.com/Flowkiteai), or through the support tab on the Chrome Web Store listing.

Last Updated: August 11, 2026
