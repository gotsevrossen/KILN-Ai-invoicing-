export const CONSENT = {
  en: 'I accept this exact estimate and use my typed name as my electronic signature.',
  es: 'Acepto este presupuesto exacto y uso mi nombre escrito como firma electrónica.',
};
export function validAcceptance(body: Record<string, unknown>): boolean {
  return typeof body.name === 'string' && body.name.trim().length >= 2 && body.name.trim().length <= 120
    && typeof body.hash === 'string' && /^[0-9a-f]{64}$/.test(body.hash)
    && body.agreed === true && (body.consent === CONSENT.en || body.consent === CONSENT.es);
}
