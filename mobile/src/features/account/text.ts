// Words for Settings → Business details and My account, in English and Spanish.
// The Spanish object must have every English key.
const en = {
  // business details
  businessTitle: 'Business details', businessHelp: 'Your customers see these on estimates, invoices and pay pages.',
  editBusiness: 'Edit business details', businessName: 'Business name', businessPhone: 'Business phone',
  businessEmail: 'Business email', businessAddress: 'Mailing address', ownerOnly: 'Only the owner can change the business details.',

  // my account
  accountTitle: 'My account', accountHelp: 'Your own sign-in and contact details.',
  yourName: 'Your name', yourPhone: 'Your phone', saveDetails: 'Save', saving: 'Saving…', saved: 'Saved.',
  signInEmail: 'Sign-in email', newEmail: 'New email', changeEmail: 'Change email',
  emailSent: 'Check %{email} for a link to confirm the change. Until then you sign in with your current email.',
  emailSame: 'That is already your sign-in email.',
  password: 'Password', currentPassword: 'Current password', newPassword: 'New password', repeatPassword: 'New password again',
  changePassword: 'Change password', passwordChanged: 'Your password was changed.',
  passwordRule: 'At least 8 characters, with letters and numbers.', passwordsDiffer: "The new passwords don't match.",
  wrongPassword: "That isn't your current password.", noPassword: 'You sign in with Apple or Google, so there is no KILN password to change.',

  // checks
  needName: 'Type a name.', badEmail: 'Type a full email address, like name@example.com.',
};

const es: Record<keyof typeof en, string> = {
  businessTitle: 'Datos del negocio', businessHelp: 'Tus clientes los ven en presupuestos, facturas y páginas de pago.',
  editBusiness: 'Editar datos del negocio', businessName: 'Nombre del negocio', businessPhone: 'Teléfono del negocio',
  businessEmail: 'Correo del negocio', businessAddress: 'Dirección postal', ownerOnly: 'Solo el dueño puede cambiar los datos del negocio.',

  accountTitle: 'Mi cuenta', accountHelp: 'Tus propios datos de inicio de sesión y contacto.',
  yourName: 'Tu nombre', yourPhone: 'Tu teléfono', saveDetails: 'Guardar', saving: 'Guardando…', saved: 'Guardado.',
  signInEmail: 'Correo para iniciar sesión', newEmail: 'Correo nuevo', changeEmail: 'Cambiar correo',
  emailSent: 'Revisa %{email} para confirmar el cambio con el enlace. Hasta entonces inicias sesión con tu correo actual.',
  emailSame: 'Ese ya es tu correo para iniciar sesión.',
  password: 'Contraseña', currentPassword: 'Contraseña actual', newPassword: 'Contraseña nueva', repeatPassword: 'Repite la contraseña nueva',
  changePassword: 'Cambiar contraseña', passwordChanged: 'Tu contraseña se cambió.',
  passwordRule: 'Al menos 8 caracteres, con letras y números.', passwordsDiffer: 'Las contraseñas nuevas no coinciden.',
  wrongPassword: 'Esa no es tu contraseña actual.', noPassword: 'Inicias sesión con Apple o Google, así que no hay contraseña de KILN que cambiar.',

  needName: 'Escribe un nombre.', badEmail: 'Escribe un correo completo, como nombre@ejemplo.com.',
};

export type AccountText = typeof en;
export const accountText = (lang: 'en' | 'es'): AccountText => (lang === 'es' ? es : en);

/** Same shape the server accepts (businesses and customers). */
export const emailOk = (email: string) => email.length <= 254 && /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(email);
/** Same rule as sign-up: 8+ characters with letters and numbers. */
export const passwordOk = (password: string) => password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
