export interface JobCredit {id:string;jobId?:string;invoiceId?:string|null;amountCents:number;status:'succeeded'|'processing'|'failed'}
/** A payment linked to both a job and invoice counts once. Processing is shown, not paid. */
export function jobCredits(rows:JobCredit[],jobId:string,invoiceId?:string) {
 const seen=new Set<string>();let paid=0;let pending=0;
 for(const row of rows) {
  if(seen.has(row.id)||!(row.jobId===jobId||(!!invoiceId&&row.invoiceId===invoiceId))) continue;
  seen.add(row.id);
  if(!Number.isSafeInteger(row.amountCents)||row.amountCents<=0) continue;
  if(row.status==='succeeded') paid+=row.amountCents;
  if(row.status==='processing') pending+=row.amountCents;
 }
 return {paid,pending};
}
