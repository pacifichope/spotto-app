import '@/lib/firebaseNativeInit';
import '@/lib/i18n';
import '@/lib/registerMapsFabricEvents';

import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import StripeAppProvider from '@/components/StripeAppProvider';
import { AuthProvider } from '@/lib/authContext';
import { BlocksProvider } from '@/lib/blocksContext';
import { ChatsProvider } from '@/lib/chatsContext';
import { ClubsProvider } from '@/lib/clubsContext';
import { CreateEventAccessProvider } from '@/lib/createEventAccessContext';
import { EventsProvider } from '@/lib/eventsContext';
import { PhoneVerificationProvider } from '@/lib/phoneVerificationContext';
import { HomeBrowseProvider } from '@/lib/homeBrowseContext';
import i18n, { hydrateLanguagePreference } from '@/lib/i18n';
import { UserProfileProvider } from '@/lib/userProfileContext';

function LanguageHydration({ children }: { children: ReactNode }) {
  useEffect(() => {
    void hydrateLanguagePreference();
  }, []);
  return children;
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <LanguageHydration>
        <StripeAppProvider>
          <EventsProvider>
            <UserProfileProvider>
              <BlocksProvider>
                <ClubsProvider>
                  <ChatsProvider>
                    <AuthProvider>
                      <PhoneVerificationProvider>
                        <HomeBrowseProvider>
                          <CreateEventAccessProvider>
                            {children}
                          </CreateEventAccessProvider>
                        </HomeBrowseProvider>
                      </PhoneVerificationProvider>
                    </AuthProvider>
                  </ChatsProvider>
                </ClubsProvider>
              </BlocksProvider>
            </UserProfileProvider>
          </EventsProvider>
        </StripeAppProvider>
      </LanguageHydration>
    </I18nextProvider>
  );
}
