import { useLocalSearchParams } from 'expo-router';

import { NewReceipt } from '@/components/receipt-form';

/** A crew member's receipt for one assigned job (picked on Capture or the job page). */
export default function CrewReceipt() {
  const { job, title } = useLocalSearchParams<{ job: string; title?: string }>();
  return <NewReceipt crew={{ jobId: job, jobTitle: title ?? '' }} />;
}
