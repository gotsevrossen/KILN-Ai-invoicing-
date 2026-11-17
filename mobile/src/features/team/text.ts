// Team screens' words, in English and Spanish. The Spanish object must have every English key.
const en = {
  // common
  loading: 'Loading…', retry: 'Try again', cancel: 'Cancel', save: 'Save', saving: 'Saving…', saved: 'Saved.', done: 'Done',
  signOut: 'Sign out', you: 'You', someone: 'Someone', remove: 'Remove', close: 'Close',
  owner: 'Owner', manager: 'Manager', crew: 'Crew member',
  managerHelp: 'Runs jobs, estimates, invoices and the price list. Can invite crew.',
  crewHelp: 'Works on jobs assigned to them: work done, hours, photos and notes. No invoices or estimates.',

  // joining
  joinTitle: 'Join a team', joinHelp: 'Type the invite code you were sent. It looks like KILN-7K4P-2QXM-9TRB.',
  code: 'Invite code', join: 'Join', badCode: 'Check the code: it has 12 letters and numbers after KILN.',
  invalidInvite: "This code doesn't work anymore. Ask for a new one.",
  accountHasBusiness: 'This account already belongs to a business. Sign out and make a new account with another email to join.',
  signInFirst: 'Sign in or create your own account first. Then enter your code.', signIn: 'Sign in or create account',
  invited: 'I was invited to a team',
  waitingTitle: 'Waiting for approval', waitingBody: 'You asked to join %{business}. You can start as soon as the owner or a manager approves you.',
  checkAgain: 'Check again', cancelRequest: 'Cancel my request',

  // team tab
  teamTitle: 'Team', invite: 'Invite someone', needsApproval: 'Waiting for your approval', approve: 'Approve', decline: 'Decline',
  people: 'People', lastActive: 'Last upload %{when}', noActivity: 'Nothing uploaded yet', openJobs: '%{count} open jobs',
  invites: 'Codes not used yet', cancelInvite: 'Cancel code', expires: 'Expires %{date}',
  schedule: 'Schedule and pay rates', noPeople: 'Nobody has joined yet. Invite your crew with a code.',
  review: 'To check', newItem: 'New price item from %{name}', noPrice: 'No price', looksGood: 'Looks good', editPrices: 'Edit prices',
  changeFrom: 'Change suggested by %{name}', openJob: 'Open job', markDone: 'Handled', dismiss: 'Dismiss',
  failed: "Team couldn't load. Check your connection and try again.",

  // invite sheet
  inviteTitle: 'Invite someone', theirName: 'Their name', role: 'Role', makeCode: 'Make invite code',
  codeReady: 'Send this code to %{name}. It works once and expires in 7 days. You approve them after they enter it.',
  send: 'Send code', shareMessage: 'Join %{business} on KILN. Install KILN, tap "I was invited to a team" and enter this code: %{code}',
  badName: 'Type their name.',

  // person page
  assigned: 'Assigned jobs', assign: 'Assign jobs', notAssigned: 'Not on any jobs yet.', managerSeesAll: 'Managers see every job.',
  activity: 'What they added', nothingYet: 'Nothing added yet.', makeManager: 'Make manager', makeCrew: 'Make crew member',
  removePerson: 'Remove from team', removeConfirm: 'Yes, remove', removeHelp: 'They lose access right away. What they added stays on the jobs.',
  notOnTeam: 'This person is no longer on the team.',
  photo: 'Photo', note: 'Note', hours: '%{hours} h', work: 'Work done', onJob: 'on %{job}',

  // job page
  assignedTo: 'Assigned to', nobody: 'Nobody assigned', whoWorks: 'Who works on this job?', noCrew: 'Invite crew members on the Team tab first.',

  // settings
  teamSection: 'Team', hasTeam: 'I have a team', hasTeamHelp: 'Shows the Team tab, where you invite your crew and see what they add.',
  crewPrices: 'Crew see prices', crewPricesHelp: 'Crew see prices on estimates, invoices and the price list.',
  managerCosts: 'Managers see pay and profit', managerCostsHelp: 'Managers see pay rates, labor costs and job profit.',
  ownerOnly: 'Only the owner can change this.', leaveTeam: 'Leave this team', leaveConfirm: 'Yes, leave', leaveHelp: 'You lose access to this business right away.',

  // setup
  teamQuestion: 'Do you work alone or with a team?', alone: 'Just me', withTeam: 'Me and a team',
  teamQuestionHelp: 'With a team you get a Team tab to invite workers and see what they do. You can change this later in Settings.',

  // crew
  hello: 'Hi %{name}', yourJobs: 'Your jobs', noJobs: 'No jobs assigned yet. Ask the office to assign your next job.',
  jobs: 'Jobs', home: 'Home', capture: 'Add', settings: 'Settings', pickJob: 'Which job?',
  call: 'Call', text: 'Text', officeNote: 'Note from the office', agreed: 'What the customer agreed to',
  details: 'Details', exclusions: 'Not included', closed: 'Invoice sent: this job is closed.',
  addWork: 'Work done', addHours: 'Hours', addNote: 'Note', takePhoto: 'Take photo', choosePhotos: 'Choose photos',
  suggest: 'Suggest a change', suggestHelp: 'Describe what the customer asked for. The office prices it and sends it.',
  suggestion: 'What changed?', sent: 'Sent to the office.', estimate: 'Estimate %{number}', invoice: 'Invoice %{number}',
  signed: 'Signed', notSigned: 'Not signed yet', notSent: 'Not sent yet', paid: 'Paid', unpaid: 'Not paid yet', excluded: 'Not included',
  pricesHidden: 'Prices are shown only to the office.', photos: 'Photos', notes: 'Notes', hoursTitle: 'Hours', workTitle: 'Work done',
  changes: 'Suggested changes', hoursField: 'Hours worked', noteField: 'Note', badHours: 'Enter between 0.01 and 24 hours.',
  badNote: 'Write something first.', pickItem: 'Pick from the price list', needsPrice: 'Needs a price from the office',
  qty: 'How many', badQty: 'Enter a number above zero.', addItem: 'Add a new item to the price list', itemName: 'Item name',
  unit: 'Charged by', price: 'Price (optional)', itemAdded: 'Added. The office will check it.', badItem: 'Type a name and a valid price.',
  stage: 'Photo stage', before: 'Before', during: 'During', after: 'After', photosSaved: 'Photos saved.',
  cameraDenied: 'Allow camera access in your phone settings, then try again.',
  pendingPhotos: "Some photos didn't upload. Keep this page open and try again when you have signal.", retryPhotos: 'Try photos again',
  language: 'Language', theme: 'Look',
};

