import { useState } from 'react';

import type { SavedSnapshot } from '@/data/job-cleanup';
import type { Lang } from '@/i18n';
import { cleanupText } from '@/features/cleanup/text';
import { invoicePaymentCopy } from '@/lib/invoice-payment';
import { printDocument } from '@/lib/print-document';
import { savedDocHtml, type SavedDocLabels } from '@/lib/saved-doc';

import { Button, Notice } from './ui';

export function documentLabels(type: SavedSnapshot['type'], lang: Lang, receipt = false): SavedDocLabels {
  const c = cleanupText(lang);
  const title = receipt ? (lang === 'es' ? 'Recibo de pago' : 'Payment receipt')
    : type === 'change_order' ? c.changeOrder : c[type];
  const methods = { ...invoicePaymentCopy[lang].methods, card: c.card, bank: c.bank, wallet: c.wallet, other: c.other, refund: lang === 'es' ? 'Reembolso' : 'Refund', dispute: lang === 'es' ? 'Contracargo' : 'Chargeback' } as Record<string, string>;
  return { ...c, title, dueDate: lang === 'es' ? 'Vencimiento' : 'Due date', method: (name) => methods[name] ?? c.other,
    signedBy: (name) => c.signedBy.replace('%{name}', name) };
}

export function CustomerDocumentExport({ snapshot, lang, receipt = false }: { snapshot: SavedSnapshot; lang: Lang; receipt?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const es = lang === 'es';
  const labels = documentLabels(snapshot.type, lang, receipt);
  const label = receipt ? (es ? 'Guardar recibo de pago' : 'Save payment receipt') : (es ? 'Imprimir o guardar PDF' : 'Print or save PDF');
  return <>
    <Button label={label} icon="file-text" variant="outline" disabled={busy} onPress={async () => {
      setBusy(true);
      setFailed(false);
      try { await printDocument(savedDocHtml(snapshot, labels, lang, receipt), labels.title); }
      catch { setFailed(true); }
      finally { setBusy(false); }
    }} />
    {failed ? <Notice tone="danger" text={es ? 'No se pudo abrir el documento. Inténtalo de nuevo.' : 'Could not open the document. Try again.'} /> : null}
  </>;
}
