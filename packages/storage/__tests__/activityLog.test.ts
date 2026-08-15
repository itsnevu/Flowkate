import { describe, it, expect, beforeEach } from 'vitest';
import { activityLogStore, ACTIVITY_MAX_HOSTS, ACTIVITY_MAX_WEBHOOKS } from '../lib/settings/activityLog';

describe('activityLogStore', () => {
  beforeEach(async () => {
    await activityLogStore.clearAll();
  });

  it('counts repeat visits per host and stamps the latest time', async () => {
    await activityLogStore.recordVisit('shop.example', 1000);
    await activityLogStore.recordVisit('shop.example', 2000);
    await activityLogStore.recordVisit('other.example', 1500);
    const { visits } = await activityLogStore.get();
    expect(visits['shop.example']).toEqual({ count: 2, lastAt: 2000 });
    expect(visits['other.example']).toEqual({ count: 1, lastAt: 1500 });
  });

  it('normalises the host and ignores empty ones', async () => {
    await activityLogStore.recordVisit('  Shop.Example  ', 1000);
    await activityLogStore.recordVisit('   ');
    const { visits } = await activityLogStore.get();
    expect(Object.keys(visits)).toEqual(['shop.example']);
  });

  it('evicts the least-recently-visited hosts past the cap', async () => {
    for (let i = 0; i < ACTIVITY_MAX_HOSTS + 5; i++) {
      await activityLogStore.recordVisit(`host-${i}.example`, i);
    }
    const { visits } = await activityLogStore.get();
    expect(Object.keys(visits)).toHaveLength(ACTIVITY_MAX_HOSTS);
    // the oldest five are gone, the newest survive
    expect(visits['host-0.example']).toBeUndefined();
    expect(visits['host-4.example']).toBeUndefined();
    expect(visits[`host-${ACTIVITY_MAX_HOSTS + 4}.example`]).toBeDefined();
  });

  it('keeps webhook deliveries newest-first, capped', async () => {
    for (let i = 0; i < ACTIVITY_MAX_WEBHOOKS + 3; i++) {
      await activityLogStore.recordWebhookDelivery({ host: 'hook.example', ok: true, ts: i, source: 'scheduled' });
    }
    const { webhooks } = await activityLogStore.get();
    expect(webhooks).toHaveLength(ACTIVITY_MAX_WEBHOOKS);
    expect(webhooks[0].ts).toBe(ACTIVITY_MAX_WEBHOOKS + 2);
  });

  it('clears everything at once', async () => {
    await activityLogStore.recordVisit('shop.example');
    await activityLogStore.recordWebhookDelivery({ host: 'hook.example', ok: false, ts: 1, source: 'manual' });
    await activityLogStore.clearAll();
    expect(await activityLogStore.get()).toEqual({ visits: {}, webhooks: [] });
  });
});
