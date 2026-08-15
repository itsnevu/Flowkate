import { describe, it, expect } from 'vitest';
import { isValidWebhookUrl, webhookStore, DEFAULT_WEBHOOK_CONFIG } from '../lib/settings/webhook';

/**
 * Task results can contain page content, so where they may be sent is a security boundary:
 * encrypted anywhere, or unencrypted only to the user's own machine. Pinned here so loosening it
 * means deleting an assertion that says why it was tight.
 */
describe('isValidWebhookUrl', () => {
  it.each(['https://example.com/hook', 'https://discord.com/api/webhooks/1/x', 'https://localhost:8443/x'])(
    'accepts %s',
    url => {
      expect(isValidWebhookUrl(url)).toBe(true);
    },
  );

  it.each(['http://localhost:5678/hook', 'http://127.0.0.1/hook', 'http://[::1]:3000/hook'])(
    'accepts plain http only on the local machine: %s',
    url => {
      expect(isValidWebhookUrl(url)).toBe(true);
    },
  );

  it.each([
    'http://example.com/hook', // unencrypted off-machine
    'http://192.168.1.10/hook', // LAN is still off-machine
    'ftp://example.com/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('rejects %s', url => {
    expect(isValidWebhookUrl(url)).toBe(false);
  });
});

describe('webhookStore', () => {
  it('starts disabled, scheduled-only, and with the response command channel off', () => {
    expect(DEFAULT_WEBHOOK_CONFIG).toEqual({
      enabled: false,
      url: '',
      sendManual: false,
      sendScheduled: true,
      allowFollowUp: false,
    });
  });

  it('patches config without losing other fields', async () => {
    await webhookStore.updateConfig({ url: 'https://example.com/hook' });
    await webhookStore.updateConfig({ enabled: true });
    const config = await webhookStore.getConfig();
    expect(config.url).toBe('https://example.com/hook');
    expect(config.enabled).toBe(true);
    expect(config.sendScheduled).toBe(true);
  });
});
