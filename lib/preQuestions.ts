import i18n from '@/lib/i18n';

export type PreQuestionType = 'text' | 'single' | 'multi';

/**
 * イベント固有の追加質問のみ。
 * 氏名・電話番号などはアカウント情報から取得するため、ここには含めない。
 */
export type PreQuestion = {
  id: string;
  title: string;
  type: PreQuestionType;
  required: boolean;
  /** 参加時の事前質問として使うか */
  enabled: boolean;
  options: string[];
};

/** label は参照時に現在の言語で解決 */
export const PRE_QUESTION_TYPES: {
  value: PreQuestionType;
  readonly label: string;
}[] = [
  {
    value: 'text',
    get label() {
      return i18n.t('create.preQuestions.types.text');
    },
  },
  {
    value: 'single',
    get label() {
      return i18n.t('create.preQuestions.types.single');
    },
  },
  {
    value: 'multi',
    get label() {
      return i18n.t('create.preQuestions.types.multi');
    },
  },
];

export function preQuestionTypeLabel(type: PreQuestionType) {
  return i18n.t(`create.preQuestions.types.${type}`);
}

/** @deprecated preQuestionTypeLabel() を使う */
export const PRE_QUESTION_TYPE_LABELS: Record<PreQuestionType, string> =
  Object.defineProperties(
    {} as Record<PreQuestionType, string>,
    {
      text: {
        enumerable: true,
        get: () => preQuestionTypeLabel('text'),
      },
      single: {
        enumerable: true,
        get: () => preQuestionTypeLabel('single'),
      },
      multi: {
        enumerable: true,
        get: () => preQuestionTypeLabel('multi'),
      },
    },
  );

export const MAX_PRE_QUESTIONS = 15;
export const MAX_PRE_QUESTION_OPTIONS = 8;

/** 旧データのプロフィール系プリセット（読み込み時に除外） */
const LEGACY_PROFILE_PRESET_IDS = new Set([
  'preset-nickname',
  'preset-gender',
  'preset-name',
  'preset-phone',
  'preset-sns',
]);

/** 保存済みタイトル照合用（日本語固定のレガシー ID） */
const LEGACY_PROFILE_PRESET_TITLES = new Set([
  'ニックネーム',
  '性別',
  '氏名',
  '電話番号',
  'SNS / 連絡先',
  '連絡先',
]);

let questionSeq = 0;

/** アカウント情報で取得できる旧プリセット質問か */
export function isProfilePresetQuestion(
  question: Pick<PreQuestion, 'id' | 'title'> & { preset?: boolean },
): boolean {
  if (question.preset === true) return true;
  if (LEGACY_PROFILE_PRESET_IDS.has(question.id)) return true;
  const title = question.title.trim();
  return LEGACY_PROFILE_PRESET_TITLES.has(title);
}

/** 編集用: プロフィール系プリセットを除いたカスタム質問のみ残す */
export function stripProfilePresetQuestions(
  questions: Array<PreQuestion & { preset?: boolean }>,
): PreQuestion[] {
  return questions
    .filter((question) => !isProfilePresetQuestion(question))
    .map((question) => ({
      id: question.id,
      title: question.title,
      type: question.type,
      required: question.required,
      enabled: question.enabled ?? true,
      options: [...(question.options ?? [])],
    }));
}

export function createEmptyQuestion(): PreQuestion {
  questionSeq += 1;
  return {
    id: `q-${Date.now()}-${questionSeq}`,
    title: '',
    type: 'text',
    required: true,
    enabled: true,
    options: ['', ''],
  };
}

export function cloneQuestion(question: PreQuestion): PreQuestion {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    required: question.required,
    enabled: question.enabled ?? true,
    options: [...question.options],
  };
}

export function isChoiceType(type: PreQuestionType) {
  return type === 'single' || type === 'multi';
}

export function questionTypeHint(question: PreQuestion) {
  if (isChoiceType(question.type) && question.options.some((option) => option.trim())) {
    return question.options
      .map((option) => option.trim())
      .filter(Boolean)
      .join(' / ');
  }
  return preQuestionTypeLabel(question.type);
}

/**
 * 公開・保存用: カスタム質問のみ、有効かつタイトルあり。
 * preset フラグなど余分なフィールドは落とす。
 */
export function sanitizePreQuestions(
  questions: Array<PreQuestion & { preset?: boolean }>,
): PreQuestion[] {
  return stripProfilePresetQuestions(questions)
    .map((question) => {
      const title = question.title.trim();
      const options = isChoiceType(question.type)
        ? question.options.map((option) => option.trim()).filter(Boolean)
        : [];
      return {
        id: question.id,
        title,
        type: question.type,
        required: question.required !== false,
        enabled: question.enabled ?? true,
        options,
      };
    })
    .filter((question) => question.enabled && question.title.length > 0);
}
