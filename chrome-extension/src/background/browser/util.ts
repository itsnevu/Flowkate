/**
 * Checks if a URL is allowed based on firewall configuration
 * @param url The URL to check
 * @param allowList The allow list
 * @param denyList The deny list
 * @returns True if the URL is allowed, false otherwise
 */
export function isUrlAllowed(url: string, allowList: string[], denyList: string[]): boolean {
  // Normalize and validate input
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return false;
  }

  const lowerCaseUrl = trimmedUrl.toLowerCase();

  // Special case: Allow 'about:blank' explicitly - it is the tab an unattended run starts from,
  // and it carries no content of its own.
  if (lowerCaseUrl === 'about:blank') {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);

    // The scheme is decided by the parser and an allow list, never by matching the raw string.
    //
    // This check used to be `startsWith` over a list of dangerous prefixes, which a scheme could
    // simply step around: `String.trim()` strips whitespace around the URL but not inside the
    // scheme, and the URL parser then removes it - so "java\tscript:alert(1)" passed the prefix
    // test and was still a javascript: URL by the time it reached chrome.tabs.update. Whole
    // families were never listed either (blob:, filesystem:, view-source:, about:, devtools:,
    // chrome-untrusted:). A blocklist over a value the browser is going to canonicalise anyway
    // cannot be made complete, and http(s) is the only thing the agent has any business
    // navigating to.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return false;
    }

    // 4. Extract domain for domain-based checks. A trailing dot is a valid, fully-qualified form
    // that Chrome resolves normally, so it is removed here rather than being left as a way to
    // spell a denied host that no deny entry matches.
    const domain = parsedUrl.hostname.toLowerCase().replace(/\.+$/, '');

    // Scripts are not allowed to be injected into the Chrome Web Store
    if (domain === 'chromewebstore.google.com') {
      return false;
    }

    // If firewall is disabled, allow all other URLs
    if (allowList.length === 0 && denyList.length === 0) {
      return true;
    }

    // 1. Remove protocol prefix for further comparisons
    const urlWithoutProtocol = lowerCaseUrl.replace(/^https?:\/\//, '');

    // Every deny check runs before any allow check.
    //
    // These used to interleave - full-URL deny, full-URL allow, domain deny, domain allow - so an
    // allow entry could return true before the domain deny list was ever consulted. Allowing
    // `sub.evil.com` while denying `evil.com` is two different strings, so the options UI keeps
    // both, and the subdomain was reachable despite the deny rule that covers it. A deny entry is
    // the stronger statement of intent and now always wins.

    // 2. Check full URL against deny list
    for (const deniedEntry of denyList) {
      if (urlWithoutProtocol === deniedEntry) {
        return false;
      }
    }

    // 3. Check domain against deny list
    for (const deniedEntry of denyList) {
      if (domain === deniedEntry || domain.endsWith(`.${deniedEntry}`)) {
        return false;
      }
    }

    // 4. Check full URL against allow list
    for (const allowedEntry of allowList) {
      if (urlWithoutProtocol === allowedEntry) {
        return true;
      }
    }

    // 5. Check domain against allow list
    for (const allowedEntry of allowList) {
      if (domain === allowedEntry || domain.endsWith(`.${allowedEntry}`)) {
        return true;
      }
    }

    // Default policy
    return allowList.length === 0;
  } catch (error) {
    // Invalid URL format - deny by default
    return false;
  }
}

// Check if a URL is a new tab page (about:blank or chrome://new-tab-page).
export function isNewTabPage(url: string): boolean {
  return url === 'about:blank' || url === 'chrome://new-tab-page' || url === 'chrome://new-tab-page/';
}

export function capTextLength(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '...';
  }
  return text;
}
