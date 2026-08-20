import fs from 'node:fs';
import deepmerge from 'deepmerge';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));

const isFirefox = process.env.__FIREFOX__ === 'true';
const isOpera = process.env.__OPERA__ === 'true';

/**
 * If you want to disable the sidePanel, you can delete withSidePanel function and remove the sidePanel HoC on the manifest declaration.
 *
 * ```js
 * const manifest = { // remove `withSidePanel()`
 * ```
 */
function withSidePanel(manifest) {
  // Firefox does not support sidePanel
  if (isFirefox) {
    return manifest;
  }
  return deepmerge(manifest, {
    side_panel: {
      default_path: 'side-panel/index.html',
    },
    permissions: ['sidePanel'],
  });
}

/**
 * Grants the tabGroups permission, which backs the labelled group the agent collects its tabs
 * into. Firefox implements neither `tabs.group` nor the `tabGroups` namespace and rejects the
 * permission outright at install time, so it is added the same conditional way as sidePanel.
 */
function withTabGroups(manifest) {
  if (isFirefox) {
    return manifest;
  }
  return deepmerge(manifest, {
    permissions: ['tabGroups'],
  });
}

/**
 * Adds Opera sidebar support using the sidebar_action API.
 * This is compatible with Chrome extensions and won't break Chrome Web Store validation.
 */
function withOperaSidebar(manifest) {
  // Only add Opera sidebar_action if building specifically for Opera
  if (isFirefox || !isOpera) {
    return manifest;
  }

  return deepmerge(manifest, {
    sidebar_action: {
      default_panel: 'side-panel/index.html',
      default_title: 'Flowkite',
      default_icon: 'icon-32.png',
    },
  });
}

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = withOperaSidebar(
  withTabGroups(
    withSidePanel({
      manifest_version: 3,
      default_locale: 'en',
      /**
       * if you want to support multiple languages, you can use the following reference
       * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
       */
      name: '__MSG_app_metadata_name__',
      version: packageJson.version,
      description: '__MSG_app_metadata_description__',
      host_permissions: ['<all_urls>'],
      permissions: [
        'storage',
        'scripting',
        'tabs',
        'activeTab',
        'debugger',
        'unlimitedStorage',
        'webNavigation',
        'contextMenus',
        'alarms',
        'notifications',
        // saving a collected table to disk; the panel hands Chrome a blob it made itself, so this
        // never reaches out to the network on the user's behalf
        'downloads',
      ],
      options_page: 'options/index.html',
      commands: {
        /**
         * Opening the panel was mouse-only: the toolbar icon, or the right-click menu. The
         * shortcut is user-rebindable at chrome://extensions/shortcuts, and Chrome silently
         * drops the suggested binding if another extension already holds it, so the command
         * still works from that page even when this default does not stick.
         */
        'open-side-panel': {
          suggested_key: { default: 'Alt+Shift+F' },
          description: '__MSG_app_commands_openPanel__',
        },
      },
      background: {
        service_worker: 'background.iife.js',
        type: 'module',
      },
      action: {
        default_icon: {
          16: 'icon-16.png',
          32: 'icon-32.png',
          48: 'icon-48.png',
          128: 'icon-128.png',
        },
      },
      icons: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
      // No content_scripts, and no web_accessible_resources. Both were registered without a
      // consumer, and both cost more than they returned:
      //
      // The content script matched <all_urls> with all_frames, so it ran in every frame of every
      // page the user opened - while compiling to `(function(){"use strict"})();`, 30 bytes that do
      // nothing. Page interaction runs over the Chrome debugger protocol from this worker, never
      // through injected script code.
      //
      // web_accessible_resources listed '*.js' for '*://*/*', which handed every website the whole
      // background bundle to read and a stable chrome-extension:// URL to fingerprint the user by,
      // and made permission/index.html - a page that calls getUserMedia and chrome.tabs - framable
      // by any origin, so a transparent overlay could clickjack a microphone grant. Nothing needed
      // it: buildDomTree.js is injected with chrome.scripting.executeScript({files}), and
      // permission/index.html and side-panel/index.html are opened by the extension itself through
      // chrome.runtime.getURL. Extension contexts reach their own resources without this key; only
      // web pages need it. Re-add it only for a specific path, with use_dynamic_url: true.
    }),
  ),
);

export default manifest;
