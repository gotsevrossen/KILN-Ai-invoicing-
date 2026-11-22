// The facts the Privacy Policy and Terms of Use show. FILL IN BEFORE PUBLISHING (and before App
// Store / Google Play review): the name of the person behind KILN and the contact email people use
// for privacy requests, account deletion help and legal notices.
// The text is a starting draft written to match how KILN works on Nov 22, 2026, not legal advice:
// have a lawyer review it, and update it whenever KILN starts collecting or sharing something new.

export const LEGAL = {
  owner: '[YOUR FULL LEGAL NAME]',
  email: '[CONTACT EMAIL]',
  /** Whose laws apply to the Terms of Use (Rossen's call, Nov 22). */
  state: 'Illinois',
  /** KILN's web address: customer links, these pages, and the account deletion page. */
  web: 'https://kiln.expo.app',
  updated: { en: 'November 22, 2026', es: '22 de noviembre de 2026' },
};

/** The blanks above are still blank. */
export const legalUnfinished = LEGAL.owner.startsWith('[') || LEGAL.email.startsWith('[');

export interface LegalSection { heading: string; body: string[] }
export interface LegalDoc { title: string; intro: string[]; sections: LegalSection[] }

/** Puts the facts above into the text: {owner}, {email}, {state}, {web}. */
export function fillLegal(text: string): string {
  return text.replace(/\{(owner|email|state|web)\}/g, (_, key: 'owner' | 'email' | 'state' | 'web') => LEGAL[key]);
}
