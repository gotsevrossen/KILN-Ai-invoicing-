/** Text for the KILN chat (app/assistant.tsx). The off-topic answer comes from the server. */
const en = {
  title: 'KILN', open: 'Ask KILN', talk: 'Talk to KILN',
  aboutJob: 'About this job', allJobs: 'Talk about all jobs instead', placeholderJob: 'Ask about this job…',
  helloJob: 'Hi! I’m looking at %{job}. Ask me about it, or tell me what to do. For example: “Log 2 hours”, “Add a trip fee” or “Build the invoice”.', addMenu: 'Add or ask KILN', closeMenu: 'Close', placeholder: 'Ask or tell KILN…',
  hello: 'Hi! Ask me about your jobs, or tell me what to do. For example: “Log 2 hours on the Smith job and send the invoice”, “Who owes me money?” or “Wrap up my day”.',
  speak: 'Talk instead of typing', stopListening: 'Stop listening', listening: 'Listening…', send: 'Send', thinking: 'KILN is thinking…', clear: 'New chat', exampleMode: 'Sign in to chat with KILN. It reads your own jobs, so it needs your account.',
  crewOnly: 'The KILN chat is for owners and managers for now.', failed: 'KILN could not answer. Check your connection and try again.',
  planTitle: 'KILN will', doIt: 'Do it', cancel: 'Cancel', cancelled: 'Cancelled. Nothing was changed.', whichJob: 'Which job?', price: 'Price',
  removeStep: 'Remove this step', needsAnswers: 'Pick a job and fill in any price first.', done: 'Done', openStep: 'Open',
  stepFailed: 'Could not do this', notSent: 'Send the invoice first.', alreadyPaid: 'This invoice is already paid.',
  noLabor: 'Your price list has no hourly Labor item.',
  steps: {
    hours: 'Log %{hours} h', work: 'Add work: %{what}', note: 'Save note', invoice: 'Build the invoice', invoiceSend: 'Build the invoice and send it (you check it first)',
    estimate: 'Open the estimate', estimateSend: 'Send the estimate (you check it first)', cashPaid: 'Record %{amount} paid outside KILN (you confirm)',
    laborRate: 'Change your labor rate to %{amount}/h', newJob: 'New job for %{customer}', changeOrder: 'Change order: %{what}',
    sortPersonal: 'Mark %{item} as personal', sortOverhead: 'Mark %{item} as overhead', sortJob: 'Put %{item} on a job', remind: 'Send a payment reminder (you check it first)',
  },
  rateTitle: 'Change your labor rate?', rateBody: 'From %{from} to %{to} an hour. New jobs use the new rate; jobs you already have keep theirs.',
  rateYes: 'Change to %{to}/h',
  review: 'KILN built this. Does it look good?', reviewSend: 'Looks good, send to %{name}', reviewEdit: 'Edit first', reviewFix: 'Fix the items above first, then send.',
};
const es: typeof en = {
  title: 'KILN', open: 'Pregunta a KILN', talk: 'Habla con KILN',
  aboutJob: 'Sobre este trabajo', allJobs: 'Hablar de todos los trabajos', placeholderJob: 'Pregunta por este trabajo…',
  helloJob: '¡Hola! Estoy viendo %{job}. Pregúntame por él o dime qué hacer. Por ejemplo: “Registra 2 horas”, “Agrega un cargo por visita” o “Prepara la factura”.', addMenu: 'Agregar o preguntar a KILN', closeMenu: 'Cerrar', placeholder: 'Pregunta o pide a KILN…',
  hello: '¡Hola! Pregúntame por tus trabajos o dime qué hacer. Por ejemplo: “Registra 2 horas en el trabajo de Smith y envía la factura”, “¿Quién me debe dinero?” o “Cierra mi día”.',
  speak: 'Hablar en vez de escribir', stopListening: 'Dejar de escuchar', listening: 'Escuchando…', send: 'Enviar', thinking: 'KILN está pensando…', clear: 'Chat nuevo', exampleMode: 'Inicia sesión para hablar con KILN. Lee tus propios trabajos, así que necesita tu cuenta.',
  crewOnly: 'Por ahora el chat de KILN es para propietarios y encargados.', failed: 'KILN no pudo responder. Revisa tu conexión e inténtalo de nuevo.',
  planTitle: 'KILN va a', doIt: 'Hacerlo', cancel: 'Cancelar', cancelled: 'Cancelado. No se cambió nada.', whichJob: '¿Qué trabajo?', price: 'Precio',
  removeStep: 'Quitar este paso', needsAnswers: 'Elige un trabajo y escribe los precios que falten.', done: 'Hecho', openStep: 'Abrir',
  stepFailed: 'No se pudo hacer', notSent: 'Primero envía la factura.', alreadyPaid: 'Esta factura ya está pagada.',
  noLabor: 'Tu lista de precios no tiene Mano de obra por hora.',
  steps: {
    hours: 'Registrar %{hours} h', work: 'Agregar trabajo: %{what}', note: 'Guardar nota', invoice: 'Preparar la factura', invoiceSend: 'Preparar la factura y enviarla (la revisas antes)',
    estimate: 'Abrir el presupuesto', estimateSend: 'Enviar el presupuesto (lo revisas antes)', cashPaid: 'Registrar %{amount} pagado fuera de KILN (tú confirmas)',
    laborRate: 'Cambiar tu tarifa a %{amount}/h', newJob: 'Trabajo nuevo para %{customer}', changeOrder: 'Orden de cambio: %{what}',
    sortPersonal: 'Marcar %{item} como personal', sortOverhead: 'Marcar %{item} como gasto general', sortJob: 'Poner %{item} en un trabajo', remind: 'Enviar un recordatorio de pago (lo revisas antes)',
  },
  rateTitle: '¿Cambiar tu tarifa?', rateBody: 'De %{from} a %{to} por hora. Los trabajos nuevos usan la tarifa nueva; los que ya tienes conservan la suya.',
  rateYes: 'Cambiar a %{to}/h',
  review: 'KILN preparó esto. ¿Se ve bien?', reviewSend: 'Se ve bien, enviar a %{name}', reviewEdit: 'Editar primero', reviewFix: 'Corrige lo de arriba y luego envía.',
};
export const assistantCopy = { en, es };
export const fillIn = (text: string, values: Record<string, string>) => text.replace(/%\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
