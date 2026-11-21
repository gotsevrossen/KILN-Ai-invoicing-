import { useLocalSearchParams } from 'expo-router';

import { AssistantChat } from '@/components/assistant-chat';
import { hasJob } from '@/data/selectors';

/** The KILN chat. Opened from the ✦ button; from a job page it already knows the job (?job=<id>). */
export default function AssistantRoute() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  return <AssistantChat focusJobId={typeof job === 'string' && hasJob(job) ? job : null} />;
}
