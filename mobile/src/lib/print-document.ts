import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function printDocument(html: string, title: string): Promise<void> {
  const file = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  } else {
    await Print.printAsync({ uri: file.uri });
  }
}
