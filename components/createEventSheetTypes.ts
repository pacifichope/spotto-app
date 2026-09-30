import type {
  SkillLevel,
  RegistrationDeadlineOffset,
  EventSession,
} from '@/lib/events';
import type { PreQuestion } from '@/lib/preQuestions';

export type ScheduleType = 'single' | 'recurring';

export type CreateEventPayload = {
  title: string;
  sport: string;
  emoji: string;
  level: SkillLevel;
  date: string;
  time: string;
  endDate?: string;
  endTime?: string;
  sessions?: EventSession[];
  location: string;
  /** 集合場所の補足（例: 体育館2階、正面入り口集合） */
  locationNote?: string;
  description: string;
  /** 一覧・カバー用の先頭画像 */
  imageUri: string;
  /** ユーザーが選んだ写真（1枚以上、最大5枚） */
  imageUris: string[];
  capacity: number;
  priceYen: number;
  cancelPolicy: string;
  protection: string;
  scheduleType: ScheduleType;
  latitude: number;
  longitude: number;
  /** イベント開始の何時間前に締め切るか。0 = 開始時、'end' = 終了時 */
  registrationDeadlineOffset?: RegistrationDeadlineOffset;
  /** 参加前のイベント固有の追加質問を有効にするか（氏名等はアカウントから取得） */
  enablePreQuestions?: boolean;
  /** カスタム事前質問のみ（プロフィール項目は含まない） */
  preQuestions?: PreQuestion[];
  itemsToBring?: string[];
  includedItems?: string[];
  /** 参加しやすい年齢層・雰囲気の目安（任意・複数可） */
  targetAgeGroups?: string[];
};

export type CreateEventSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export type CreateEventSheetProps = {
  onSubmit?: (payload: CreateEventPayload) => void;
};
