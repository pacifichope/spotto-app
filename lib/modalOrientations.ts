/**
 * iPad は横向きになる。Modal の既定は portrait だけで、
 * 回転後にタッチを奪ったまま画面が固まる。
 */
export const MODAL_ORIENTATIONS = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
] as const;
