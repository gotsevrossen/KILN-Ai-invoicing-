import { LegalPage } from '@/components/legal-page';
import { privacy } from '@/legal/privacy';

/** KILN's Privacy Policy, at /privacy on the web (the address the App Store and Google Play listings use). */
export default function Privacy() {
  return <LegalPage doc={privacy} />;
}
