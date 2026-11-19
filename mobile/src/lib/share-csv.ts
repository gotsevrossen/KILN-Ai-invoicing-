import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareCsv(name: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('CSV sharing is unavailable');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
}
