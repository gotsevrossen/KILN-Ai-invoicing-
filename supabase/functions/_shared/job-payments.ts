import type { SupabaseClient } from '@supabase/supabase-js';
import { hashToken, Refused, setting, tokenShape } from './invoice.ts';
import { stripe, stripeConfigured } from './stripe.ts';
import { validPaymentProof } from './payment-proof.ts';

interface RequestRow { id:string; business_id:string; job_id:string; kind:string; label:string; amount_cents:number; expires_at:string; intent_id:string|null; intent_method:'wallet'|'bank'|null; reserved_at:string|null }
export async function requestByToken(db:SupabaseClient, token:unknown) {
 if (!tokenShape(token)) return null;
 const res=await db.from('job_payment_requests').select('*').eq('token_hash',await hashToken(token)).maybeSingle<RequestRow>();
 if(res.error) throw new Error('load failed');
 if(!res.data || Date.parse(res.data.expires_at)<Date.now()) return null;
 return res.data;
}
async function context(db:SupabaseClient,r:RequestRow) {
 const [job,account,payment,business]=await Promise.all([
 db.from('jobs').select('title,address,customer_id').eq('id',r.job_id).eq('business_id',r.business_id).single(),
 db.from('stripe_accounts').select('account_id,wallet_ready,bank_ready').eq('business_id',r.business_id).maybeSingle(),
 db.from('payments').select('amount_cents,status,method').eq('request_id',r.id).maybeSingle(),
 db.from('businesses').select('name,phone').eq('id',r.business_id).single(),
 ]);
 if(job.error||account.error||payment.error||business.error) throw new Error('load failed');
 const customer=await db.from('customers').select('name,lang').eq('id',job.data.customer_id).single();
 if(customer.error) throw new Error('load failed');
 return {job:job.data,account:account.data,payment:payment.data,business:business.data,customer:customer.data};
}
export async function jobRequestAction(db:SupabaseClient,r:RequestRow,body:{action?:unknown;method?:unknown;intent?:unknown}) {
 const c=await context(db,r);
 if(body.action==='view') return {business:c.business,customer:c.customer,request:{label:r.label,kind:r.kind,amountCents:r.amount_cents,job:c.job.title,address:c.job.address},paid:c.payment?.status==='succeeded',pending:c.payment?.status==='processing',expiresAt:r.expires_at,
 pay:c.account&&(c.account.wallet_ready||c.account.bank_ready)&&stripeConfigured()&&c.payment?.status!=='succeeded'&&c.payment?.status!=='processing'?{wallet:c.account.wallet_ready,bank:c.account.bank_ready,account:c.account.account_id,publishableKey:setting('STRIPE_PUBLISHABLE_KEY')}:null};
 const key=setting('STRIPE_SECRET_KEY'); if(!key) throw new Refused(503,'not_set_up');
 if(!c.account) throw new Refused(409,'not_ready');
 if(body.action==='start') {
 if(!stripeConfigured()) throw new Refused(503,'not_set_up');
 const method=body.method;
 if(method!=='wallet'&&method!=='bank') throw new Refused(400,'bad_request');
 if(!(method==='wallet'?c.account.wallet_ready:c.account.bank_ready)) throw new Refused(409,'not_ready');
 const reserved=await db.rpc('reserve_job_payment',{p_id:r.id,p_method:method});
 if(reserved.error) throw new Refused(409,'nothing_due');
 const current=await db.from('job_payment_requests').select('intent_id,reserved_at').eq('id',r.id).single<{intent_id:string|null;reserved_at:string}>();
 if(current.error) throw new Error('load failed');
 if(current.data.intent_id) {
  const existing=await stripe<{id:string;client_secret:string;amount:number;currency:string;metadata:Record<string,string>}>(key,{method:'GET',path:`/v1/payment_intents/${current.data.intent_id}`,account:c.account.account_id});
  if(existing.metadata?.request_id!==r.id||existing.metadata.business_id!==r.business_id||existing.amount!==r.amount_cents||existing.currency!=='usd') throw new Refused(409,'not_ready');
  return {clientSecret:existing.client_secret,amount:r.amount_cents};
 }
 // A crash before persisting the intent may be retried within Stripe's idempotency window only.
 if(Date.now()-Date.parse(current.data.reserved_at)>23*60*60*1000) throw new Refused(409,'not_ready');
 const intent=await stripe<{id:string;client_secret:string}>(key,{method:'POST',path:'/v1/payment_intents',account:c.account.account_id,idempotencyKey:`kiln-request-${r.id}`,
 body:{amount:r.amount_cents,currency:'usd',payment_method_types:[method==='wallet'?'card':'us_bank_account'],description:r.label,metadata:{request_id:r.id,business_id:r.business_id,kiln_method:method}}});
 const saved=await db.from('job_payment_requests').update({intent_id:intent.id}).eq('id',r.id);
 if(saved.error) throw new Error('save failed');
 return {clientSecret:intent.client_secret,amount:r.amount_cents};
 }
 if(body.action==='check') {
 if(typeof body.intent!=='string'||!/^pi_[A-Za-z0-9]{8,64}$/.test(body.intent)||body.intent!==r.intent_id) throw new Refused(404,'not_found');
 const intent=await stripe<{id:string;status:string;amount:number;amount_received:number;currency:string;metadata:Record<string,string>}>(key,{method:'GET',path:`/v1/payment_intents/${body.intent}`,account:c.account.account_id});
 if(intent.metadata?.request_id!==r.id||intent.metadata.business_id!==r.business_id||intent.currency!=='usd'||intent.amount!==r.amount_cents) throw new Refused(404,'not_found');
 const status=intent.status==='succeeded'?'succeeded':intent.status==='processing'?'processing':null;
 if(status && !validPaymentProof(intent,status)) throw new Refused(409,'not_ready');
 if(status) {const result=await db.rpc('record_job_payment',{p_id:r.id,p_intent:intent.id,p_amount:intent.amount,p_method:intent.metadata.kiln_method,p_status:status});if(result.error) throw new Error('save failed');}
 return {status:status??'not_paid'};
 }
 throw new Refused(400,'bad_request');
}
