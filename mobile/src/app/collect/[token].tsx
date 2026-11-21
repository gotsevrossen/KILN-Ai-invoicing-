import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { DepositPayment } from '@/components/deposit-payment';
import { Screen } from '@/components/ui';
import { useLang } from '@/i18n';

/** A deposit link the owner shared. No account or app: the link's code opens this one payment. */
export default function CollectionRoute() {
  const { token, payment_intent: returnedIntent } = useLocalSearchParams<{ token: string; payment_intent?: string }>();
  const { lang } = useLang();
  return <Screen>
    <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 }}>
      <DepositPayment key={token} token={String(token)} lang={lang} header returnedIntent={returnedIntent ? String(returnedIntent) : undefined} />
    </View>
  </Screen>;
}
