import * as database from './db';
import * as documents from './db-docs';
import * as photos from './db-photos';

// Explicit allowlist: authentication, public links, and payment-provider requests never persist.
const writes = {
  insertCustomer: database.insertCustomer, insertJob: database.insertJob,
  saveSettings: database.saveSettings, saveTrades: database.saveTrades, savePrice: database.savePrice,
  assignReceiptItem: documents.assignReceiptItem, updateReceiptItem: documents.updateReceiptItem,
  insertTimeEntry: documents.insertTimeEntry, insertNote: documents.insertNote,
  insertWorkItem: documents.insertWorkItem, deleteWorkItem: documents.deleteWorkItem,
  insertReceipt: documents.insertReceipt, deleteReceipt: documents.deleteReceipt,
  saveEstimate: documents.saveEstimate, updateInvoice: documents.updateInvoice,
  setJobFlags: documents.setJobFlags, insertInvoice: documents.insertInvoice,
  insertChangeOrder: documents.insertChangeOrder, declineChangeOrder: documents.declineChangeOrder,
  deleteJob: documents.deleteJob, deletePhoto: photos.deletePhoto,
  updatePhotoTag: photos.updatePhotoTag, deletePhotoFiles: photos.deletePhotoFiles,
};

export type WriteName = keyof typeof writes;
export type OfflineCommand = { [K in WriteName]: { name: K; args: Parameters<typeof writes[K]> } }[WriteName];
export function command<K extends WriteName>(name: K, ...args: Parameters<typeof writes[K]>): Extract<OfflineCommand, { name: K }> {
  return { name, args } as Extract<OfflineCommand, { name: K }>;
}

/** Typed at construction; the journal stores only commands made by this allowlist. */
export async function executeCommand(c: OfflineCommand): Promise<void> {
  const fn = writes[c.name] as (...args: never[]) => Promise<void>;
  if (!fn) throw new Error('offline_command_invalid');
  await fn(...c.args as unknown as never[]);
}
