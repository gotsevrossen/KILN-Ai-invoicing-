// The web version can't buy through the App Store or Google Play: owners subscribe from the phone app.
// Same names as purchases.ts so screens don't need to know which one they got.

import type { Period, PlanId } from './subscription';

export const storeReady = (): boolean => false;

export interface StorePlan { productId: string; plan: PlanId; period: Period; price: string; pkg: unknown }

const phoneOnly = () => Object.assign(new Error('phone only'), { code: 'phone_only' });

export async function loadPlans(_businessId: string): Promise<StorePlan[]> { return []; }
export async function buy(_businessId: string, _plan: StorePlan, _current: string | null): Promise<'bought' | 'cancelled'> { throw phoneOnly(); }
export async function restore(_businessId: string): Promise<boolean> { throw phoneOnly(); }
export async function manage(_businessId: string): Promise<void> { throw phoneOnly(); }
