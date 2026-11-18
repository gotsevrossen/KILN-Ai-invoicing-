import { db, ok } from './db-client';

export type DeliveryStage = 'link_prepared' | 'share_opened' | 'owner_confirmed_shared' | 'customer_viewed';
export type ShareChannel = 'text' | 'email' | 'share';
export interface DeliveryEvent { document_type: 'invoice' | 'estimate'; document_id: string; stage: DeliveryStage; created_at: string }
export interface EstimateAccess { url: string; documentId: string; expiresAt: string }

async function access(body: Record<string, unknown>): Promise<unknown> {
  const result = await db().functions.invoke('estimate-access', { body });
  if (result.error) throw new Error('The estimate link could not be opened. Please try again.');
  return result.data;
}
export function prepareEstimateAccess(jobId: string): Promise<EstimateAccess> {
  return access({ action: 'prepare', jobId }) as Promise<EstimateAccess>;
}
export async function recordDelivery(documentType: 'invoice' | 'estimate', documentId: string, stage: Exclude<DeliveryStage, 'customer_viewed'>, channel?: ShareChannel): Promise<void> {
  ok(await db().rpc('record_delivery_event', { p_type: documentType, p_id: documentId, p_stage: stage, p_channel: channel ?? null }));
}
export async function loadDeliveryEvents(): Promise<DeliveryEvent[]> {
  return ok(await db().from('document_delivery_events').select('document_type,document_id,stage,created_at').order('created_at')) as DeliveryEvent[];
}

export interface QuoteSnapshot {
  id: string; number: string; title: string; address: string; lang: 'en' | 'es';
  business_name: string; business_phone: string; customer_name: string; issued_at: string;
  deposit_on: boolean; deposit_bps: number;
  scope?: { notes?: string; details?: string; location?: string; exclusions?: string };
  tax: { rate_bps: number; labor: boolean; materials: boolean };
  lines: { description: string; unit: string; qty_hundredths: number; unit_cents: number; kind: 'labor' | 'material' | 'fee'; excluded: boolean }[];
}
export interface QuoteAccess { snapshot: QuoteSnapshot; hash: string; expiresAt: string; acceptedAt: string | null; declinedAt?: string | null }
export function viewEstimateAccess(token: string): Promise<QuoteAccess> {
  return access({ action: 'view', token }) as Promise<QuoteAccess>;
}
export async function acceptEstimateAccess(token: string, hash: string, name: string, consent: string): Promise<string> {
  const result = await access({ action: 'accept', token, hash, name, consent, agreed: true }) as { acceptedAt: string };
  return result.acceptedAt;
}

export async function declineEstimateAccess(token: string, hash: string): Promise<string> {
  const result = await access({ action: 'decline', token, hash }) as { declinedAt: string };
  return result.declinedAt;
}

export function prepareQuoteDeposit(token: string): Promise<{ url: string }> { return access({ action: 'deposit', token }) as Promise<{ url: string }>; }
