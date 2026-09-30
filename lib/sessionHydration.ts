import type { AuthUser } from '@/lib/auth';
import {
  getUserProfile,
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
  if (!authUser.id) return getUserProfile();

  setActiveProfileUserId(authUser.id);

  try {
    const localCached = await hydrateUserProfileForUser(authUser.id);
    const mergedRemote = await syncProfileFromRemote(authUser.id, {
      localFallback: localCached,
    });
    const withAuth = mergeAuthUserIntoProfile(mergedRemote, authUser);
    const saved = setUserProfile(withAuth, { userId: authUser.id });

    if (isProfileComplete(saved)) {
      void markProfileSetupComplete(authUser.id);
      void backfillProfileIfNeeded(authUser.id, saved);
      return saved;
    }

    if (isProfileComplete(localCached)) {
      const localMerged = mergeAuthUserIntoProfile(localCached, authUser);
      setUserProfile(localMerged, { userId: authUser.id });
      void markProfileSetupComplete(authUser.id);
      void backfillProfileIfNeeded(authUser.id, localMerged);
      return localMerged;
    }

    return saved;
  } catch {
    const fallback = await hydrateUserProfileForUser(authUser.id).catch(
      () => getUserProfile(),
    );
    return setUserProfile(mergeAuthUserIntoProfile(fallback, authUser), {
      userId: authUser.id,
    });
  }
}
