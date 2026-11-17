import { supabase } from '@/lib/supabase';
import { callFunction, PayFailed } from './db-pay';
import { db, ok } from './db-client';
export interface JobPaymentRequest { id:string; job_id:string; kind:'deposit'|'milestone'; label:string; amount_cents:number; created_at:string; intent_method:'wallet'|'bank'|null }
export interface JobPayment { id:string; job_id:string; request_id:string|null; invoice_id:string|null; amount_cents:number; status:'succeeded'|'processing'|'failed'; method:string }
export async function loadJobPayments(jobId:string) {
 const [requests,payments]=await Promise.all([
 db().from('job_payment_requests').select('id,job_id,kind,label,amount_cents,created_at,intent_method').eq('job_id',jobId).order('created_at').returns<JobPaymentRequest[]>(),
 db().from('payments').select('id,job_id,request_id,invoice_id,amount_cents,status,method').eq('job_id',jobId).returns<JobPayment[]>(),
 ]);
 return {requests:ok(requests)??[],payments:ok(payments)??[]};
}
/** Caller keeps this UUID on retries. Requesting money never records it as paid. */
export async function createJobPaymentRequest(id:string,jobId:string,kind:'deposit'|'milestone',amountCents:number,label:string) {
 if(!supabase) throw new PayFailed('not_set_up');
 const {data,error}=await supabase.rpc('create_job_payment_request',{p_id:id,p_job:jobId,p_kind:kind,p_amount:amountCents,p_label:label});
 if(error) throw error;
 return data as string;
}
export async function jobPaymentLink(requestId:string) {
 const result=await callFunction('payments',{action:'requestLink',requestId}) as {url?:unknown};
 if(typeof result.url!=='string'||!/^https:\/\//.test(result.url)) throw new PayFailed('failed');
 return result.url;
}
export async function confirmJobCash(requestId:string) {ok(await db().rpc('record_job_cash',{p_request:requestId}));}
export interface CollectionPage {
 business:{name:string;phone:string}; customer:{name:string;lang:'en'|'es'};
 request:{label:string;kind:'deposit'|'milestone';amountCents:number;job:string;address:string};
 paid:boolean;pending:boolean;expiresAt:string;
 pay:{wallet:boolean;bank:boolean;account:string;publishableKey:string}|null;
}
export function loadCollectionPage(token:string) {return callFunction('pay',{action:'view',token}) as Promise<CollectionPage>;}
