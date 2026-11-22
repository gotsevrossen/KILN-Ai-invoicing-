import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import en from '../i18n/en.ts';
import es from '../i18n/es.ts';
import { errorDetails, userError, userErrorKey } from './user-errors.ts';
import { SaveBlocked } from './save-queue.ts';

describe('plain-language error notices', () => {
  it('explains how to recover when a failed prerequisite save blocks sending', () => {
    const messages: { key: string; reason?: string | number }[] = [];
    userError((key, options) => { messages.push({ key, reason: options?.reason }); return key; },
      new SaveBlocked({ code: 'PGRST202', message: 'internal schema diagnostics' }));
    assert.deepEqual(messages, [
      { key: 'errors.unavailable', reason: undefined },
      { key: 'errors.unsaved', reason: 'errors.unavailable' },
    ]);
  });
  it('explains a missing server function without exposing SQL or deployment instructions', () => {
    assert.equal(userErrorKey({ code: 'PGRST202', message: 'Could not find the function public.send_invoice in the schema cache' }), 'errors.unavailable');
  });

  it('recognizes connection failures, expired sessions and failed permissions', () => {
    assert.equal(userErrorKey(new TypeError('Failed to fetch')), 'errors.connection');
    assert.equal(userErrorKey({ code: '42501', message: 'Load failed' }), 'errors.permission');
    assert.equal(userErrorKey({ status: 404, message: 'Load failed' }), 'errors.missing');
    assert.equal(userErrorKey({ code: 'PGRST301', status: 401, message: 'JWT expired' }), 'errors.signIn');
    assert.equal(userErrorKey({ code: '42501', message: 'violates row-level security policy for table invoices' }), 'errors.permission');
    assert.equal(userErrorKey({ status: 503, message: '<html>upstream service error</html>' }), 'errors.server');
  });

  it('provides specific sign-in and reset guidance', () => {
    assert.equal(userErrorKey({ code: 'invalid_credentials' }), 'errors.credentials');
    assert.equal(userErrorKey({ code: 'email_not_confirmed' }), 'errors.confirmEmail');
    assert.equal(userErrorKey({ code: 'over_email_send_rate_limit' }), 'errors.tooMany');
    assert.equal(userErrorKey({ code: 'otp_expired' }), 'auth.badCode');
    assert.equal(userErrorKey({ code: 'weak_password' }), 'auth.weakPassword');
  });

  it('keeps payment codes useful without showing payment provider diagnostics', () => {
    assert.equal(userErrorKey({ code: 'card_declined', message: 'request req_secret failed' }), 'errors.paymentDeclined');
    assert.equal(userErrorKey({ code: 'payment_intent_authentication_failure' }), 'errors.paymentVerification');
    assert.equal(userErrorKey({ type: 'validation_error', message: 'integration_error secret details' }), 'errors.checkPayment');
  });

  it('never echoes unknown exception text, HTML or arbitrary values', () => {
    for (const error of [new Error('SQLSTATE 12345 private diagnostics'), '<html>server stack trace</html>', { message: 'secret-key' }, null, 7]) {
      const seen: string[] = [];
      const result = userError((key) => { seen.push(key); return 'Please try again.'; }, error);
      assert.equal(result, 'Please try again.');
      assert.deepEqual(seen, ['errors.failed']);
    }
  });

  it('retains structured provider details for classification', () => {
    const original = Object.assign(new Error('technical details'), { code: 'PGRST202', status: 400 });
    assert.equal(userErrorKey(errorDetails(original)), 'errors.unavailable');
  });

  it('has clear next steps in both languages without technical configuration text', () => {
    for (const language of [en, es]) {
      for (const section of [language.errors, language.payErrors, language.ai.errors]) {
        for (const message of Object.values(section)) {
          assert.ok(message.length > 15);
          assert.doesNotMatch(message, /supabase|\.env|SQLSTATE|JWT|PGRST|API key/i);
        }
      }
    }
    assert.match(es.errors.connection, /conexión/);
    assert.match(es.errors.credentials, /contraseña/);
  });
});
