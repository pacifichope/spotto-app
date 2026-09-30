import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';
import { organizerInitial } from '@/lib/organizerProfile';
import { safeResolveDisplayImageUrl } from '@/lib/imageUrls';
import type { UserGender } from '@/lib/userProfile';

export type AvatarGender = UserGender | '' | undefined;

/** プロフィール性別に応じたアバター枠線色 */
export function avatarBorderColor(gender?: AvatarGender) {
  if (gender === '男性') return theme.colors.genderMaleBorder;
  if (gender === '女性') return theme.colors.genderFemaleBorder;
  return theme.colors.primary;
}

type HostAvatarProps = {
  name: string;
  imageUri?: string;
  size?: number;
  /** 個人プロフィールの性別。未設定時はデフォルト枠線 */
  gender?: AvatarGender;
  /** 枠線の太さ（0 で枠なし） */
  borderWidth?: number;
};

export default function HostAvatar({
  name,
  imageUri,
  size = 36,
  gender,
  borderWidth = 2,
}: HostAvatarProps) {
  const borderColor = avatarBorderColor(gender);
  const inner = Math.max(0, size - borderWidth * 2);
  const [loadFailed, setLoadFailed] = useState(false);

  const displayUri = useMemo(
    () => safeResolveDisplayImageUrl(imageUri),
    [imageUri],
  );

  useEffect(() => {
    setLoadFailed(false);
  }, [displayUri]);

  const showImage = Boolean(displayUri) && !loadFailed;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
          backgroundColor: theme.colors.primarySoft,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: displayUri }}
          resizeMode="cover"
          onError={() => {
            if (__DEV__) {
              console.warn('[HostAvatar] image load failed', {
                name,
                uri: displayUri,
              });
            }
            setLoadFailed(true);
          }}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          }}
        />
      ) : (
        <Text style={[styles.letter, { fontSize: Math.max(10, size * 0.36) }]}>
          {organizerInitial(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
