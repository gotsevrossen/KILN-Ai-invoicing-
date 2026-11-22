import { LegalPage } from '@/components/legal-page';
import { terms } from '@/legal/terms';

/** KILN's Terms of Use, at /terms on the web. */
export default function Terms() {
  return <LegalPage doc={terms} />;
}
