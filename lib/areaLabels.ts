import {
  AREA_LABEL_NEARBY,
  AREA_LABEL_UNSET,
  getPrefectureById,
  nearestPrefectureId,
  type AreaSelection,
} from '@/lib/areas';
import i18n from '@/lib/i18n';
import type { MapRegion } from '@/lib/userLocation';

/**
 * エリア表示ラベルの多言語化ヘルパー。
 * 判定ロジックは lib/areas.ts のまま、表示文字列だけ実行時に i18n から引く。
 */

/** 都道府県の正式名（例: 東京都 / Tokyo） */
export function prefectureDisplayLabel(id: string | null | undefined): string {
  const prefecture = getPrefectureById(id);
  return i18n.t(`areas.prefectures.${prefecture.id}`, {
    defaultValue: prefecture.label,
  });
}

/** 都道府県の短縮名（例: 東京 / Tokyo） */
export function prefectureShortDisplayLabel(
  id: string | null | undefined,
): string {
  const prefecture = getPrefectureById(id);
  return i18n.t(`areas.prefecturesShort.${prefecture.id}`, {
    defaultValue: prefecture.shortLabel,
  });
}

/** 地方グループ見出し（PREFECTURE_GROUPS の並び順に対応） */
export function prefectureGroupDisplayTitle(
  index: number,
  fallback: string,
): string {
  return i18n.t(`areas.groups.${index}`, { defaultValue: fallback });
}

export function areaUnsetLabel(): string {
  return i18n.t('areas.unset', { defaultValue: AREA_LABEL_UNSET });
}

export function areaLocatingLabel(): string {
  return i18n.t('areas.locating');
}

export function areaNearbyLabel(): string {
  return i18n.t('areas.nearby', { defaultValue: AREA_LABEL_NEARBY });
}

/** lib/areas の getAreaLabel の多言語版 */
export function localizedAreaLabel(selection?: AreaSelection | null): string {
  if (!selection) return areaUnsetLabel();
  if (selection.mode === 'nearby') {
    const detected = selection.detectedLabel?.trim();
    if (detected) return detected;
    if (
      selection.latitude != null &&
      selection.longitude != null &&
      Number.isFinite(selection.latitude) &&
      Number.isFinite(selection.longitude)
    ) {
      return areaNearbyLabel();
    }
    return areaUnsetLabel();
  }
  return prefectureDisplayLabel(selection.prefectureId);
}

/** lib/areas の labelForMapRegion の多言語版 */
export function localizedMapRegionLabel(
  region?: MapRegion | null,
): string | null {
  if (
    !region ||
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude)
  ) {
    return null;
  }
  const prefectureId = nearestPrefectureId(region.latitude, region.longitude);
  if (!prefectureId) return null;
  return prefectureShortDisplayLabel(prefectureId);
}
