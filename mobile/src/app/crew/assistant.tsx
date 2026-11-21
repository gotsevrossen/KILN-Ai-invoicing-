import { useLocalSearchParams } from 'expo-router';

import { AssistantChat } from '@/components/assistant-chat';

/** The KILN chat for crew: only their assigned jobs (the server checks that too). */
export default function CrewAssistantRoute() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  return <AssistantChat crew focusJobId={typeof job === 'string' ? job : null} />;
}
