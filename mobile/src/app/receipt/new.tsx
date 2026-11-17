import { useLocalSearchParams } from 'expo-router';

import { NewReceipt } from '@/components/receipt-form';
import { RecordGate } from '@/components/record-gate';
import { hasJob } from '@/data/selectors';

export default function NewReceiptRoute() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  return <RecordGate found={() => !job || hasJob(job)}><NewReceipt /></RecordGate>;
}
