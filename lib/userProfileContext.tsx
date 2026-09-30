import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { renameMyChatIdentity } from '@/lib/chatsContext';
import {
  getActiveProfileUserId,
  getUserProfile,
  resetUserProfile as resetStoredUserProfile,
  setUserProfile,
  subscribeUserProfile,
  userDisplayName,
  type UserProfile,
} from '@/lib/userProfile';

type UserProfileContextValue = {
  userProfile: UserProfile;
  displayName: string;
  updateUserProfile: (profile: UserProfile) => void;
  /** ログアウト時など、プロフィールをゲスト状態に戻す */
  clearUserProfile: () => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  // 起動時にローカルプロフィールを自動 hydrate しない。
  // （未ログインでも前回の名前が残るのを防ぐ。ログイン後に Auth 側で取得する）

  const userProfile = useSyncExternalStore(
    subscribeUserProfile,
    getUserProfile,
    getUserProfile,
  );

  const updateUserProfile = useCallback((profile: UserProfile) => {
    const uid = getActiveProfileUserId();
    const next = setUserProfile(
      profile,
      uid ? { userId: uid } : undefined,
    );
    renameMyChatIdentity(userDisplayName(next), next.imageUri);
  }, []);

  const clearUserProfile = useCallback(() => {
    const next = resetStoredUserProfile();
    renameMyChatIdentity(userDisplayName(next), next.imageUri);
  }, []);

  const value = useMemo(
    () => ({
      userProfile,
      displayName: userDisplayName(userProfile),
      updateUserProfile,
      clearUserProfile,
    }),
    [userProfile, updateUserProfile, clearUserProfile],
  );

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfile must be used within UserProfileProvider');
  }
  return ctx;
}
