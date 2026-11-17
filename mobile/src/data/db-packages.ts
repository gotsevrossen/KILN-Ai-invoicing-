import { db, ok } from './db-client';
import { validPackage, type ServicePackage } from './service-packages';

interface PackageRow { id: string; name: string; lines: unknown; scope: unknown; minimum_cents: number; after_hours_cents: number }

export async function loadPackages(businessId: string): Promise<ServicePackage[]> {
  const rows = ok(await db().from('service_packages').select('id,name,lines,scope,minimum_cents,after_hours_cents')
    .eq('business_id', businessId).order('created_at').returns<PackageRow[]>());
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, lines: r.lines, scope: r.scope,
    minimumCents: r.minimum_cents, afterHoursCents: r.after_hours_cents })).map((p) => {
      if (!validPackage(p)) throw new Error('Invalid saved package');
      return p;
    });
}

export async function savePackage(businessId: string, preset: ServicePackage): Promise<void> {
  if (!validPackage(preset)) throw new Error('Invalid package');
  ok(await db().from('service_packages').upsert({ id: preset.id, business_id: businessId, name: preset.name.trim(),
    lines: preset.lines, scope: preset.scope, minimum_cents: preset.minimumCents, after_hours_cents: preset.afterHoursCents }));
}

export async function deletePackage(businessId: string, id: string): Promise<void> {
  ok(await db().from('service_packages').delete().eq('id', id).eq('business_id', businessId));
}
