import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import LoginModal from '@/components/LoginModal';
import PersonalProfileModal from '@/components/PersonalProfileModal';
import {
  deleteUserAccount,
  loadAuthSession,
  saveAuthSession,
  type AuthReason,
  type AuthResult,
  type AuthUser,
  type SocialProvider,
} from '@/lib/auth';
import {
  assertAccountNotBanned,
  clearCachedBanStatus,
  showAccountBannedAlert,
} from '@/lib/accountBan';
import { useBlocks } from '@/lib/blocksContext';
import { prepareChatsForSignOut } from '@/lib/chatsContext';
import { useClubs } from '@/lib/clubsContext';
import { useEvents } from '@/lib/eventsContext';
import {
  beginExplicitSignOut,
  endExplicitSignOut,
  isExplicitSignOut,
} from '@/lib/authSessionGate';
import {
  signOutFirebaseAuth,
  subscribeFirebaseAuth,
  waitForInitialFirebaseAuthUser,
} from '@/lib/firebaseAuthSession';
import { signInWithFirebaseProvider } from '@/lib/firebaseSignIn';
import { resetNotificationSettings } from '@/lib/notificationSettings';
import { clearPhoneVerification } from '@/lib/phoneVerification';
import {
  registerDevicePushToken,
  unregisterDevicePushToken,
} from '@/lib/pushNotifications';
import { fetchRemoteProfileForUser, mergeAuthUserIntoProfile } from '@/lib/sessionHydration';
import { setSessionExpiredHandler } from '@/lib/sessionExpiry';
import { userFacingSocialLoginError } from '@/lib/socialLoginErrors';
import { useUserProfile } from '@/lib/userProfileContext';
import {
  getUserProfile,
  getActiveProfileUserId,
  GUEST_USER_PROFILE,
  hydrateUserProfileForUser,
  isProfileComplete,
  isProfileSetupMarkedComplete,
  markProfileSetupComplete,
  setActiveProfileUserId,
  type UserProfile,
} from '@/lib/userProfile';
import {
  hasCompleteRemoteProfile,
  pushProfileToRemote,
} from '@/lib/userProfileRemote';

type AuthContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  /**
   * 今のユーザーのプロフィールを画面に出してよいか。
   * ログアウト直後や hydration 中は false（古い写真を出さない）。
   */
  accountDataReady: boolean;
  /** この起動セッションのみ有効なゲスト閲覧（永続化しない） */
  isGuestBrowsing: boolean;
  user: AuthUser | null;
  loginVisible: boolean;
  loginReason?: AuthReason;
  requireAuth: (resume?: () => void, reason?: AuthReason) => boolean;
  /**
   * プロフィール（表示名+性別）が揃っていれば true。
   * 未登録なら設定モーダルを開き、完了後に resume を実行する。
   */
  requireCompleteProfile: (resume?: () => void) => boolean;
  /**
   * 凍結アカウントならアラート＋ログアウトして false。
   * イベント作成など重要な操作の直前に呼ぶ。
   */
  ensureNotBanned: () => Promise<boolean>;
  openLogin: (reason?: AuthReason) => void;
  closeLogin: () => void;
  continueAsGuest: () => void;
  signInWithSocial: (provider: SocialProvider) => Promise<AuthResult>;
  /** @deprecated Firebase Auth に統合済み。signInWithSocial と同じ */
  signInWithSupabase: (provider: SocialProvider) => Promise<AuthResult>;
  applyAuthUser: (user: AuthUser) => void;
  signOut: () => void;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; error: string }>;
  registerLoginLayer: () => () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { userProfile, updateUserProfile, clearUserProfile } = useUserProfile();
  const { resetAccountData, clearParticipantSessionData, hydrateParticipantSessionData } =
    useEvents();
  const { resetJoinedClubs, clearPersistedJoinedClubs } = useClubs();
  const { clearBlockedUsers, refreshBlocks, releaseSessionBlocks } = useBlocks();
  const [isReady, setIsReady] = useState(false);
  const [accountDataReady, setAccountDataReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isGuestBrowsing, setIsGuestBrowsing] = useState(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginReason, setLoginReason] = useState<AuthReason | undefined>();
  const [profileSetupVisible, setProfileSetupVisible] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  const pendingResume = useRef<(() => void) | null>(null);
  const pendingAfterProfile = useRef<(() => void) | null>(null);
  const suppressOpenUntil = useRef(0);
  const [loginLayerCount, setLoginLayerCount] = useState(0);
  /** 直近でフル hydration したユーザー（重複 fetch 抑制） */
  const lastHydratedUserIdRef = useRef<string | null>(null);
  const hydrateGenerationRef = useRef(0);
  /** 同一 uid の並行 hydrate を1本にまとめる */
  const hydrateInFlightRef = useRef<{
    userId: string;
    promise: Promise<UserProfile | null>;
  } | null>(null);
  userRef.current = user;

  const applySession = useCallback((next: AuthUser) => {
    userRef.current = next;
    setUser(next);
    void saveAuthSession(next);
    setActiveProfileUserId(next.id);
  }, []);

  /**
   * ログイン直後に OAuth 名・画像を即反映し、続けて端末キャッシュを載せる。
   * リモート同期は hydrateSessionData 側で上書きする。
   */
  const seedProfileFromAuth = useCallback(
    (authUser: AuthUser) => {
      if (!authUser.id) return;
      if (isExplicitSignOut()) return;
      const generation = hydrateGenerationRef.current;
      const base =
        getActiveProfileUserId() === authUser.id
          ? getUserProfile()
          : { ...GUEST_USER_PROFILE };
      setActiveProfileUserId(authUser.id);
      updateUserProfile(mergeAuthUserIntoProfile(base, authUser));
      setAccountDataReady(true);
      void hydrateUserProfileForUser(authUser.id)
        .then((cached) => {
          if (isExplicitSignOut()) return;
          if (generation !== hydrateGenerationRef.current) return;
          if (userRef.current?.id !== authUser.id) return;
          updateUserProfile(mergeAuthUserIntoProfile(cached, authUser));
          setAccountDataReady(true);
        })
        .catch(() => undefined);
    },
    [updateUserProfile],
  );

  const clearSessionLocalState = useCallback(() => {
    hydrateGenerationRef.current += 1;
    hydrateInFlightRef.current = null;
    lastHydratedUserIdRef.current = null;
    const previousId = userRef.current?.id;
    userRef.current = null;
    setUser(null);
    setAccountDataReady(false);
    clearParticipantSessionData();
    clearUserProfile();
    resetJoinedClubs();
    clearCachedBanStatus(previousId);
    void saveAuthSession(null);
    void clearPhoneVerification();
  }, [clearParticipantSessionData, clearUserProfile, resetJoinedClubs]);

  /** 凍結アカウントを検知したら強制ログアウト＋専用アラート。true = 凍結だった */
  const rejectIfBanned = useCallback(
    async (
      userId: string,
      options?: { alert?: boolean },
    ): Promise<boolean> => {
      const check = await assertAccountNotBanned(userId);
      if (check.ok) return false;
      resetAccountData();
      clearSessionLocalState();
      void signOutFirebaseAuth();
      if (options?.alert !== false) {
        showAccountBannedAlert(check.error);
      }
      return true;
    },
    [clearSessionLocalState, resetAccountData],
  );

  /**
   * ログイン後 / 起動時: プロフィールを先に反映し、参加データ等は背面で取得。
   */
  const hydrateSessionData = useCallback(
    async (
      authUser: AuthUser,
      options?: { force?: boolean },
    ): Promise<UserProfile | null> => {
      if (!authUser.id) return null;

      // 同一ユーザーの進行中 hydrate に合流（onAuthStateChanged × completeAuth の二重実行を防ぐ）
      const inFlight = hydrateInFlightRef.current;
      if (inFlight && inFlight.userId === authUser.id) {
        return inFlight.promise;
      }

      if (!options?.force && lastHydratedUserIdRef.current === authUser.id) {
        return getUserProfile();
      }

      const generation = ++hydrateGenerationRef.current;

      const run = async (): Promise<UserProfile | null> => {
        try {
          if (await rejectIfBanned(authUser.id)) {
            return null;
          }
          if (isExplicitSignOut() || generation !== hydrateGenerationRef.current) {
            return null;
          }

          // 1) 即時表示 → 2) リモートプロフィール（UI ブロックはここまで）
          seedProfileFromAuth(authUser);
          const profile = await fetchRemoteProfileForUser(authUser);
          if (isExplicitSignOut() || generation !== hydrateGenerationRef.current) {
            return null;
          }

          if (await rejectIfBanned(authUser.id)) {
            return null;
          }
          if (isExplicitSignOut() || generation !== hydrateGenerationRef.current) {
            return null;
          }

          updateUserProfile(profile);
          lastHydratedUserIdRef.current = authUser.id;

          // 3) イベント／参加／チャットはプロフィール表示後に背面実行
          void hydrateParticipantSessionData().catch((error) => {
            if (generation !== hydrateGenerationRef.current) return;
            if (__DEV__) {
              console.warn(
                '[auth] hydrateParticipantSessionData failed',
                error,
              );
            }
          });
          void refreshBlocks().catch(() => undefined);
          void registerDevicePushToken().catch(() => undefined);

          if (__DEV__) {
            console.log('[auth] session data hydrated', {
              userId: authUser.id,
              profileName: profile.name,
              gender: profile.gender || '(empty)',
              complete: isProfileComplete(profile),
            });
          }
          return profile;
        } catch (error) {
          if (__DEV__) {
            console.warn('[auth] hydrateSessionData failed', error);
          }
          return null;
        } finally {
          if (hydrateInFlightRef.current?.userId === authUser.id) {
            hydrateInFlightRef.current = null;
          }
        }
      };

      const promise = run();
      hydrateInFlightRef.current = { userId: authUser.id, promise };
      return promise;
    },
    [
      hydrateParticipantSessionData,
      refreshBlocks,
      rejectIfBanned,
      seedProfileFromAuth,
      updateUserProfile,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        clearUserProfile();

        // IndexedDB / ネイティブ永続化の復元完了を待つ（reload 直後の null 取りこぼし防止）
        const firebaseUser = await waitForInitialFirebaseAuthUser();
        if (cancelled) return;
        if (firebaseUser) {
          // Supabase Third-Party Auth 用 role=authenticated を起動時に確保
          const { ensureFirebaseAuthenticatedClaim } = await import(
            '@/lib/firebaseEnsureClaims'
          );
          await ensureFirebaseAuthenticatedClaim();
          if (cancelled) return;
          applySession(firebaseUser);
          await hydrateSessionData(firebaseUser, { force: true });
          return;
        }

        // Firebase 未ログイン時はローカル偽セッションを捨てる
        const session = await loadAuthSession();
        if (cancelled) return;
        if (session) {
          void saveAuthSession(null);
        }
      } finally {
        if (!cancelled) {
          // 未ログインでもゲストとしてホーム閲覧可能にする
          if (!userRef.current) {
            setIsGuestBrowsing(true);
          }
          setIsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearUserProfile, hydrateSessionData]);

  // Firebase Auth の唯一のセッションソース
  useEffect(() => {
    return subscribeFirebaseAuth((next) => {
      if (isExplicitSignOut()) {
        return;
      }
      if (!next) {
        if (userRef.current) {
          clearSessionLocalState();
          // ログアウト後もホーム閲覧は継続（強制ログイン画面へ戻さない）
          setIsGuestBrowsing(true);
          setLoginVisible(false);
          setLoginReason(undefined);
          setProfileSetupVisible(false);
          pendingResume.current = null;
          pendingAfterProfile.current = null;
        }
        return;
      }

      const previousId = userRef.current?.id;
      applySession(next);
      if (previousId !== next.id) {
        seedProfileFromAuth(next);
        void hydrateSessionData(next, { force: true });
      }
    });
  }, [applySession, clearSessionLocalState, hydrateSessionData, seedProfileFromAuth]);

  // API 401 / JWT 失効時: ローカルセッションを破棄して再ログインを促す
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!userRef.current) return;
      resetAccountData();
      clearSessionLocalState();
      setIsGuestBrowsing(true);
      pendingResume.current = null;
      pendingAfterProfile.current = null;
      setProfileSetupVisible(false);
      void signOutFirebaseAuth();
      Alert.alert(
        'ログインの有効期限が切れました',
        'セキュリティのため再ログインが必要です。',
        [
          {
            text: 'ログイン',
            onPress: () => {
              setLoginReason(undefined);
              setLoginVisible(true);
            },
          },
          { text: '閉じる', style: 'cancel' },
        ],
      );
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSessionLocalState, resetAccountData]);

  const closeLogin = useCallback(() => {
    pendingResume.current = null;
    // 閉じた直後の誤再オープンだけ防ぐ（短めに）
    suppressOpenUntil.current = Date.now() + 250;
    setLoginVisible(false);
    setLoginReason(undefined);
  }, []);

  const openLogin = useCallback((reason?: AuthReason) => {
    // 明示的なオープンは suppress を無視（閉じた直後のボタン連打でも出す）
    suppressOpenUntil.current = 0;
    setLoginReason(reason);
    setLoginVisible(true);
    if (__DEV__) {
      console.log('[auth] openLogin', reason ?? '(none)');
    }
  }, []);

  const registerLoginLayer = useCallback(() => {
    setLoginLayerCount((count) => count + 1);
    return () => {
      setLoginLayerCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const requireAuth = useCallback(
    (resume?: () => void, reason?: AuthReason) => {
      if (userRef.current) return true;
      if (Date.now() < suppressOpenUntil.current) {
        // suppress 中でも pending は保持し、直後に再試行できるようにする
        pendingResume.current = resume ?? null;
        setLoginReason(reason);
        setLoginVisible(true);
        suppressOpenUntil.current = 0;
        return false;
      }
      pendingResume.current = resume ?? null;
      setLoginReason(reason);
      setLoginVisible(true);
      return false;
    },
    [],
  );

  const requireCompleteProfile = useCallback((resume?: () => void) => {
    if (isProfileComplete(getUserProfile())) return true;
    pendingAfterProfile.current = resume ?? null;
    setProfileSetupVisible(true);
    return false;
  }, []);

  const ensureNotBanned = useCallback(async () => {
    const uid = userRef.current?.id;
    if (!uid) return true;
    if (await rejectIfBanned(uid)) return false;
    return true;
  }, [rejectIfBanned]);

  const closeProfileSetup = useCallback(() => {
    setProfileSetupVisible(false);
    pendingAfterProfile.current = null;
  }, []);

  const completeProfileSetup = useCallback(
    (profile: UserProfile) => {
      const uid = userRef.current?.id;
      if (uid) {
        setActiveProfileUserId(uid);
      }
      updateUserProfile(profile);
      if (uid) {
        void (async () => {
          const result = await pushProfileToRemote(uid, profile);
          if (result.ok) {
            await markProfileSetupComplete(uid);
          } else if (__DEV__) {
            console.warn('[auth] profile push failed', result.error);
          }
          // 端末上のセットアップ完了はローカル保存成功時も進める（再試行は次回同期）
          await markProfileSetupComplete(uid);
        })();
      }
      setProfileSetupVisible(false);
      const resume = pendingAfterProfile.current;
      pendingAfterProfile.current = null;
      setTimeout(() => {
        resume?.();
      }, 80);
    },
    [updateUserProfile],
  );

  const completeAuth = useCallback(
    (next: AuthUser) => {
      setIsGuestBrowsing(false);
      applySession(next);
      // モーダルを閉じる前に OAuth 名・画像を即反映（ゲスト表示のちらつき防止）
      seedProfileFromAuth(next);
      setLoginVisible(false);
      setLoginReason(undefined);
      const resume = pendingResume.current;
      pendingResume.current = null;
      void (async () => {
        if (await rejectIfBanned(next.id)) {
          return;
        }

        let profile =
          (await hydrateSessionData(next, { force: true })) ??
          getUserProfile();

        if (!userRef.current) return;

        if (!isProfileComplete(profile)) {
          const remoteComplete = await hasCompleteRemoteProfile(next.id);
          if (remoteComplete) {
            profile = await fetchRemoteProfileForUser(next);
            updateUserProfile(profile);
          }
        }

        if (isProfileComplete(profile)) {
          await markProfileSetupComplete(next.id);
          setProfileSetupVisible(false);
          resume?.();
          return;
        }

        const setupDone = await isProfileSetupMarkedComplete(next.id);
        if (setupDone) {
          setProfileSetupVisible(false);
          resume?.();
          return;
        }

        pendingAfterProfile.current = resume;
        setProfileSetupVisible(true);
      })();
    },
    [
      applySession,
      hydrateSessionData,
      rejectIfBanned,
      seedProfileFromAuth,
      updateUserProfile,
    ],
  );

  const continueAsGuest = useCallback(() => {
    setIsGuestBrowsing(true);
    setLoginVisible(false);
    setLoginReason(undefined);
    pendingResume.current = null;
    pendingAfterProfile.current = null;
    setProfileSetupVisible(false);
  }, []);

  const applyAuthUser = useCallback(
    (next: AuthUser) => {
      completeAuth(next);
    },
    [completeAuth],
  );

  const signInWithSocial = useCallback(
    async (provider: SocialProvider) => {
      try {
        const result = await signInWithFirebaseProvider(provider);
        if (!result.ok) {
          if (result.cancelled) return result;
          return {
            ok: false as const,
            error: userFacingSocialLoginError(provider, result.error),
          };
        }
        const ban = await assertAccountNotBanned(result.user.id);
        if (!ban.ok) {
          clearSessionLocalState();
          void signOutFirebaseAuth();
          return {
            ok: false as const,
            error: ban.error,
            banned: true as const,
          };
        }
        completeAuth(result.user);
        return result;
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth] signInWithSocial', provider, error);
        }
        return {
          ok: false as const,
          error: userFacingSocialLoginError(provider),
        };
      }
    },
    [clearSessionLocalState, completeAuth],
  );

  /** 互換エイリアス（Firebase Auth） */
  const signInWithSupabase = signInWithSocial;

  const signOut = useCallback(() => {
    if (isExplicitSignOut()) return;
    beginExplicitSignOut();

    const clearLocal = () => {
      resetAccountData();
      clearSessionLocalState();
      prepareChatsForSignOut();
      releaseSessionBlocks();
      setIsGuestBrowsing(true);
      pendingResume.current = null;
      pendingAfterProfile.current = null;
      setLoginVisible(false);
      setLoginReason(undefined);
      setProfileSetupVisible(false);
    };

    try {
      clearLocal();
    } catch (error) {
      if (__DEV__) {
        console.warn('[auth] signOut local clear', error);
      }
      try {
        clearSessionLocalState();
        setAccountDataReady(false);
        setUser(null);
        userRef.current = null;
      } catch {
        // 画面状態のクリアに失敗しても、以降のサインアウトは続ける
      }
    }

    // 画面を先にゲストへ戻してから、リモートのセッション破棄を行う
    void (async () => {
      try {
        await unregisterDevicePushToken();
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth] unregister push on sign-out', error);
        }
      }
      try {
        await signOutFirebaseAuth();
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth] signOutFirebaseAuth', error);
        }
      } finally {
        endExplicitSignOut();
      }
    })();
  }, [clearSessionLocalState, releaseSessionBlocks, resetAccountData]);

  const deleteAccount = useCallback(async () => {
    const current = userRef.current;
    if (!current) {
      return { ok: false as const, error: 'ログインしていません。' };
    }

    try {
      const result = await deleteUserAccount(current.id);
      if (!result.ok) return result;

      beginExplicitSignOut();
      try {
        resetAccountData();
        clearSessionLocalState();
        setIsGuestBrowsing(true);
        pendingResume.current = null;
        pendingAfterProfile.current = null;
        setLoginVisible(false);
        setLoginReason(undefined);
        setProfileSetupVisible(false);
        resetJoinedClubs();
        clearPersistedJoinedClubs();
        clearBlockedUsers();
        prepareChatsForSignOut();
      } catch (error) {
        if (__DEV__) {
          console.warn('[auth] deleteAccount local clear', error);
        }
      }
      try {
        await clearPhoneVerification();
      } catch (error) {
        if (__DEV__) console.warn('[auth] clear phone on delete', error);
      }
      try {
        await resetNotificationSettings();
      } catch (error) {
        if (__DEV__) console.warn('[auth] reset notifications on delete', error);
      }
      try {
        await signOutFirebaseAuth();
      } catch (error) {
        if (__DEV__) console.warn('[auth] signOut on delete', error);
      }
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'アカウントを削除できませんでした。',
      };
    } finally {
      endExplicitSignOut();
    }
  }, [
    clearBlockedUsers,
    clearPersistedJoinedClubs,
    clearSessionLocalState,
    resetAccountData,
    resetJoinedClubs,
  ]);

  const value = useMemo(
    () => ({
      isReady,
      isLoggedIn: !!user,
      accountDataReady,
      isGuestBrowsing,
      user,
      loginVisible,
      loginReason,
      requireAuth,
      requireCompleteProfile,
      ensureNotBanned,
      openLogin,
      closeLogin,
      continueAsGuest,
      signInWithSocial,
      signInWithSupabase,
      applyAuthUser,
      signOut,
      deleteAccount,
      registerLoginLayer,
    }),
    [
      applyAuthUser,
      accountDataReady,
      closeLogin,
      continueAsGuest,
      deleteAccount,
      ensureNotBanned,
      isGuestBrowsing,
      isReady,
      loginReason,
      loginVisible,
      openLogin,
      registerLoginLayer,
      requireAuth,
      requireCompleteProfile,
      signInWithSocial,
      signInWithSupabase,
      signOut,
      user,
    ],
  );

  // iPad の RN Modal は認可シートの親になれず、閉じたあともタッチを塞ぐ。
  // ネイティブでは同じウィンドウ上のオーバーレイにして、ルートの画面から認可を出す。
  const loginPresentation = Platform.OS === 'web' ? 'modal' : 'overlay';

  return (
    <AuthContext.Provider value={value}>
      <View collapsable={false} style={styles.host}>
        {children}
        <LoginModal
          visible={loginVisible}
          reason={loginReason}
          presentation={loginPresentation}
          onClose={closeLogin}
          onSocialSignIn={signInWithSocial}
        />
        <PersonalProfileModal
          visible={profileSetupVisible}
          profile={userProfile}
          onClose={closeProfileSetup}
          onSave={completeProfileSetup}
        />
      </View>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
