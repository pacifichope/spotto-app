'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth-context';
import {
  setRuntimeFirebaseConfig,
  type FirebasePublicConfig,
} from '@/lib/env';
import { LocaleProvider } from '@/lib/i18n/locale-context';

export function Providers({
  children,
  firebaseConfig,
}: {
  children: ReactNode;
  /** Root Layout（サーバー）で読んだ Firebase 公開設定。クライアント埋め込みの保険。 */
  firebaseConfig: FirebasePublicConfig;
}) {
  // レンダー時に注入（AuthProvider より先に同じツリーで評価される）
  setRuntimeFirebaseConfig(firebaseConfig);

  return (
    <LocaleProvider>
      <AuthProvider>{children}</AuthProvider>
    </LocaleProvider>
  );
}
