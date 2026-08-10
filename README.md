<h1 align="center">
    <img src="https://github.com/user-attachments/assets/ec60b0c4-87ba-48f4-981a-c55ed0e8497b" height="100" width="375" alt="banner" /><br>
</h1>


<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/itsnevu)

</div>

## 🌐 Flowkate

Flowkate is an open-source AI web automation tool that runs in your browser. A free alternative to OpenAI Operator with flexible LLM options and multi-agent system.

⬇️ Not on the Chrome Web Store yet — grab the latest [release](https://github.com/itsnevu/Flowkate/releases) or [build from source](#%EF%B8%8F-build-from-source)

👏 Join the conversation in [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions)

🌟 Loving Flowkate? Give us a star  and help spread the word!


<div align="center">
<img src="https://github.com/user-attachments/assets/112c4385-7b03-4b81-a352-4f348093351b" width="600" alt="Flowkate Demo GIF" />
<p><em>Flowkate's multi-agent system analyzing HuggingFace in real-time, with the Planner intelligently self-correcting when encountering obstacles and dynamically instructing the Navigator to adjust its approach—all running locally in your browser.</em></p>
</div>

## 🔥Why Flowkate?

Looking for a powerful AI browser agent without the $200/month price tag of OpenAI Operator? **Flowkate** , as a chrome extension, delivers premium web automation capabilities while keeping you in complete control:

- **100% Free** - No subscription fees or hidden costs. Just install and use your own API keys, and you only pay what you use with your own API keys.
- **Privacy-Focused** - Everything runs in your local browser. Your credentials stay with you, never shared with any cloud service.
- **Flexible LLM Options** - Connect to your preferred LLM providers with the freedom to choose different models for different agents.
- **Fully Open Source** - Complete transparency in how your browser is automated. No black boxes or hidden processes.

> **Note:** We currently support OpenAI, Anthropic, Gemini, Ollama, Groq, Cerebras, Llama and custom OpenAI-Compatible providers, more providers will be supported.


## 📊 Key Features

- **Multi-agent System**: Specialized AI agents collaborate to accomplish complex web workflows
- **Interactive Side Panel**: Intuitive chat interface with real-time status updates
- **Task Automation**: Seamlessly automate repetitive web automation tasks across websites
- **Follow-up Questions**: Ask contextual follow-up questions about completed tasks
- **Conversation History**: Easily access and manage your AI agent interaction history
- **Multiple LLM Support**: Connect your preferred LLM providers and assign different models to different agents

### 🛡️ You stay in control

- **Plan preview**: The agent shows you what it intends to do and waits for your approval before it touches a page. Only the first plan of each task is gated, so re-planning doesn't keep interrupting you.
- **Confirmation for sensitive actions**: Buying, deleting, submitting a form, downloading a file or typing into a password field all stop and ask first. The check reads the actual DOM element the agent picked — not the model's description of what it's doing — so a page that manages to steer the model still can't act on its own.
- **Undo**: Roll back the last step. The page navigates back and the agent forgets the step, so it re-plans from the restored state instead of building on something you rejected.
- **On-device memory**: The agent can remember your preferences between sessions. Everything is stored in `chrome.storage.local` — never sent to a server, never synced. The Memory tab in Options lists every stored fact with per-entry delete and a master switch.

### ⚡ Reliability and cost

- **Grounding that survives late-rendering pages**: An empty DOM parse is retried on escalating delays before the agent concludes a page is empty, and when the DOM still yields nothing a screenshot is attached automatically so the agent can work from what it can see.
- **Hybrid model routing**: Configure an optional cheap **Fast** model and routine steps go to it, while failures, dense pages, screenshot reasoning and the first step of a new plan escalate to your main model.
- **Parallel research**: Independent lookups run concurrently, each in its own tab, then merge. Those background tabs are read-only by construction — they cannot click, type or submit.


## 🌐 Browser Support

**Officially Supported:**
- **Chrome** - Full support with all features
- **Edge** - Full support with all features

**Not Supported:**
- Firefox, Safari, and other Chromium variants (Opera, Arc, etc.)

> **Note**: While Flowkate may function on other Chromium-based browsers, we recommend using Chrome or Edge for the best experience and guaranteed compatibility.


## 🚀 Quick Start

1. **Install the extension**:
   * Flowkate is not published on the Chrome Web Store yet, so install it from a [release](https://github.com/itsnevu/Flowkate/releases) by following ["Manually Install Latest Version"](#-manually-install-latest-version) below, or [build it from source](#%EF%B8%8F-build-from-source).

2. **Configure Agent Models**:
   * Click the Flowkate icon in your toolbar to open the sidebar
   * Click the `Settings` icon (top right)
   * Add your LLM API keys
   * Choose which model to use for different agents (Navigator, Planner)

## 🔧 Manually Install Latest Version

To get the most recent version with all the latest features:

1. **Download**
    * Download the latest `flowkate.zip` file from the official Github [release page](https://github.com/itsnevu/Flowkate/releases).

2. **Install**:
    * Unzip `flowkate.zip`.
    * Open `chrome://extensions/` in Chrome
    * Enable `Developer mode` (top right)
    * Click `Load unpacked` (top left)
    * Select the unzipped `flowkate` folder.

3. **Configure Agent Models**
    * Click the Flowkate icon in your toolbar to open the sidebar
    * Click the `Settings` icon (top right).
    * Add your LLM API keys.
    * Choose which model to use for different agents (Navigator, Planner)

4. **Upgrading**:
    * Download the latest `flowkate.zip` file from the release page.
    * Unzip and replace your existing Flowkate files with the new ones.
    * Go to `chrome://extensions/` in Chrome and click the refresh icon on the Flowkate card.

## 🛠️ Build from Source

If you prefer to build Flowkate yourself, follow these steps:

1. **Prerequisites**:
   * [Node.js](https://nodejs.org/) (v22.12.0 or higher)
   * [pnpm](https://pnpm.io/installation) (v9.15.1 or higher)

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/itsnevu/Flowkate.git
   cd flowkate
   ```

3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

4. **Build the Extension**:
   ```bash
   pnpm build
   ```

5. **Load the Extension**:
   * The built extension will be in the `dist` directory
   * Follow the installation steps from the Manually Install section to load the extension into your browser

6. **Development Mode** (optional):
   ```bash
   pnpm dev
   ```

## 🤖 Choosing Your Models

Flowkate allows you to configure different LLM models for each agent to balance performance and cost. Here are recommended configurations:

### Better Performance
- **Planner**: Claude Sonnet 4
  - Better reasoning and planning capabilities
- **Navigator**: Claude Haiku 3.5
  - Efficient for web navigation tasks
  - Good balance of performance and cost

### Cost-Effective Configuration
- **Planner**: Claude Haiku or GPT-4o
  - Reasonable performance at lower cost
  - May require more iterations for complex tasks
- **Navigator**: Gemini 2.5 Flash or GPT-4o-mini
  - Lightweight and cost-efficient
  - Suitable for basic navigation tasks

### Local Models
- **Setup Options**:
  - Use Ollama or other custom OpenAI-compatible providers to run models locally
  - Zero API costs and complete privacy with no data leaving your machine

- **Recommended Models**:
  - **Qwen3-30B-A3B-Instruct-2507**
  - **Falcon3 10B**
  - **Qwen 2.5 Coder 14B**
  - **Mistral Small 24B**
  - [Latest test results from community](https://gist.github.com/maximus2600/75d60bf3df62986e2254d5166e2524cb) 
  - We welcome community experience sharing with other local models in our [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions)

- **Prompt Engineering**:
  - Local models require more specific and cleaner prompts
  - Avoid high-level, ambiguous commands
  - Break complex tasks into clear, detailed steps
  - Provide explicit context and constraints

> **Note**: The cost-effective configuration may produce less stable outputs and require more iterations for complex tasks.

> **Tip**: Feel free to experiment with your own model configurations! Found a great combination? Share it with the community in our [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions) to help others optimize their setup.

## 💡 See It In Action

Here are some powerful tasks you can accomplish with just a sentence:

1. **News Summary**:
   > "Go to TechCrunch and extract top 10 headlines from the last 24 hours"

2. **GitHub Research**:
   > "Look for the trending Python repositories on GitHub with most stars"

3. **Shopping Research**:
   > "Find a portable Bluetooth speaker on Amazon with a water-resistant design, under $50. It should have a minimum battery life of 10 hours"

## 🛠️ Roadmap

We're actively developing Flowkate with exciting features on the horizon, welcome to join us! 

Check out our detailed roadmap and upcoming features in our [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions/85). 

## 🤝 Contributing

**We need your help to make Flowkate even better!**  Contributions of all kinds are welcome:

*  **Share Prompts & Use Cases** 
   * Join our [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions).
   * share how you're using Flowkate.  Help us build a library of useful prompts and real-world use cases.
*  **Provide Feedback** 
   * Try Flowkate and give us feedback on its performance or suggest improvements in our [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions).
* **Contribute Code**
   * Check out our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute code to the project.
   * Submit pull requests for bug fixes, features, or documentation improvements.


We believe in the power of open source and community collaboration.  Join us in building the future of web automation!


## 🔒 Security

If you discover a security vulnerability, please **DO NOT** disclose it publicly through issues, pull requests, or discussions.

Instead, please create a [GitHub Security Advisory](https://github.com/itsnevu/Flowkate/security/advisories/new) to report the vulnerability responsibly. This allows us to address the issue before it's publicly disclosed.

We appreciate your help in keeping Flowkate and its users safe!

## 💬 Community

Join our growing community of developers and users:

- [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions) - Chat with team and community
- [GitHub releases](https://github.com/itsnevu/Flowkate/releases) - Follow for updates and announcements
- [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions) - Share ideas and ask questions

## 👏 Acknowledgments

Flowkate builds on top of other awesome open-source projects:

- [Browser Use](https://github.com/browser-use/browser-use)
- [Puppeteer](https://github.com/EmergenceAI/Agent-E)
- [Chrome Extension Boilerplate](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)
- [LangChain](https://github.com/langchain-ai/langchainjs)

Huge thanks to their creators and contributors!

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

Made with ❤️ by the Flowkate Team. 

Like Flowkate? Give us a star 🌟 and join us in [GitHub Discussions](https://github.com/itsnevu/Flowkate/discussions)

## ⚠️ DISCLAIMER ON DERIVATIVE PROJECTS

**We explicitly *DO NOT* endorse, support, or participate in any** projects involving cryptocurrencies, tokens, NFTs, or other blockchain-related applications **based on this codebase.**

**Any such derivative projects are NOT Affiliated with, or maintained by, or in any way connected to the official Flowkate project or its core team.**

**We assume NO LIABILITY for any losses, damages, or issues arising from the use of third-party derivative projects. Users interact with these projects at their own risk.**

**We reserve the right to publicly distance ourselves from any misuse or misleading use of our name, codebase, or brand.**

We encourage open-source innovation but urge our community to be discerning and cautious. Please ensure you understand the risks before using any software or service built upon our codebase by independent developers.


