// KILN's Privacy Policy, English and Spanish. Facts in {braces} come from details.ts.
// Keep this matching what KILN really does: update it when KILN collects or shares something new.

import type { LegalDoc } from './details';

export const privacy: Record<'en' | 'es', LegalDoc> = {
  en: {
    title: 'Privacy Policy',
    intro: [
      'KILN is an invoicing app for small trades businesses. It is run by {owner}, an individual in the United States ("KILN", "we", "us"). This policy explains what information KILN collects, how it is used and shared, how long it is kept, and the choices you have. Questions: {email}.',
    ],
    sections: [
      { heading: 'Who this covers', body: [
        'Business owners, managers and crew members who use the KILN app or website ("you").',
        'The customers of those businesses: people whose details a business enters into KILN, or who open a KILN link to view, sign or pay an estimate, change order or invoice. The business that sent you the document decides what it records about you, and KILN handles it on that business’s behalf. Please contact that business first; you can also contact us.',
      ] },
      { heading: 'What we collect', body: [
        '• Your account: your name, email, phone number (optional), and either a password (kept only as a secure, one-way scrambled value by our sign-in provider) or the identifier Apple or Google gives us when you sign in with them.',
        '• Business details: the business name, phone, email, mailing address, trades, price list, settings, and the terms and warranty text you add.',
        '• Work records you enter: customers (names, phone numbers, emails, addresses and preferred language), jobs, private notes, notes, hours, work done, estimates, change orders, invoices, receipts and their items.',
        '• Photos: job photos you take or choose. Before upload, KILN saves each photo again so the file itself carries no location. Where and when it was taken is stored separately and shown to a customer only if the business turns that on.',
        '• Voice: your phone’s own speech recognition turns what you say into text. KILN keeps the text, never the recording.',
        '• Signatures: the signer’s name, their drawn signature, the time, the network (IP) address, device information, and a fingerprint of the signed document, to show exactly what was signed.',
        '• Payments: when a customer pays through a KILN link, they enter their payment details with Stripe. KILN receives the amount and status, never full card or bank account numbers. Owners connect their own Stripe account; KILN keeps its identifier and status.',
        '• Subscriptions: if you subscribe to KILN, Apple or Google takes the payment. KILN (through RevenueCat) receives your plan, its status and its dates, not your card.',
        '• Technical information needed to run and protect KILN: times, request types, error codes, and how much of KILN’s AI each person used (counts only). We do not log what you ask KILN’s AI.',
        '• Face ID and fingerprints are handled entirely by your phone. KILN never receives them.',
        'KILN has no advertising, no advertising trackers and no third-party analytics, and it does not track your location in the background.',
      ] },
      { heading: 'How we use it', body: [
        'To provide KILN: building and sending your documents, customer links, collecting payments, keeping your team in sync, and the AI helpers. To keep KILN secure and prevent abuse (for example daily AI limits). To answer you when you contact us. To meet legal obligations.',
        'We do not sell personal information, and we do not share it for advertising.',
      ] },
      { heading: 'KILN’s AI helpers', body: [
        'When you use an AI helper (for example reading a receipt, suggesting forgotten items, or the KILN chat), the text, photos or receipt images that helper needs are sent to Anthropic, the maker of Claude, to produce a draft. Anthropic’s terms for this service do not allow it to use that information to train its models.',
        'Prices are never sent for the AI to guess. Every draft is checked before you see it, and nothing is saved, sent or charged until you approve it. Private notes are never used to write anything a customer sees.',
      ] },
      { heading: 'Who we share it with', body: [
        'Only with companies that run parts of KILN for us, and only for that purpose:',
        '• Supabase: database, file storage and sign-in, on servers in the United States.',
        '• Anthropic: the AI helpers.',
        '• Stripe: customer payments and each owner’s own payment account.',
        '• Apple and Google: app distribution, Sign in with Apple and Google, subscriptions, and on-device speech recognition.',
        '• RevenueCat: subscription status.',
        '• Expo: hosting for KILN’s web pages, such as customer links.',
        'Also: the customers you choose to send documents to; your team members, according to their role (crew members do not see prices or payments); anyone we must share with by law, or to protect people’s rights and safety; and a buyer of KILN, if that ever happens, after telling you.',
      ] },
      { heading: 'Customer links', body: [
        'Customer links are private, hard to guess, open only one document, and expire. KILN keeps only a scrambled version of each link’s code. Private notes never appear on customer pages.',
      ] },
      { heading: 'How long we keep it', body: [
        'As long as the account is open, with these exceptions: a job is deleted 30 days after it’s fully paid (the business can keep copies of its sent documents); a deleted account is erased 30 days after the request (see below). Backup copies may last a short time longer before they are overwritten. Technical logs are kept only as long as needed to run and protect KILN.',
      ] },
      { heading: 'Deleting your account', body: [
        'In the app: Settings → Delete my account. On the web: {web}/delete-account. Or email {email}.',
        'If you own the business, everything goes with your account: jobs, customers, documents, photos, receipts, payment records, and your team’s access. If you are a manager or crew member, only your own login is deleted; the work you did stays with the business.',
        'You have 30 days to change your mind: sign in again and tap “Keep my account”. After that it is erased for good. Deleting your account does not cancel an App Store or Google Play subscription; cancel it in your store’s settings. Save copies of any documents you need for your records first.',
      ] },
      { heading: 'Your choices and rights', body: [
        'You can see and correct your information in the app, save your documents as PDFs, and delete your account at any time. Depending on where you live (for example California and other US states, or the EU and UK), you may also have the right to know what we hold about you, get a copy, correct it, delete it, or opt out of its sale or sharing for advertising (we do neither). To use any of these rights, email {email}. We will answer within the time the law requires and will not treat you differently for asking.',
      ] },
      { heading: 'Security', body: [
        'Connections are encrypted. Database rules keep each business’s information visible only to that business, and its team only sees what their role allows. Keys stay on our servers, never in the app. Your saved sign-in is encrypted on your phone, and KILN can be locked with Face ID or a fingerprint. No system is perfectly secure; if you find a problem, please tell us at {email}.',
      ] },
      { heading: 'Children', body: [
        'KILN is for businesses and people 18 or older. It is not meant for children, and we do not knowingly collect children’s information. If you believe a child’s information is in KILN, contact us and we will delete it.',
      ] },
      { heading: 'Changes to this policy', body: [
        'When this policy changes, we update the date at the top. If a change is important, we will also tell you in the app before it takes effect.',
      ] },
      { heading: 'Contact', body: ['{owner} · {email}'] },
    ],
  },
  es: {
    title: 'Política de privacidad',
    intro: [
      'KILN es una app de facturación para pequeños negocios de oficios. La administra {owner}, una persona en los Estados Unidos ("KILN", "nosotros"). Esta política explica qué información recopila KILN, cómo se usa y comparte, cuánto tiempo se guarda y qué opciones tienes. Preguntas: {email}.',
    ],
    sections: [
      { heading: 'A quién aplica', body: [
        'A los dueños, gerentes y miembros del equipo de los negocios que usan la app o el sitio web de KILN ("tú").',
        'A los clientes de esos negocios: personas cuyos datos un negocio ingresa en KILN, o que abren un enlace de KILN para ver, firmar o pagar un presupuesto, una orden de cambio o una factura. El negocio que te envió el documento decide qué registra sobre ti, y KILN lo maneja en nombre de ese negocio. Comunícate primero con ese negocio; también puedes escribirnos.',
      ] },
      { heading: 'Qué recopilamos', body: [
        '• Tu cuenta: tu nombre, correo, teléfono (opcional) y una contraseña (guardada solo como un valor cifrado de una sola vía por nuestro proveedor de inicio de sesión) o el identificador que Apple o Google nos da cuando inicias sesión con ellos.',
        '• Datos del negocio: nombre, teléfono, correo, dirección postal, oficios, lista de precios, ajustes, y los términos y garantías que agregues.',
        '• Registros de trabajo que ingresas: clientes (nombres, teléfonos, correos, direcciones e idioma preferido), trabajos, notas privadas, notas, horas, trabajo hecho, presupuestos, órdenes de cambio, facturas, recibos y sus artículos.',
        '• Fotos: las fotos de trabajos que tomas o eliges. Antes de subirlas, KILN guarda cada foto de nuevo para que el archivo no lleve ubicación. Dónde y cuándo se tomó se guarda aparte y solo se muestra a un cliente si el negocio lo activa.',
        '• Voz: el reconocimiento de voz de tu propio teléfono convierte lo que dices en texto. KILN guarda el texto, nunca la grabación.',
        '• Firmas: el nombre de quien firma, su firma dibujada, la hora, la dirección de red (IP), datos del dispositivo y una huella del documento firmado, para mostrar exactamente qué se firmó.',
        '• Pagos: cuando un cliente paga con un enlace de KILN, ingresa sus datos de pago con Stripe. KILN recibe el monto y el estado, nunca los números completos de tarjeta o cuenta bancaria. Los dueños conectan su propia cuenta de Stripe; KILN guarda su identificador y su estado.',
        '• Suscripciones: si te suscribes a KILN, Apple o Google cobra el pago. KILN (a través de RevenueCat) recibe tu plan, su estado y sus fechas, no tu tarjeta.',
        '• Información técnica necesaria para operar y proteger KILN: horas, tipos de solicitud, códigos de error y cuánto usó cada persona la IA de KILN (solo cantidades). No registramos lo que le preguntas a la IA de KILN.',
        '• Face ID y las huellas digitales los maneja por completo tu teléfono. KILN nunca los recibe.',
        'KILN no tiene publicidad, ni rastreadores publicitarios, ni analítica de terceros, y no sigue tu ubicación en segundo plano.',
      ] },
      { heading: 'Cómo la usamos', body: [
        'Para dar el servicio de KILN: crear y enviar tus documentos, enlaces para clientes, cobrar pagos, mantener a tu equipo al día y las funciones de IA. Para mantener KILN seguro y evitar abusos (por ejemplo, límites diarios de IA). Para responderte cuando nos escribas. Para cumplir obligaciones legales.',
        'No vendemos información personal ni la compartimos para publicidad.',
      ] },
      { heading: 'Las funciones de IA de KILN', body: [
        'Cuando usas una función de IA (por ejemplo, leer un recibo, sugerir artículos olvidados o el chat de KILN), el texto, las fotos o las imágenes de recibos que esa función necesita se envían a Anthropic, la empresa que crea Claude, para producir un borrador. Los términos de Anthropic para este servicio no le permiten usar esa información para entrenar sus modelos.',
        'Nunca se envían precios para que la IA los adivine. Cada borrador se revisa antes de que lo veas, y nada se guarda, envía ni cobra hasta que lo apruebes. Las notas privadas nunca se usan para escribir algo que vea un cliente.',
      ] },
      { heading: 'Con quién la compartimos', body: [
        'Solo con empresas que operan partes de KILN para nosotros, y solo para eso:',
        '• Supabase: base de datos, almacenamiento de archivos e inicio de sesión, en servidores en los Estados Unidos.',
        '• Anthropic: las funciones de IA.',
        '• Stripe: los pagos de clientes y la propia cuenta de pagos de cada dueño.',
        '• Apple y Google: distribución de la app, inicio de sesión con Apple y Google, suscripciones y reconocimiento de voz en el teléfono.',
        '• RevenueCat: el estado de las suscripciones.',
        '• Expo: alojamiento de las páginas web de KILN, como los enlaces para clientes.',
        'Además: los clientes a quienes eliges enviar documentos; los miembros de tu equipo, según su rol (el personal no ve precios ni pagos); quien la ley nos obligue, o para proteger los derechos y la seguridad de las personas; y un comprador de KILN, si eso ocurriera, después de avisarte.',
      ] },
      { heading: 'Enlaces para clientes', body: [
        'Los enlaces para clientes son privados, difíciles de adivinar, abren un solo documento y vencen. KILN guarda solo una versión cifrada del código de cada enlace. Las notas privadas nunca aparecen en las páginas para clientes.',
      ] },
      { heading: 'Cuánto tiempo la guardamos', body: [
        'Mientras la cuenta esté abierta, con estas excepciones: un trabajo se borra 30 días después de pagarse por completo (el negocio puede guardar copias de sus documentos enviados); una cuenta borrada se elimina 30 días después de pedirlo (ver abajo). Las copias de respaldo pueden durar un poco más antes de sobrescribirse. Los registros técnicos se guardan solo el tiempo necesario para operar y proteger KILN.',
      ] },
      { heading: 'Borrar tu cuenta', body: [
        'En la app: Ajustes → Borrar mi cuenta. En la web: {web}/delete-account. O escribe a {email}.',
        'Si eres el dueño del negocio, todo se va con tu cuenta: trabajos, clientes, documentos, fotos, recibos, registros de pagos y el acceso de tu equipo. Si eres gerente o parte del personal, solo se borra tu propio inicio de sesión; el trabajo que hiciste queda con el negocio.',
        'Tienes 30 días para cambiar de opinión: inicia sesión de nuevo y toca “Conservar mi cuenta”. Después se elimina para siempre. Borrar tu cuenta no cancela una suscripción del App Store o Google Play; cancélala en los ajustes de tu tienda. Antes, guarda copias de los documentos que necesites para tus registros.',
      ] },
      { heading: 'Tus opciones y derechos', body: [
        'Puedes ver y corregir tu información en la app, guardar tus documentos en PDF y borrar tu cuenta cuando quieras. Según dónde vivas (por ejemplo, California y otros estados de EE. UU., o la UE y el Reino Unido), también puedes tener derecho a saber qué guardamos sobre ti, obtener una copia, corregirla, borrarla u oponerte a su venta o uso compartido para publicidad (no hacemos ninguna de las dos). Para usar cualquiera de estos derechos, escribe a {email}. Responderemos en el plazo que exija la ley y no te trataremos distinto por pedirlo.',
      ] },
      { heading: 'Seguridad', body: [
        'Las conexiones están cifradas. Las reglas de la base de datos hacen que la información de cada negocio solo la vea ese negocio, y su equipo solo ve lo que su rol permite. Las claves quedan en nuestros servidores, nunca en la app. Tu sesión guardada está cifrada en tu teléfono, y KILN se puede bloquear con Face ID o huella digital. Ningún sistema es perfectamente seguro; si encuentras un problema, avísanos a {email}.',
      ] },
      { heading: 'Menores', body: [
        'KILN es para negocios y personas de 18 años o más. No está pensado para menores y no recopilamos a sabiendas información de menores. Si crees que hay información de un menor en KILN, escríbenos y la borraremos.',
      ] },
      { heading: 'Cambios a esta política', body: [
        'Cuando esta política cambie, actualizaremos la fecha de arriba. Si el cambio es importante, también te avisaremos en la app antes de que entre en vigor.',
      ] },
      { heading: 'Contacto', body: ['{owner} · {email}'] },
    ],
  },
};
