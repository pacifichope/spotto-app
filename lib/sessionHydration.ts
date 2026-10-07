import type { AuthUser } from '@/lib/auth';
import { isExplicitSignOut } from '@/lib/authSessionGate';
import {
  getActiveProfileUserId,
  getUserProfile,
  GUEST_USER_PROFILE,
  hydrateUserProfileForUser,
  isProfileComplete,
  markProfileSetupComplete,
  setActiveProfileUserId,
  setUserProfile,
  type UserProfile,
} from '@/lib/userProfile';
import {
  backfillProfileIfNeeded,
  syncProfileFromRemote,
} from '@/lib/userProfileRemote';

/**
 * 認証ユーザーの表示情報をプロフィールにマージ（リモート優先、欠けは auth メタデータで補完）。
 * すでに個人プロフィールとして設定した名前がある場合は OAuth 名で上書きしない。
 */
export function mergeAuthUserIntoProfile(
  profile: UserProfile,
  authUser: AuthUser,
): UserProfile {
  const profileName = profile.name.trim();
  const authName = (authUser.name || '').trim();
  const useAuthName =
    Boolean(authName) &&
    (!profileName ||
      profileName === 'You' ||
      profileName === 'User' ||
      profileName === 'ゲスト');

  return {
    ...profile,
    name: useAuthName ? authName : profileName || authName || profile.name,
    imageUri: profile.imageUri ?? authUser.imageUri,
  };
}

/**
 * Supabase `profiles` を取得し、端末キャッシュとマージした最新値を返す。
 */
export async function fetchRemoteProfileForUser(
  authUser: AuthUser,
): Promise<UserProfile> {
  if (!authUser.id || isExplicitSignOut()) return { ...GUEST_USER_PROFILE };

  const stillCurrent = () =>
    !isExplicitSignOut() && getActiveProfileUserId() === authUser.id;

  setActiveProfileUserId(authUser.id);

  try {
    const localCached = await hydrateUserProfileForUser(authUser.id);
    if (!stillCurrent()) return { ...GUEST_USER_PROFILE };
    // リモート待ちの間も端末キャッシュ＋OAuth メタデータを先に画面へ出す
    const localWithAuth = mergeAuthUserIntoProfile(localCached, authUser);
    setUserProfile(localWithAuth, { userId: authUser.id });

    const mergedRemote = await syncProfileFromRemote(authUser.id, {
      localFallback: localWithAuth,
    });
    if (!stillCurrent()) return { ...GUEST_USER_PROFILE };
    const withAuth = mergeAuthUserIntoProfile(mergedRemote, authUser);
    const saved = setUserProfile(withAuth, { userId: authUser.id });

    if (isProfileComplete(saved)) {
      void markProfileSetupComplete(authUser.id);
      void backfillProfileIfNeeded(authUser.id, saved);
      return saved;
    }

    if (isProfileComplete(localCached)) {
      const localMerged = mergeAuthUserIntoProfile(localCached, authUser);
      if (!stillCurrent()) return { ...GUEST_USER_PROFILE };
      setUserProfile(localMerged, { userId: authUser.id });
      void markProfileSetupComplete(authUser.id);
      void backfillProfileIfNeeded(authUser.id, localMerged);
      return localMerged;
    }

    return saved;
  } catch {
    if (!stillCurrent()) return { ...GUEST_USER_PROFILE };
    const fallback = await hydrateUserProfileForUser(authUser.id).catch(
      () => getUserProfile(),
    );
    if (!stillCurrent()) return { ...GUEST_USER_PROFILE };
    return setUserProfile(mergeAuthUserIntoProfile(fallback, authUser), {
      userId: authUser.id,
    });
  }
}
