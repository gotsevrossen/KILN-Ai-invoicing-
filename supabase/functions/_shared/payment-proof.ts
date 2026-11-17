/** Only whole USD amounts actually received may enter the confirmed money ledger. */
export function validPaymentProof(intent:{amount?:unknown;amount_received?:unknown;currency?:unknown},status:'processing'|'succeeded'|'failed') {
 return Number.isSafeInteger(intent.amount) && (intent.amount as number)>0 && intent.currency==='usd'
  && (status!=='succeeded'||intent.amount_received===intent.amount);
}
