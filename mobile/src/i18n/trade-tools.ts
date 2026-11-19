const en = {
  title: 'Trade worksheets', paint: 'Rooms and surfaces', electrical: 'Electrical completion records',
  help: 'Optional. Feet for lengths, square feet for openings.',
  room: 'Room / area', surface: 'Surface', width: 'Width (ft)', height: 'Height (ft)', openings: 'Openings (sq ft)', coats: 'Coats', coverage: 'Coverage (sq ft / gallon / coat)',
  addSurface: 'Keep surface', remove: 'Remove', area: 'Net area', gallons: 'Paint allowance (gallons)',
  rate: 'Choose your square-foot rate', rateHelp: 'The rate must cover prep and all coats. Paint amount is an estimate.',
  review: 'I checked the measurements, prep, coats and owner prices', addEstimate: 'Add reviewed surfaces to estimate', added: 'Lines added. Review the estimate before sending.', locked: 'This estimate is issued or signed. Start a change order for extra work.',
  spec: 'Prep and finish specification', name: 'Template name', prep: 'Preparation / protection', finish: 'Product, color, sheen and coats', exclusions: 'Exclusions', saveTemplate: 'Save reusable specification', useTemplate: 'Use specification', applyScope: 'Append specification to estimate scope',
  save: 'Save worksheet', saved: 'Saved on server', exampleSaved: 'Kept for this example session', retry: 'Retry loading', error: 'Could not save or load. Keep this page open and try again when connected.', invalid: 'Check the required fields and measurements.', loading: 'Loading saved records…', unsaved: 'Changes stay on this page until you save. Save before leaving.',
  circuit: 'Circuit / equipment', test: 'Test / check performed', measured: 'Measured value, units and conditions', technician: 'Person performing check', date: 'Date (YYYY-MM-DD)', permit: 'Permit reference', inspection: 'Inspection status / reference', notes: 'Notes / unresolved issues', pass: 'Pass', fail: 'Fail', not_tested: 'Not tested', keepRecord: 'Keep completion record',
  warning: 'Owner records only; this is not a compliance certificate. A pass is your recorded result, not certification by KILN. Record outstanding failures and inspection requirements.',
  photos: 'Link job photo records', handover: 'Share customer handover', shareReview: 'Private notes aren’t included. Photos aren’t attached.', handoverTitle: 'Electrical work handover', noRecords: 'No electrical records yet.', result: 'Result', photoRefs: 'Photo references', empty: 'No surfaces yet.', templateSaved: 'Specification saved', scopeAdded: 'Specification appended to the draft scope',
};
const es: Record<keyof typeof en, string> = {
  title: 'Hojas por oficio', paint: 'Habitaciones y superficies', electrical: 'Registros de finalización eléctrica',
  help: 'Opcional. Pies para medidas, pies cuadrados para aberturas.',
  room: 'Habitación / área', surface: 'Superficie', width: 'Ancho (pies)', height: 'Alto (pies)', openings: 'Aberturas (pies²)', coats: 'Capas', coverage: 'Rendimiento (pies² / galón / capa)',
  addSurface: 'Guardar superficie', remove: 'Quitar', area: 'Área neta', gallons: 'Pintura estimada (galones)',
  rate: 'Elige tu tarifa por pie cuadrado', rateHelp: 'La tarifa debe cubrir preparación y todas las capas. La pintura es un cálculo aproximado.',
  review: 'Revisé las medidas, preparación, capas y mis precios', addEstimate: 'Agregar superficies revisadas al presupuesto', added: 'Líneas agregadas. Revisa el presupuesto antes de enviarlo.', locked: 'El presupuesto ya fue emitido o firmado. Crea una orden de cambio para trabajo adicional.',
  spec: 'Especificación de preparación y acabado', name: 'Nombre de plantilla', prep: 'Preparación / protección', finish: 'Producto, color, brillo y capas', exclusions: 'Exclusiones', saveTemplate: 'Guardar especificación reutilizable', useTemplate: 'Usar especificación', applyScope: 'Añadir especificación al alcance del presupuesto',
  save: 'Guardar hoja', saved: 'Guardado en el servidor', exampleSaved: 'Guardado para esta sesión de ejemplo', retry: 'Reintentar carga', error: 'No se pudo guardar o cargar. Mantén esta página abierta e inténtalo al conectarte.', invalid: 'Revisa los campos obligatorios y las medidas.', loading: 'Cargando registros…', unsaved: 'Los cambios quedan en esta página hasta guardarlos. Guarda antes de salir.',
  circuit: 'Circuito / equipo', test: 'Prueba / revisión realizada', measured: 'Valor medido, unidades y condiciones', technician: 'Persona que realizó la revisión', date: 'Fecha (AAAA-MM-DD)', permit: 'Referencia del permiso', inspection: 'Estado / referencia de inspección', notes: 'Notas / problemas pendientes', pass: 'Aprobado', fail: 'No aprobado', not_tested: 'Sin probar', keepRecord: 'Guardar registro de finalización',
  warning: 'Solo registros del propietario; no es un certificado de cumplimiento. Aprobado es tu resultado registrado, no una certificación de KILN. Anota fallas pendientes y requisitos de inspección.',
  photos: 'Vincular registros de fotos del trabajo', handover: 'Compartir entrega al cliente', shareReview: 'No incluye notas privadas. Las fotos no se adjuntan.', handoverTitle: 'Entrega de trabajo eléctrico', noRecords: 'Aún no hay registros eléctricos.', result: 'Resultado', photoRefs: 'Referencias de fotos', empty: 'Aún no hay superficies.', templateSaved: 'Especificación guardada', scopeAdded: 'Especificación añadida al borrador del alcance',
};
export const tradeToolsCopy = { en, es };
