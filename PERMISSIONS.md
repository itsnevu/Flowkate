# Permission justifications

Reference for the Chrome Web Store listing. Each permission declared in
[`chrome-extension/manifest.js`](chrome-extension/manifest.js) is listed with the justification to
paste into the developer dashboard, and with where in the code it is actually used — so a reviewer
can check the claim rather than take it on faith.

Flowkite is an AI browser agent: the user types a task in natural language and the extension carries
it out in the browser on their behalf. Every permission below exists to serve that single purpose.

---

## `debugger`

**Justification for the listing:**

> Flowkite drives the browser on the user's behalf to complete tasks they describe in natural
> language. It attaches the Chrome DevTools Protocol to the single tab the user's task is running in,
> and uses it to read the page's accessibility and DOM structure, capture screenshots for the vision
> model, and dispatch clicks, typing and scrolling. The DevTools Protocol is used rather than content
> script events because synthetic events dispatched from a content script are not trusted by many
> sites and silently fail on exactly the forms and widgets users need automated. The debugger is
> attached only for the duration of a task and detached when the task ends, fails, is cancelled, or
> the side panel is closed. Chrome's own "started debugging this browser" banner is visible to the
> user the entire time it is attached.

**Where it is used:** [`chrome-extension/src/background/browser/page.ts`](chrome-extension/src/background/browser/page.ts)
attaches and detaches; [`context.ts`](chrome-extension/src/background/browser/context.ts) `cleanup()`
detaches every attached page.

**Detach paths, all of which are exercised:**

| Trigger | Path |
| --- | --- |
| Task completes, fails or is cancelled | `subscribeToExecutorEvents` → `executor.cleanup()` in [`background/index.ts`](chrome-extension/src/background/index.ts) |
| Side panel closed | `port.onDisconnect` → `executor.cancel()` → task cancel → cleanup |
| User detaches manually | `chrome.debugger.onDetach` with reason `canceled_by_user` → cancel + cleanup |
| Parallel subtask ends | `finally` block in [`subtaskRunner.ts`](chrome-extension/src/background/agent/parallel/subtaskRunner.ts) |

---

## `host_permissions: <all_urls>`

**Justification for the listing:**

> The user decides which site a task runs on at the moment they type it, so the extension cannot
> enumerate its hosts in advance — a task may target any site the user has open or names. Access is
> used only on the tab the current task is operating on. Users can restrict this themselves with an
> allow list and deny list under Options → Firewall, which is enforced before every navigation.

**Where it is enforced:** `isUrlAllowed` in [`context.ts`](chrome-extension/src/background/browser/context.ts),
called by `navigateTo` and `openTab`; lists come from `firewallStore`.

---

## `tabs` and `activeTab`

**Justification for the listing:**

> Tasks frequently span more than one page: opening a search result, switching back to a form,
> closing a tab that is finished. The extension needs the tab list and the ability to create, switch
> and close tabs to do this. Parallel research tasks open one additional tab per subtask and close
> each one when that subtask finishes.

**Where it is used:** `openTab`, `switchTab`, `closeTab`, `getTabInfos` in
[`context.ts`](chrome-extension/src/background/browser/context.ts).

---

## `scripting`

**Justification for the listing:**

> The extension injects a script into the page being worked on that walks the DOM and returns the
> list of interactive elements, along with their position and visibility. This is what lets the agent
> refer to "the third button" reliably instead of guessing at selectors.

**Where it is used:** `injectBuildDomTreeScripts` in
[`browser/dom/service.ts`](chrome-extension/src/background/browser/dom/service.ts).

---

## `webNavigation`

**Justification for the listing:**

> When a page embeds an iframe the extension cannot read from the parent frame — commonly a
> cross-origin checkout, login or payment widget — the extension enumerates that tab's frames so it
> can read the interactive elements inside them too. Without this, any task involving an embedded
> form would see an empty page. Frames are enumerated only for the tab the current task is operating
> on, and only when a frame has already failed to parse from the parent.

