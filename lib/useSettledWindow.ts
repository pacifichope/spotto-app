import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

type WindowSize = {
  width: number;
  height: number;
};

function readWindow(): WindowSize {
  const window = Dimensions.get('window');
  return {
    width: Math.round(window.width),
    height: Math.round(window.height),
  };
}

/**
 * 回転中の中間サイズでは再描画しない。
 * 最後の変化から少し待って、幅か高さが本当に変わったときだけ更新する。
 */
export function useSettledWindow(): WindowSize {
  const [size, setSize] = useState(readWindow);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const next = {
          width: Math.round(window.width),
          height: Math.round(window.height),
        };
        setSize((prev) => {
          // 幅が変わらない高さ変化はキーボードなので、ルートサイズは動かさない
          if (prev.width === next.width) return prev;
          return next;
        });
      }, 140);
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return size;
}
