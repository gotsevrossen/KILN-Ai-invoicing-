import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The server charges customers with its own copy of this money code (the server functions can't
// reach the app's files). If the two ever differ, the amount charged could differ from the invoice.
test('the server charges with the same money math as the app', () => {
  const app = readFileSync(new URL('./money.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../../../supabase/functions/_shared/money.ts', import.meta.url), 'utf8');
  assert.equal(server, app, 'copy mobile/src/lib/money.ts to supabase/functions/_shared/money.ts');
});
