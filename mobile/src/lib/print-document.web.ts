export async function printDocument(html: string, _title: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('The print window could not be opened');
  tab.opener = null;
  tab.document.open();
  tab.document.write(html);
  tab.document.close();
  await tab.document.fonts?.ready;
  if (!tab.closed) {
    tab.focus();
    tab.print();
  }
}
