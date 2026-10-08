import {
  InstagramGlyphMark,
  LineSpeechMark,
  WebsiteGlobeMark,
  XLogoMark,
} from '@/components/socialBrandMarks';
import { snsKindMeta, type SnsKind } from '@/lib/snsLinks';

type SnsBrandIconProps = {
  kind: SnsKind;
  /** 円バッジの直径 */
  size?: number;
};

const INSTAGRAM_GRADIENT =
  'linear-gradient(135deg, #F58529 0%, #DD2A7B 45%, #8134AF 75%, #515BD4 100%)';

/** SNS / Web の公式ブランドアイコンを円バッジで表示 */
export function SnsBrandIcon({ kind, size = 44 }: SnsBrandIconProps) {
  const meta = snsKindMeta(kind);
  const px = Math.max(24, Math.round(size));
  const glyph =
    kind === 'instagram'
      ? Math.round(px * 0.48)
      : kind === 'x'
        ? Math.round(px * 0.42)
        : kind === 'line'
          ? Math.round(px * 0.58)
          : Math.round(px * 0.48);

  const mark =
    kind === 'instagram' ? (
      <InstagramGlyphMark size={glyph} color="#FFFFFF" />
    ) : kind === 'x' ? (
      <XLogoMark size={glyph} color="#FFFFFF" />
    ) : kind === 'line' ? (
      <LineSpeechMark size={glyph} color="#FFFFFF" />
    ) : (
      <WebsiteGlobeMark size={glyph} color="#FFFFFF" />
    );

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: px,
        height: px,
        background: kind === 'instagram' ? INSTAGRAM_GRADIENT : meta.color,
      }}
      aria-hidden
    >
      {mark}
    </span>
  );
}
