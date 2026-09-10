import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSettings } from '../src/lib/payments/settings.ts';
import { cardcomAdapter } from '../src/lib/payments/providers/cardcom-connection.ts';
import { testSettingsConnection } from '../src/lib/payments/connection.ts';

test('deployed DEV and STAGING reject production Cardcom before credentials or network', async () => {
  const previous = process.env.APP_ENV;
  try {
    for (const environment of ['development', 'staging']) {
      process.env.APP_ENV = environment;
      assert.throws(() => prepareSettings({ provider: 'cardcom', environment: 'production', enabled: false, credentials: {} }, null, 'gift-shop'), { code: 'invalid_environment' });
      let called = false;
      const result = await testSettingsConnection({ provider: 'cardcom', environment: 'production', credentials: {} }, null, 'gift-shop', async () => { called = true; return true; });
      assert.equal(result.success, false);
      assert.equal(called, false);
      assert.throws(() => cardcomAdapter({}, 'production'), { code: 'invalid_environment' });
      const adapter = cardcomAdapter({}, 'test');
      assert.ok(adapter.testConnection);
      await assert.rejects(() => adapter.createPayment({} as never), { code: 'not_implemented' });
    }
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});
