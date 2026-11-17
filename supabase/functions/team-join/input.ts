export type JoinInput = { action: 'send_code'; token: string } | { action: 'accept'; token: string; code: string };
export function joinInput(value: unknown): JoinInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== 'string' || !/^[a-f0-9]{64}$/.test(v.token)) return null;
  if (v.action === 'send_code') return { action: 'send_code', token: v.token };
  if (v.action === 'accept' && typeof v.code === 'string' && /^\d{6,8}$/.test(v.code)) return { action: 'accept', token: v.token, code: v.code };
  return null;
}
