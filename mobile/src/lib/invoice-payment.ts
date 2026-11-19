export const alternativeMethods = ['zelle', 'venmo', 'cash_app', 'cash', 'check'] as const;
export type AlternativeMethod = typeof alternativeMethods[number];
export type AlternativeMethods = Partial<Record<AlternativeMethod, string>>;
export type WalletKind = 'applePay' | 'googlePay';

export interface OnlineCheckout {
  wallet: boolean;
  applePay?: boolean;
  googlePay?: boolean;
  bank: boolean;
  card?: boolean;
  account: string;
  publishableKey: string;
}

export const invoicePaymentCopy = {
  en: {
    wallet: 'Apple Pay / Google Pay', stripe: 'Stripe', alternative: 'Alternative', unavailable: 'Unavailable',
    settingsTitle: 'Alternative payment methods', settingsHelp: 'Enable at least one method to send invoices. Instructions appear on the customer invoice.',
    instructions: 'Payment instructions (optional)', needsMethods: 'Set up at least one alternative payment method before sending an invoice.',
    openSettings: 'Open payment settings', askOwner: 'Ask the owner to set up an alternative payment method.',
    test: 'Stripe test mode. Payments here do not move real money.', methods: { zelle: 'Zelle', venmo: 'Venmo', cash_app: 'Cash App', cash: 'Cash', check: 'Check' },
    sign: 'Sign and accept invoice', sendSigned: 'Return signed invoice', accepted: 'Signed invoice',
    consent: 'I accept this invoice and use my signature as my electronic signature.',
    promise: 'I accept this invoice and agree to pay the balance outside KILN using the selected method.',
    external: 'Pay outside KILN using the instructions below. Your balance stays open until the business confirms receipt.',
    promised: 'Customer selected', name: 'Your full name', draw: 'Draw your signature', clear: 'Clear signature',
    signed: 'Signature sent to the business.', failure: 'Could not save the signature. Refresh the invoice and try again.',
    card: 'Debit or credit card', bank: 'Bank transfer', pay: 'Pay with Stripe', preview: 'Preview only.',
  },
  es: {
    wallet: 'Apple Pay / Google Pay', stripe: 'Stripe', alternative: 'Otra forma de pago', unavailable: 'No disponible',
    settingsTitle: 'Formas de pago alternativas', settingsHelp: 'Activa al menos una forma para enviar facturas. Las instrucciones se muestran al cliente.',
    instructions: 'Instrucciones de pago (opcional)', needsMethods: 'Configura al menos una forma de pago alternativa antes de enviar una factura.',
    openSettings: 'Abrir ajustes de pago', askOwner: 'Pide al propietario que configure una forma de pago alternativa.',
    test: 'Modo de prueba de Stripe. Aquí no se mueve dinero real.', methods: { zelle: 'Zelle', venmo: 'Venmo', cash_app: 'Cash App', cash: 'Efectivo', check: 'Cheque' },
    sign: 'Firmar y aceptar factura', sendSigned: 'Enviar factura firmada', accepted: 'Factura firmada',
    consent: 'Acepto esta factura y uso mi firma como firma electrónica.',
    promise: 'Acepto esta factura y me comprometo a pagar el saldo fuera de KILN con el método elegido.',
    external: 'Paga fuera de KILN siguiendo estas instrucciones. El saldo queda pendiente hasta que la empresa confirme el pago.',
    promised: 'El cliente eligió', name: 'Tu nombre completo', draw: 'Dibuja tu firma', clear: 'Borrar firma',
    signed: 'Firma enviada a la empresa.', failure: 'No se pudo guardar la firma. Actualiza la factura e inténtalo de nuevo.',
    card: 'Tarjeta de crédito o débito', bank: 'Transferencia bancaria', pay: 'Pagar con Stripe', preview: 'Solo vista previa.',
  },
};
