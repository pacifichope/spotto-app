export type EventContentBlockKind =
  | 'title'
  | 'overview'
  | 'meetup'
  | 'schedule'
  | 'location'
  | 'note';

export type EventContentBlock = {
  id: string;
  kind: EventContentBlockKind;
  text: string;
};

const MEETUP_RE =
  /集合|受付|ゲート|玄関|入口|エントランス|待ち合わせ|集合場所/;
const SCHEDULE_RE =
  /時間|スタート|開始|終了|分前|時間後|日程|スケジュール|開催/;
const LOCATION_RE = /場所|会場|コート|グラウンド|公園|駅|住所|アクセス/;

function classifyLine(text: string, index: number): EventContentBlockKind {
  if (MEETUP_RE.test(text)) return 'meetup';
  if (LOCATION_RE.test(text)) return 'location';
  if (index === 0) {
    if (/[【「『［\[]/.test(text) || text.length <= 40) return 'title';
    return 'overview';
  }
  if (index === 1) return 'overview';
  if (SCHEDULE_RE.test(text)) return 'schedule';
  return 'note';
}

/**
 * イベント説明文を段落単位に分割し、見出し・集合・時間などを推定する。
 */
export function parseEventContentBlocks(raw: string): EventContentBlock[] {
  const cleaned = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return [];

  // 空行で段落、なければ改行単位
  const paragraphs = cleaned.includes('\n\n')
    ? cleaned
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
    : cleaned
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

  return paragraphs.map((text, index) => ({
    id: `block-${index}`,
    kind: classifyLine(text, index),
    text,
  }));
}

export function eventContentBlockLabel(kind: EventContentBlockKind): string {
  switch (kind) {
    case 'title':
      return 'ハイライト';
    case 'overview':
      return '概要';
    case 'meetup':
      return '集合';
    case 'schedule':
      return 'スケジュール';
    case 'location':
      return '場所';
    case 'note':
      return '詳細';
  }
}
