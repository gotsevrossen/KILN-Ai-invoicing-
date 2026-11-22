// KILN's Terms of Use, English and Spanish. Facts in {braces} come from details.ts.
// The "Apple and Google" section covers what Apple requires of an app's own terms (instead of
// Apple's standard license). A starting draft: have a lawyer review it before launch.

import type { LegalDoc } from './details';

export const terms: Record<'en' | 'es', LegalDoc> = {
  en: {
    title: 'Terms of Use',
    intro: [
      'These terms are an agreement between you and {owner} ("KILN", "we", "us") for using the KILN app and website. By creating an account or using KILN, you agree to them. If you use KILN for a business, you confirm you are allowed to agree for that business. Questions: {email}.',
    ],
    sections: [
      { heading: 'Who can use KILN', body: [
        'You must be at least 18 and use KILN for business. Give accurate information, keep your sign-in safe, and tell us right away if you think someone else used your account. You are responsible for what happens in your account.',
      ] },
      { heading: 'Your team', body: [
        'A business owner can invite managers and crew members. The owner is responsible for the people they approve and for how they use KILN, and can change their roles or remove them at any time.',
      ] },
      { heading: 'Subscription and free trial', body: [
        '• KILN is a paid subscription, monthly or yearly. The price depends on how many people are on your team (1–3, 4–6, or 7 or more) and is shown before you buy.',
        '• A new subscription starts with a 14-day free trial. You add a payment method when the trial starts and are charged when it ends, unless you cancel at least 24 hours before.',
        '• Subscriptions renew automatically at the same price and length unless you turn off auto-renew at least 24 hours before the current period ends.',
        '• Payment is taken by Apple (App Store) or Google (Google Play) under their terms. Manage or cancel your subscription in your store’s account settings. Refunds are handled by Apple or Google under their policies.',
        '• If your team grows beyond your plan, you’ll need a larger plan to add more people.',
        '• We may change prices for future periods. We will tell you in advance, and the store will ask for your agreement where required.',
        '• Some accounts, such as early testers, may be free for a period we tell them about.',
      ] },
      { heading: 'Your content', body: [
        'What you put into KILN (customers, jobs, notes, photos, documents and the rest) belongs to you or your business. You let us store, process, show and send it only as needed to run KILN for you, as described in our Privacy Policy.',
        'You are responsible for having the right to enter your customers’ information into KILN and for telling them how you use it.',
      ] },
      { heading: 'Your business is yours to run', body: [
        'KILN gives you tools. Your estimates, prices, invoices, taxes, warranties, terms and the work itself are your responsibility. Check every document before you send it, and follow the laws that apply to you (for example licensing, consumer protection, tax and electronic signature laws).',
      ] },
      { heading: 'AI drafts', body: [
        'KILN’s AI helpers write drafts and suggestions that can be wrong or incomplete. Review them before you use them. They are not legal, tax or financial advice. What you send to customers is your decision and your responsibility.',
      ] },
      { heading: 'Payments from your customers', body: [
        'Payments your customers make through KILN are processed by Stripe into your own Stripe account, under Stripe’s terms. KILN is not a bank or a payment processor and is not a party to the sale between you and your customer. Stripe charges its own fees. Disputes, refunds and chargebacks are between you, your customer and Stripe.',
      ] },
      { heading: 'Electronic signatures', body: [
        'KILN records signatures with evidence of what was signed and when. Whether a signed document is binding depends on the law and on the terms in your documents; we do not guarantee it.',
      ] },
      { heading: 'Things you may not do', body: [
        'Don’t use KILN to break the law, deceive or harass anyone, send spam, or overcharge customers by misrepresenting work. Don’t try to reach other businesses’ information, get around KILN’s limits or security, copy or reverse-engineer KILN, overload it, or upload harmful code.',
      ] },
      { heading: 'When information is removed', body: [
        'A job is deleted 30 days after it’s fully paid; you can keep copies of its sent documents. If you delete your account, it is erased 30 days later. Keep your own copies of anything you need for your records (for example for taxes).',
      ] },
      { heading: 'Changes, suspension and ending', body: [
        'We improve KILN over time and may change or remove features. We may suspend or close an account that breaks these terms or puts KILN or others at risk, and will tell you why unless the law or safety prevents it. You can stop using KILN and delete your account at any time.',
      ] },
      { heading: 'No warranties', body: [
        'KILN is provided “as is” and “as available”. To the extent the law allows, we make no promises that KILN will be uninterrupted, error-free or fit for a particular purpose.',
      ] },
      { heading: 'Limit of liability', body: [
        'To the extent the law allows, we are not responsible for indirect or consequential losses, such as lost profits, lost data or lost business. Our total responsibility for any claim is limited to the larger of what you paid for KILN in the 12 months before the claim, or $100.',
      ] },
      { heading: 'Your responsibility to us', body: [
        'If someone makes a claim against us because of your content, your documents, your dealings with your customers or your breaking of these terms, you will cover our reasonable costs of that claim.',
      ] },
      { heading: 'Law and disputes', body: [
        'These terms are governed by the laws of the State of {state}, United States, without regard to its conflict-of-law rules. Disputes will be handled in the state or federal courts located in {state}, and you and we agree to those courts. Either of us may use small-claims court instead where it applies.',
      ] },
      { heading: 'Apple and Google', body: [
        'These terms are between you and us, not Apple or Google, and we, not they, are responsible for KILN and its content.',
        '• We give you a personal, non-transferable license to use the KILN app on devices you own or control, as allowed by the App Store or Google Play usage rules.',
        '• Apple and Google have no obligation to provide support or maintenance for KILN.',
        '• If KILN fails to meet a warranty that applies, you may notify Apple, and Apple will refund the purchase price you paid for the app (if any). To the extent the law allows, Apple has no other warranty obligation for KILN.',
        '• We, not Apple, are responsible for any claims about KILN, including product liability claims, claims that KILN fails to meet a legal or regulatory requirement, and claims under consumer protection, privacy or similar laws.',
        '• If anyone claims KILN infringes their intellectual property rights, we, not Apple, are responsible for investigating, defending, settling and resolving it.',
        '• You confirm that you are not in a country subject to a US government embargo or designated as a “terrorist supporting” country, and that you are not on a US government list of prohibited or restricted parties.',
        '• You must follow the terms of any other service you use with KILN, such as your wireless data plan.',
        '• Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.',
      ] },
      { heading: 'Changes to these terms', body: [
        'When these terms change, we update the date at the top. If a change is important, we will tell you in the app before it takes effect. Using KILN after that means you accept the new terms.',
      ] },
      { heading: 'Contact', body: ['{owner} · {email}'] },
    ],
  },
  es: {
    title: 'Términos de uso',
    intro: [
      'Estos términos son un acuerdo entre tú y {owner} ("KILN", "nosotros") para usar la app y el sitio web de KILN. Al crear una cuenta o usar KILN, los aceptas. Si usas KILN para un negocio, confirmas que puedes aceptarlos en nombre de ese negocio. Preguntas: {email}.',
    ],
    sections: [
      { heading: 'Quién puede usar KILN', body: [
        'Debes tener al menos 18 años y usar KILN para un negocio. Da información correcta, mantén segura tu sesión y avísanos de inmediato si crees que otra persona usó tu cuenta. Eres responsable de lo que pase en tu cuenta.',
      ] },
      { heading: 'Tu equipo', body: [
        'El dueño de un negocio puede invitar a gerentes y personal. El dueño es responsable de las personas que aprueba y de cómo usan KILN, y puede cambiar sus roles o quitarlas cuando quiera.',
      ] },
      { heading: 'Suscripción y prueba gratis', body: [
        '• KILN es una suscripción de pago, mensual o anual. El precio depende de cuántas personas hay en tu equipo (1–3, 4–6, o 7 o más) y se muestra antes de comprar.',
        '• Una suscripción nueva empieza con 14 días gratis. Agregas un método de pago al empezar la prueba y se cobra al terminar, a menos que canceles al menos 24 horas antes.',
        '• Las suscripciones se renuevan automáticamente con el mismo precio y duración, a menos que desactives la renovación al menos 24 horas antes de que termine el periodo actual.',
        '• El pago lo cobra Apple (App Store) o Google (Google Play) según sus términos. Administra o cancela tu suscripción en los ajustes de cuenta de tu tienda. Los reembolsos los maneja Apple o Google según sus políticas.',
        '• Si tu equipo crece más allá de tu plan, necesitarás un plan más grande para agregar más personas.',
        '• Podemos cambiar los precios de periodos futuros. Te avisaremos con anticipación, y la tienda te pedirá tu aprobación cuando sea necesario.',
        '• Algunas cuentas, como las de quienes prueban KILN primero, pueden ser gratis durante el periodo que les indiquemos.',
      ] },
      { heading: 'Tu contenido', body: [
        'Lo que pones en KILN (clientes, trabajos, notas, fotos, documentos y lo demás) te pertenece a ti o a tu negocio. Nos permites guardarlo, procesarlo, mostrarlo y enviarlo solo lo necesario para operar KILN para ti, como explica nuestra Política de privacidad.',
        'Eres responsable de tener derecho a ingresar la información de tus clientes en KILN y de informarles cómo la usas.',
      ] },
      { heading: 'Tu negocio lo manejas tú', body: [
        'KILN te da herramientas. Tus presupuestos, precios, facturas, impuestos, garantías, términos y el trabajo mismo son tu responsabilidad. Revisa cada documento antes de enviarlo y sigue las leyes que te apliquen (por ejemplo, licencias, protección al consumidor, impuestos y firmas electrónicas).',
      ] },
      { heading: 'Borradores de IA', body: [
        'Las funciones de IA de KILN escriben borradores y sugerencias que pueden tener errores o estar incompletos. Revísalos antes de usarlos. No son asesoría legal, fiscal ni financiera. Lo que envías a tus clientes es tu decisión y tu responsabilidad.',
      ] },
      { heading: 'Pagos de tus clientes', body: [
        'Los pagos que tus clientes hacen con KILN los procesa Stripe hacia tu propia cuenta de Stripe, según los términos de Stripe. KILN no es un banco ni un procesador de pagos y no es parte de la venta entre tú y tu cliente. Stripe cobra sus propias comisiones. Las disputas, reembolsos y contracargos son entre tú, tu cliente y Stripe.',
      ] },
      { heading: 'Firmas electrónicas', body: [
        'KILN registra las firmas con evidencia de qué se firmó y cuándo. Si un documento firmado es obligatorio depende de la ley y de los términos de tus documentos; no lo garantizamos.',
      ] },
      { heading: 'Lo que no puedes hacer', body: [
        'No uses KILN para violar la ley, engañar o acosar a nadie, enviar spam o cobrar de más a tus clientes describiendo mal el trabajo. No intentes acceder a la información de otros negocios, saltarte los límites o la seguridad de KILN, copiar o descompilar KILN, sobrecargarlo ni subir código dañino.',
      ] },
      { heading: 'Cuándo se borra la información', body: [
        'Un trabajo se borra 30 días después de pagarse por completo; puedes guardar copias de sus documentos enviados. Si borras tu cuenta, se elimina 30 días después. Guarda tus propias copias de lo que necesites para tus registros (por ejemplo, para impuestos).',
      ] },
      { heading: 'Cambios, suspensión y cierre', body: [
        'Mejoramos KILN con el tiempo y podemos cambiar o quitar funciones. Podemos suspender o cerrar una cuenta que viole estos términos o ponga en riesgo a KILN o a otros, y te diremos por qué a menos que la ley o la seguridad lo impidan. Puedes dejar de usar KILN y borrar tu cuenta cuando quieras.',
      ] },
      { heading: 'Sin garantías', body: [
        'KILN se ofrece “tal cual” y “según disponibilidad”. En la medida que lo permita la ley, no prometemos que KILN funcione sin interrupciones, sin errores ni que sirva para un fin en particular.',
      ] },
      { heading: 'Límite de responsabilidad', body: [
        'En la medida que lo permita la ley, no somos responsables de pérdidas indirectas o consecuentes, como ganancias, datos o negocios perdidos. Nuestra responsabilidad total por cualquier reclamo se limita a lo mayor entre lo que pagaste por KILN en los 12 meses antes del reclamo, o $100.',
      ] },
      { heading: 'Tu responsabilidad ante nosotros', body: [
        'Si alguien hace un reclamo contra nosotros por tu contenido, tus documentos, tus tratos con tus clientes o por violar estos términos, cubrirás nuestros costos razonables de ese reclamo.',
      ] },
      { heading: 'Ley y disputas', body: [
        'Estos términos se rigen por las leyes del Estado de {state}, Estados Unidos, sin tomar en cuenta sus reglas de conflicto de leyes. Las disputas se resolverán en los tribunales estatales o federales ubicados en {state}, y tú y nosotros aceptamos esos tribunales. Cualquiera puede usar en su lugar el tribunal de reclamos menores cuando aplique.',
      ] },
      { heading: 'Apple y Google', body: [
        'Estos términos son entre tú y nosotros, no Apple ni Google, y somos nosotros, no ellos, los responsables de KILN y su contenido.',
        '• Te damos una licencia personal e intransferible para usar la app de KILN en dispositivos que te pertenecen o controlas, según las reglas de uso del App Store o Google Play.',
        '• Apple y Google no tienen obligación de dar soporte ni mantenimiento a KILN.',
        '• Si KILN no cumple una garantía que aplique, puedes avisar a Apple, y Apple te devolverá el precio que pagaste por la app (si pagaste). En la medida que lo permita la ley, Apple no tiene ninguna otra obligación de garantía sobre KILN.',
        '• Somos nosotros, no Apple, los responsables de cualquier reclamo sobre KILN, incluidos reclamos de responsabilidad por el producto, de que KILN no cumple un requisito legal o regulatorio, y reclamos bajo leyes de protección al consumidor, privacidad u otras similares.',
        '• Si alguien reclama que KILN infringe sus derechos de propiedad intelectual, somos nosotros, no Apple, los responsables de investigarlo, defenderlo, resolverlo y llegar a un acuerdo.',
        '• Confirmas que no estás en un país sujeto a embargo del gobierno de EE. UU. ni designado como país que “apoya el terrorismo”, y que no estás en una lista del gobierno de EE. UU. de partes prohibidas o restringidas.',
        '• Debes cumplir los términos de cualquier otro servicio que uses con KILN, como tu plan de datos móviles.',
        '• Apple y sus subsidiarias son terceros beneficiarios de estos términos y pueden hacerlos cumplir.',
      ] },
      { heading: 'Cambios a estos términos', body: [
        'Cuando estos términos cambien, actualizaremos la fecha de arriba. Si el cambio es importante, te avisaremos en la app antes de que entre en vigor. Seguir usando KILN después significa que aceptas los nuevos términos.',
      ] },
      { heading: 'Contacto', body: ['{owner} · {email}'] },
    ],
  },
};
