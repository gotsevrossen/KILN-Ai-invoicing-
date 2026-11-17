export interface ChangeAnswer { signed_at: string | null; declined_at: string | null }

/** Retry-safe confirmation: never write an answered document again, and never
 * treat a missing or signed document as confirmation of a decline.
 */
export async function confirmDecline(
  updateUnanswered: () => Promise<boolean>,
  readAnswer: () => Promise<ChangeAnswer | null>,
): Promise<void> {
  if (await updateUnanswered()) return;
  const answer = await readAnswer();
  if (answer?.declined_at && !answer.signed_at) return;
  if (answer?.signed_at) throw new Error('This change order was signed and cannot be declined');
  throw new Error('The record was not found on the server');
}
