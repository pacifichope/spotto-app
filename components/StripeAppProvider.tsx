import { type ReactNode } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

import {
  stripePublishableKey,
  stripeUrlScheme,
} from '@/lib/stripePayments';

export default function StripeAppProvider({ children }: { children: ReactNode }) {
  const publishableKey = stripePublishableKey();
  if (!publishableKey) return children;

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={
        process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID?.trim() ||
        'merchant.com.spotto.app'
      }
      urlScheme={stripeUrlScheme()}
    >
      {children}
    </StripeProvider>
  );
}
