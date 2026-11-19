// Words for paid-job cleanup, saved documents and the Jobs menu, in English and Spanish.
// The Spanish object must have every English key.
const en = {
  // Home warning
  leavingTitle: 'Paid jobs leaving KILN',
  leavingHelp: 'Paid jobs are removed 30 days after payment. Save the documents to keep the estimate, invoice and change orders. Photos, notes and hours are not kept.',
  leavesOn: 'Leaves %{when}',
  saveDocs: 'Save documents', letGo: "Don't save", saveAll: 'Save all documents',
  willSave: 'Documents will be saved', willNotSave: 'Nothing will be kept',
  undo: 'Change', openJob: 'Open job',
  removed: '%{count} paid jobs were removed.',

  // settings
  docsSection: 'Old jobs',
  autoSave: 'Save documents automatically',
  autoSaveHelp: 'Keep estimates, invoices and change orders when paid jobs are removed.',
  savedDocs: 'Saved documents', savedDocsHelp: 'Estimates, invoices and change orders from removed jobs',

  // saved documents
  savedTitle: 'Saved documents', savedEmpty: 'No saved documents yet. Documents from removed jobs show here when you save them.',
  estimate: 'Estimate', invoice: 'Invoice', changeOrder: 'Change order',
  removedOn: 'Saved %{when}', search: 'Search saved documents',
  sharePdf: 'Share as PDF', deleteDoc: 'Delete this document', deleteConfirm: 'Yes, delete', deleteHelp: 'It is gone for good.',
  cancel: 'Cancel', loading: 'Loading…', failed: "Couldn't load. Check your connection and try again.", retry: 'Try again',
  billTo: 'Customer', job: 'Job', workOrder: 'Work order', issued: 'Issued', paidOn: 'Paid', signed: 'Signed', declined: 'Declined',
  qty: 'Qty', price: 'Price', amount: 'Amount', excluded: 'Not included',
  labor: 'Labor', materials: 'Materials', subtotal: 'Subtotal', tax: 'Tax', total: 'Total', paid: 'Paid', due: 'Balance due',
  payments: 'Payments', signatures: 'Signatures', signedBy: 'Signed by %{name}', fingerprint: 'Document fingerprint',
  change: 'Change', base: 'Before this change', newTotal: 'New total', description: 'Description',
  cash: 'Cash', check: 'Check', card: 'Card', bank: 'Bank', wallet: 'Apple Pay / Google Pay', other: 'Other',

  // Jobs menu
  menu: 'Filters and more', filters: 'Filter jobs', clear: 'Clear filters',
  customer: 'Customer', person: 'Assigned to', trade: 'Trade', jobType: 'Job type', unassigned: 'Nobody',
  any: 'Any', showing: 'Showing %{count} of %{total}',
  aiSearch: 'Find with KILN', aiSearchHint: 'Like "sink repair" or "deck"', aiFind: 'Find', aiFinding: 'Looking…',
  aiFound: 'KILN found %{count} jobs for "%{query}"', aiNone: 'KILN found no jobs for "%{query}"', aiOff: 'Sign in to search with KILN.',
};

const es: Record<keyof typeof en, string> = {
  leavingTitle: 'Trabajos pagados que salen de KILN',
  leavingHelp: 'Los trabajos pagados se eliminan 30 días después del pago. Guarda los documentos para conservar el presupuesto, la factura y las órdenes de cambio. Las fotos, notas y horas no se conservan.',
  leavesOn: 'Sale %{when}',
  saveDocs: 'Guardar documentos', letGo: 'No guardar', saveAll: 'Guardar todos los documentos',
  willSave: 'Se guardarán los documentos', willNotSave: 'No se conservará nada',
  undo: 'Cambiar', openJob: 'Abrir trabajo',
  removed: 'Se eliminaron %{count} trabajos pagados.',

  docsSection: 'Trabajos viejos',
  autoSave: 'Guardar documentos automáticamente',
  autoSaveHelp: 'Conserva presupuestos, facturas y órdenes de cambio cuando se eliminan trabajos pagados.',
  savedDocs: 'Documentos guardados', savedDocsHelp: 'Presupuestos, facturas y órdenes de cambio de trabajos eliminados',

  savedTitle: 'Documentos guardados', savedEmpty: 'Todavía no hay documentos guardados. Los documentos de trabajos eliminados aparecen aquí cuando los guardas.',
  estimate: 'Presupuesto', invoice: 'Factura', changeOrder: 'Orden de cambio',
  removedOn: 'Guardado %{when}', search: 'Buscar documentos guardados',
  sharePdf: 'Compartir como PDF', deleteDoc: 'Borrar este documento', deleteConfirm: 'Sí, borrar', deleteHelp: 'Se borra para siempre.',
  cancel: 'Cancelar', loading: 'Cargando…', failed: 'No se pudo cargar. Revisa tu conexión e inténtalo de nuevo.', retry: 'Intentar de nuevo',
  billTo: 'Cliente', job: 'Trabajo', workOrder: 'Orden de trabajo', issued: 'Emitido', paidOn: 'Pagado', signed: 'Firmado', declined: 'Rechazado',
  qty: 'Cant.', price: 'Precio', amount: 'Importe', excluded: 'No incluido',
  labor: 'Mano de obra', materials: 'Materiales', subtotal: 'Subtotal', tax: 'Impuesto', total: 'Total', paid: 'Pagado', due: 'Saldo pendiente',
  payments: 'Pagos', signatures: 'Firmas', signedBy: 'Firmado por %{name}', fingerprint: 'Huella del documento',
  change: 'Cambio', base: 'Antes de este cambio', newTotal: 'Nuevo total', description: 'Descripción',
  cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', bank: 'Banco', wallet: 'Apple Pay / Google Pay', other: 'Otro',

  menu: 'Filtros y más', filters: 'Filtrar trabajos', clear: 'Quitar filtros',
  customer: 'Cliente', person: 'Asignado a', trade: 'Oficio', jobType: 'Tipo de trabajo', unassigned: 'Nadie',
  any: 'Todos', showing: 'Mostrando %{count} de %{total}',
  aiSearch: 'Buscar con KILN', aiSearchHint: 'Como "reparar lavabo" o "terraza"', aiFind: 'Buscar', aiFinding: 'Buscando…',
  aiFound: 'KILN encontró %{count} trabajos para "%{query}"', aiNone: 'KILN no encontró trabajos para "%{query}"', aiOff: 'Inicia sesión para buscar con KILN.',
};

export type CleanupText = typeof en;
export const cleanupText = (lang: 'en' | 'es'): CleanupText => (lang === 'es' ? es : en);