const es: Record<keyof typeof en, string> = {
  loading: 'Cargando…', retry: 'Intentar de nuevo', cancel: 'Cancelar', save: 'Guardar', saving: 'Guardando…', saved: 'Guardado.', done: 'Listo',
  signOut: 'Cerrar sesión', you: 'Tú', someone: 'Alguien', remove: 'Quitar', close: 'Cerrar',
  owner: 'Dueño', manager: 'Encargado', crew: 'Miembro del equipo',
  managerHelp: 'Maneja trabajos, presupuestos, facturas y la lista de precios. Puede invitar al equipo.',
  crewHelp: 'Trabaja en los trabajos asignados: trabajo hecho, horas, fotos y notas. Sin facturas ni presupuestos.',

  joinTitle: 'Unirse a un equipo', joinHelp: 'Escribe el código de invitación que te enviaron. Se ve así: KILN-7K4P-2QXM-9TRB.',
  code: 'Código de invitación', join: 'Unirme', badCode: 'Revisa el código: tiene 12 letras y números después de KILN.',
  invalidInvite: 'Este código ya no funciona. Pide uno nuevo.',
  accountHasBusiness: 'Esta cuenta ya pertenece a un negocio. Cierra sesión y crea otra cuenta con otro correo para unirte.',
  signInFirst: 'Primero inicia sesión o crea tu propia cuenta. Luego escribe tu código.', signIn: 'Iniciar sesión o crear cuenta',
  invited: 'Me invitaron a un equipo',
  waitingTitle: 'Esperando aprobación', waitingBody: 'Pediste unirte a %{business}. Puedes empezar en cuanto el dueño o un encargado te apruebe.',
  checkAgain: 'Revisar de nuevo', cancelRequest: 'Cancelar mi solicitud',

  teamTitle: 'Equipo', invite: 'Invitar a alguien', needsApproval: 'Esperan tu aprobación', approve: 'Aprobar', decline: 'Rechazar',
  people: 'Personas', lastActive: 'Último envío %{when}', noActivity: 'Todavía no ha subido nada', openJobs: '%{count} trabajos abiertos',
  invites: 'Códigos sin usar', cancelInvite: 'Cancelar código', expires: 'Vence %{date}',
  schedule: 'Agenda y pagos', noPeople: 'Nadie se ha unido todavía. Invita a tu equipo con un código.',
  review: 'Para revisar', newItem: 'Artículo nuevo de %{name}', noPrice: 'Sin precio', looksGood: 'Está bien', editPrices: 'Editar precios',
  changeFrom: 'Cambio sugerido por %{name}', openJob: 'Abrir trabajo', markDone: 'Atendido', dismiss: 'Descartar',
  failed: 'No se pudo cargar el equipo. Revisa tu conexión e inténtalo de nuevo.',

  inviteTitle: 'Invitar a alguien', theirName: 'Su nombre', role: 'Puesto', makeCode: 'Crear código de invitación',
  codeReady: 'Envía este código a %{name}. Sirve una vez y vence en 7 días. Lo apruebas después de que lo escriba.',
  send: 'Enviar código', shareMessage: 'Únete a %{business} en KILN. Instala KILN, toca "Me invitaron a un equipo" y escribe este código: %{code}',
  badName: 'Escribe su nombre.',

  assigned: 'Trabajos asignados', assign: 'Asignar trabajos', notAssigned: 'Todavía no está en ningún trabajo.', managerSeesAll: 'Los encargados ven todos los trabajos.',
  activity: 'Lo que agregó', nothingYet: 'Todavía no ha agregado nada.', makeManager: 'Hacer encargado', makeCrew: 'Hacer miembro del equipo',
  removePerson: 'Quitar del equipo', removeConfirm: 'Sí, quitar', removeHelp: 'Pierde el acceso de inmediato. Lo que agregó se queda en los trabajos.',
  notOnTeam: 'Esta persona ya no está en el equipo.',
  photo: 'Foto', note: 'Nota', hours: '%{hours} h', work: 'Trabajo hecho', onJob: 'en %{job}',

  assignedTo: 'Asignado a', nobody: 'Nadie asignado', whoWorks: '¿Quién trabaja en este trabajo?', noCrew: 'Primero invita a tu equipo en la pestaña Equipo.',

  teamSection: 'Equipo', hasTeam: 'Tengo un equipo', hasTeamHelp: 'Muestra la pestaña Equipo, donde invitas a tu equipo y ves lo que agregan.',
  crewPrices: 'El equipo ve precios', crewPricesHelp: 'El equipo ve precios en presupuestos, facturas y la lista de precios.',
  managerCosts: 'Los encargados ven pagos y ganancias', managerCostsHelp: 'Los encargados ven tarifas de pago, costos de mano de obra y ganancias.',
  ownerOnly: 'Solo el dueño puede cambiar esto.', leaveTeam: 'Salir de este equipo', leaveConfirm: 'Sí, salir', leaveHelp: 'Pierdes el acceso a este negocio de inmediato.',

  teamQuestion: '¿Trabajas solo o con un equipo?', alone: 'Solo yo', withTeam: 'Yo y un equipo',
  teamQuestionHelp: 'Con un equipo tienes una pestaña Equipo para invitar trabajadores y ver lo que hacen. Puedes cambiarlo luego en Ajustes.',

  hello: 'Hola, %{name}', yourJobs: 'Tus trabajos', noJobs: 'Todavía no tienes trabajos asignados. Pide a la oficina que te asigne el próximo.',
  jobs: 'Trabajos', home: 'Inicio', capture: 'Agregar', settings: 'Ajustes', pickJob: '¿Qué trabajo?',
  call: 'Llamar', text: 'Mensaje', officeNote: 'Nota de la oficina', agreed: 'Lo que aceptó el cliente',
  details: 'Detalles', exclusions: 'No incluido', closed: 'Factura enviada: este trabajo está cerrado.',
  addWork: 'Trabajo hecho', addHours: 'Horas', addNote: 'Nota', takePhoto: 'Tomar foto', choosePhotos: 'Elegir fotos',
  suggest: 'Sugerir un cambio', suggestHelp: 'Describe lo que pidió el cliente. La oficina le pone precio y lo envía.',
  suggestion: '¿Qué cambió?', sent: 'Enviado a la oficina.', estimate: 'Presupuesto %{number}', invoice: 'Factura %{number}',
  signed: 'Firmado', notSigned: 'Sin firmar', notSent: 'Sin enviar', paid: 'Pagada', unpaid: 'Sin pagar', excluded: 'No incluido',
  pricesHidden: 'Los precios solo los ve la oficina.', photos: 'Fotos', notes: 'Notas', hoursTitle: 'Horas', workTitle: 'Trabajo hecho',
  changes: 'Cambios sugeridos', hoursField: 'Horas trabajadas', noteField: 'Nota', badHours: 'Escribe entre 0.01 y 24 horas.',
  badNote: 'Escribe algo primero.', pickItem: 'Elegir de la lista de precios', needsPrice: 'Necesita precio de la oficina',
  qty: 'Cuántos', badQty: 'Escribe un número mayor que cero.', addItem: 'Agregar un artículo nuevo a la lista', itemName: 'Nombre del artículo',
  unit: 'Se cobra por', price: 'Precio (opcional)', itemAdded: 'Agregado. La oficina lo revisará.', badItem: 'Escribe un nombre y un precio válido.',
  stage: 'Etapa de la foto', before: 'Antes', during: 'Durante', after: 'Después', photosSaved: 'Fotos guardadas.',
  cameraDenied: 'Permite el acceso a la cámara en los ajustes del teléfono e inténtalo de nuevo.',
  pendingPhotos: 'Algunas fotos no se subieron. Deja esta página abierta e inténtalo de nuevo cuando tengas señal.', retryPhotos: 'Reintentar fotos',
  language: 'Idioma', theme: 'Apariencia',
};

export type TeamText = typeof en;
export const teamText = (lang: 'en' | 'es'): TeamText => (lang === 'es' ? es : en);

/** Fills %{name} style blanks. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/%\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
