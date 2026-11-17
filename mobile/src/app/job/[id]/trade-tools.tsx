import { useLocalSearchParams } from 'expo-router';
import { RecordGate } from '@/components/record-gate';
import { TradeTools } from '@/components/trade-tools';
import { hasJob } from '@/data/selectors';

export default function TradeToolsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><TradeTools jobId={id} /></RecordGate>;
}
