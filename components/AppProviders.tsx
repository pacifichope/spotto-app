import '@/lib/firebaseNativeInit';
import '@/lib/registerMapsFabricEvents';

import { type ReactNode } from 'react';

import StripeAppProvider from '@/components/StripeAppProvider';
import { AuthProvider } from '@/lib/authContext';
import { BlocksProvider } from '@/lib/blocksContext';
import { ChatsProvider } from '@/lib/chatsContext';
import { ClubsProvider } from '@/lib/clubsContext';
import { CreateEventAccessProvider } from '@/lib/createEventAccessContext';
import { EventsProvider } from '@/lib/eventsContext';
import { PhoneVerificationProvider } from '@/lib/phoneVerificationContext';
import { HomeBrowseProvider } from '@/lib/homeBrowseContext';
import { UserProfileProvider } from '@/lib/userProfileContext';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
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
  );
}
