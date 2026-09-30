import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';

import OrganizerProfileModal from '@/components/OrganizerProfileModal';
import { useAuth } from '@/lib/authContext';
import { useEvents } from '@/lib/eventsContext';
import {
  hasOrganizerProfileReady,
  organizerDisplayName,
  type OrganizerProfile,
} from '@/lib/organizerProfile';
import { usePhoneVerification } from '@/lib/phoneVerificationContext';

type CreateEventAccessContextValue = {
  /**
   * ログイン → BAN → 電話番号認証 → 主催者アカウント登録 → onReady。
   * 未完了のステップがあればそこで止め、完了後に続きを実行する。
   */
  requestCreateAccess: (onReady: () => void) => void;
  /** 主催者プロフィール編集（イベント作成は開かない） */
  openOrganizerEditor: () => void;
};

const CreateEventAccessContext =
  createContext<CreateEventAccessContextValue | null>(null);

export function CreateEventAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { requireAuth, ensureNotBanned } = useAuth();
  const { requirePhoneVerified } = usePhoneVerification();
  const { organizerProfile, updateOrganizerProfile } = useEvents();
  const [editorVisible, setEditorVisible] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const pendingResume = useRef<(() => void) | null>(null);
  const profileRef = useRef(organizerProfile);
  profileRef.current = organizerProfile;

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setSetupMode(false);
    pendingResume.current = null;
  }, []);

  const openOrganizerEditor = useCallback(() => {
    pendingResume.current = null;
    setSetupMode(false);
    setEditorVisible(true);
  }, []);

  const requireOrganizerProfile = useCallback((resume?: () => void) => {
    if (hasOrganizerProfileReady(profileRef.current)) return true;
    pendingResume.current = resume ?? null;
    setSetupMode(true);
    setEditorVisible(true);
    return false;
  }, []);

  const requestCreateAccess = useCallback(
    (onReady: () => void) => {
      const afterOrganizer = () => {
        onReady();
      };
      const afterPhone = () => {
        if (!requireOrganizerProfile(afterOrganizer)) return;
        afterOrganizer();
      };
      const afterLogin = () => {
        void (async () => {
          if (!(await ensureNotBanned())) return;
          if (!requirePhoneVerified(afterPhone)) return;
          afterPhone();
        })();
      };
      if (!requireAuth(afterLogin, 'create-event')) return;
      afterLogin();
    },
    [ensureNotBanned, requireAuth, requireOrganizerProfile, requirePhoneVerified],
  );

  const handleSave = useCallback(
    (next: OrganizerProfile) => {
      void (async () => {
        const result = await updateOrganizerProfile(next);
        setEditorVisible(false);
        setSetupMode(false);
        const resume = pendingResume.current;
        pendingResume.current = null;
        if (!result.ok) {
          Alert.alert(
            '一部保存できませんでした',
            result.error ||
              '端末には保存しましたが、サーバー同期に失敗した可能性があります。',
          );
        }
        if (resume && hasOrganizerProfileReady(next)) {
          setTimeout(() => resume(), 80);
          return;
        }
        if (result.ok) {
          Alert.alert(
            '主催者アカウントを保存しました',
            `${organizerDisplayName(next)} としてイベントに表示されます。`,
          );
        }
      })();
    },
    [updateOrganizerProfile],
  );

  const value = useMemo(
    () => ({
      requestCreateAccess,
      openOrganizerEditor,
    }),
    [openOrganizerEditor, requestCreateAccess],
  );

  return (
    <CreateEventAccessContext.Provider value={value}>
      {children}
      <OrganizerProfileModal
        visible={editorVisible}
        profile={organizerProfile}
        setupMode={setupMode}
        onClose={closeEditor}
        onSave={handleSave}
      />
    </CreateEventAccessContext.Provider>
  );
}

export function useCreateEventAccess() {
  const ctx = useContext(CreateEventAccessContext);
  if (!ctx) {
    throw new Error(
      'useCreateEventAccess must be used within CreateEventAccessProvider',
    );
  }
  return ctx.requestCreateAccess;
}

export function useOrganizerEditor() {
  const ctx = useContext(CreateEventAccessContext);
  if (!ctx) {
    throw new Error(
      'useOrganizerEditor must be used within CreateEventAccessProvider',
    );
  }
  return ctx.openOrganizerEditor;
}