**Where it is used:** `chrome.webNavigation.getAllFrames({ tabId })` in
[`browser/dom/service.ts`](chrome-extension/src/background/browser/dom/service.ts), guarded by a
check that at least one visible iframe failed to parse.

---

## `storage` and `unlimitedStorage`

**Justification for the listing:**

> All extension state is stored locally: the user's own LLM API keys, their settings, their firewall
> lists, their conversation history and any preferences they asked the agent to remember. There is no
> backend and nothing is synced. `unlimitedStorage` is needed because conversation history for long
> multi-step tasks, including cached page extracts, can exceed the default quota.

**Where it is used:** everything under [`packages/storage/lib`](packages/storage/lib), all created
with `StorageEnum.Local`.

---

## `sidePanel`

**Justification for the listing:**

> The extension's entire user interface is the side panel: the user types their task there, watches
> the agent's progress, approves its plan, and confirms or declines sensitive actions.

**Where it is used:** [`pages/side-panel`](pages/side-panel).

---

## `contextMenus`

**Justification for the listing:**

> Adds two entries to the page's right-click menu — "Ask Flowkite to work on this page" and, on a
> text selection, "Ask Flowkite about …" — which open the side panel with the composer pre-filled.
> Nothing runs from the menu itself: the user still writes or completes the task and presses send,
> and every existing gate (plan approval, sensitive-action confirmation) applies unchanged.

**Where it is used:** menu registration and click handling at the top of
[`background/index.ts`](chrome-extension/src/background/index.ts); the pre-fill is read by
[`SidePanel.tsx`](pages/side-panel/src/SidePanel.tsx) from `chrome.storage.session`.

---

## `alarms`

**Justification for the listing:**

> Backs user-created scheduled tasks (Options → Schedules): one daily alarm per enabled schedule,
> named with the schedule's id. Scheduled runs are deliberately weaker than interactive ones — the
> plan gate is treated as pre-approved because the user approved it by scheduling, and sensitive
> actions (purchases, deletions, credentials, submissions) are automatically DECLINED, never
> auto-allowed, because nobody is present to answer.

**Where it is used:** [`services/scheduler.ts`](chrome-extension/src/background/services/scheduler.ts)
lays and clears the alarms; the `chrome.alarms.onAlarm` listener and the unattended runner live in
[`background/index.ts`](chrome-extension/src/background/index.ts); the auto-decline is in
`requestActionConfirmation` in [`agent/types.ts`](chrome-extension/src/background/agent/types.ts).

---

## `notifications`

**Justification for the listing:**

> When a scheduled task finishes (or is skipped because another task was running), the user is not
> looking at the browser — a system notification is the only way to tell them the result is ready.
> Clicking it opens the side panel, where the full session is saved in history. No other feature
> creates notifications.

**Where it is used:** `notifySchedule` and `chrome.notifications.onClicked` in
[`background/index.ts`](chrome-extension/src/background/index.ts).

---

## Remote code

**Answer: no remote code is executed.** All JavaScript is bundled into the extension package at build
time. The extension makes network requests only to the LLM provider endpoint the user configured, and
those responses are parsed as data (JSON) — never evaluated.

## Data handling disclosures

Declare in the dashboard's data-use section:

- **Personally identifiable information** — not collected.
- **Authentication information** — the user's own LLM API keys are stored locally and sent only to
  the provider they belong to. They are never transmitted to the developer.
- **Website content** — page structure and screenshots are transmitted to the user's chosen LLM
  provider in order to perform the task the user requested. This is disclosed in
  [PRIVACY.md](PRIVACY.md). Additionally, if the user enables the outbound webhook
  (Options → General → Outbound webhook, off by default), each finished task's outcome text is
  POSTed to the single URL the user entered — HTTPS anywhere, plain HTTP only to localhost.
- **Location, health, financial, personal communications, web history, user activity** — not
  collected.

Certify: data is not sold to third parties; data is not used or transferred for purposes unrelated to
the item's single purpose; data is not used to determine creditworthiness or for lending.

## Single purpose statement

> Flowkite performs web tasks in the browser on the user's behalf, following instructions the user
> writes in natural language.
