import { db, ok } from './db-client';
import { emptyWorksheet, validFinishSpec, validateWorksheet, type FinishSpec, type TradeWorksheet } from '../lib/trade-tools';

export async function loadTradeTools(businessId: string, jobId: string): Promise<TradeWorksheet> {
  const data = ok(await db().from('job_trade_worksheets').select('body').eq('business_id', businessId).eq('job_id', jobId).maybeSingle());
  const body = data?.body as TradeWorksheet | undefined;
  if (body) validateWorksheet(body);
  return body ?? emptyWorksheet();
}
export async function saveTradeTools(businessId: string, jobId: string, body: TradeWorksheet): Promise<void> {
  validateWorksheet(body);
  ok(await db().from('job_trade_worksheets').upsert({ business_id: businessId, job_id: jobId, body }, { onConflict: 'job_id' }));
}
export async function loadFinishTemplates(businessId: string): Promise<FinishSpec[]> {
  const rows = ok(await db().from('trade_scope_templates').select('body').eq('business_id', businessId).order('name'));
  const bodies: unknown[] = (rows ?? []).map((r) => r.body);
  return bodies.filter(validFinishSpec);
}
export async function saveFinishTemplate(businessId: string, body: FinishSpec): Promise<void> {
  if (!validFinishSpec(body) || !body.name.trim() || body.name.length > 120 || Object.values(body).some((x) => x.length > 2000)) throw new Error('Invalid template');
  ok(await db().from('trade_scope_templates').upsert({ business_id: businessId, name: body.name.trim(), body }, { onConflict: 'business_id,name' }));
}
