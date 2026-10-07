import { type ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

import { readPublicEnv } from '@/lib/env';
import {
  stripePublishableKey,
  stripeUrlScheme,
} from '@/lib/stripePayments';

const DEFAULT_MERCHANT_ID = 'merchant.com.spotto.app';

export default function StripeAppProvider({ children }: { children: ReactNode }) {
  const publishableKey = stripePublishableKey();
  if (!publishableKey) return children;

  const merchantIdentifier =
    readPublicEnv('EXPO_PUBLIC_STRIPE_MERCHANT_ID') || DEFAULT_MERCHANT_ID;

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={merchantIdentifier}
      urlScheme={stripeUrlScheme()}
    >
      {children}
    </StripeProvider>
  );
}
