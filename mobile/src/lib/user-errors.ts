import type { TFn } from '../i18n';
import type { TKey } from '../i18n/en';
import { SaveBlocked } from './save-queue.ts';

/** Keep provider details for classification, but never display their text directly. */
export type ErrorDetails = { message: string; code?: string; status?: number; type?: string };

export function errorDetails(error: unknown): ErrorDetails {
  if (typeof error === 'string') return { message: error };
  if (!error || typeof error !== 'object') return { message: '' };
  const e = error as Record<string, unknown>;
  return {
    message: typeof e.message === 'string' ? e.message : '',
    code: typeof e.code === 'string' ? e.code : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
    type: typeof e.type === 'string' ? e.type : undefined,
  };
}

/** Only reviewed, translated copy can cross the boundary into an error notice. */
export function userErrorKey(error: unknown): TKey {
  const { code = '', status, message, type } = errorDetails(error);
  const text = message.toLowerCase();
  if (status === 429 || /rate_limit|too_many/.test(code)) return 'errors.tooMany';
  if (code === 'invalid_credentials' || /invalid login credentials/.test(text)) return 'errors.credentials';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(text)) return 'errors.confirmEmail';
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/.test(text)) return 'errors.accountExists';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'errors.checkDetails';
  if (code === 'weak_password') return 'auth.weakPassword';
  if (code === 'same_password') return 'auth.samePassword';
  if (code === 'otp_expired' || code === 'otp_disabled') return 'auth.badCode';
  if (status === 401 || code === 'signed_out' || /jwt|refresh_token|session_not_found|session_expired/.test(code.toLowerCase()) || /jwt expired|invalid refresh token/.test(text)) return 'errors.signIn';
  if (code === 'owner_only' || status === 403 || code === '42501' || /row.level security|permission denied/.test(text)) return 'errors.permission';
  if (code === 'not_found' || status === 404 || code === 'PGRST116' || /record was not found/.test(text)) return 'errors.missing';
  if (code === 'offline' || /failed to fetch|network request failed|networkerror|load failed|connection refused|timeout|timed out/.test(text)) return 'errors.connection';
  if (code === '23505') return 'errors.duplicate';
  if (code === '23503' || code === '23514' || code === '22P02') return 'errors.checkDetails';
  if (/already (sent|signed)|signed or sent|sent or signed|was answered|locked|cannot (edit|change|delete).*sent/.test(text)) return 'errors.locked';
  if (code === 'not_set_up' || code === 'PGRST202' || code === '42883' || code === '42P01' || /schema cache|could not find the function|no server is set up/.test(text)) return 'errors.unavailable';
  if (code === 'card_declined' || code === 'insufficient_funds' || code === 'expired_card') return 'errors.paymentDeclined';
  if (code === 'authentication_required' || code === 'payment_intent_authentication_failure') return 'errors.paymentVerification';
  if (type === 'validation_error' || /^(invalid_|incomplete_)/.test(code)) return 'errors.checkPayment';
  if (status && status >= 500) return 'errors.server';
  return 'errors.failed';
}

export function userError(t: TFn, error: unknown): string {
  if (error instanceof SaveBlocked) return t('errors.unsaved', { reason: userError(t, error.cause) });
  return t(userErrorKey(error));
}
