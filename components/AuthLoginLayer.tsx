import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import LoginModal from '@/components/LoginModal';
import { useAuth } from '@/lib/authContext';

/**
 * すでに開いている Modal の内側にログインを重ねるとき用。
 * フォーカス中だけルート LoginModal を抑え、背面に残ったまま奪い続けない。
 * （通常の画面ではルートの LoginModal を使うこと）
 */
export default function AuthLoginLayer() {
  const {
    loginVisible,
    loginReason,
    closeLogin,
    signInWithSocial,
    registerLoginLayer,
  } = useAuth();

  useFocusEffect(
    useCallback(() => {
      return registerLoginLayer();
    }, [registerLoginLayer]),
  );

  return (
    <LoginModal
      presentation="overlay"
      visible={loginVisible}
      reason={loginReason}
      onClose={closeLogin}
      onSocialSignIn={signInWithSocial}
    />
  );
}
