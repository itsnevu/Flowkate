// The content script is a placeholder: page interaction runs through the Chrome
// debugger protocol from the background worker, not through injected script code.
// Keep the load marker out of production so it does not print on every page visit.
if (import.meta.env.DEV) {
  console.log('content script loaded');
}
