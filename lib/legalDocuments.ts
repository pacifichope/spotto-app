import i18n from '@/lib/i18n';

export type LegalDocSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocumentId = 'terms' | 'privacy' | 'tokushoho';

export const LEGAL_UPDATED_AT = '2026-09-21';

const LEGAL_TITLE_KEYS: Record<LegalDocumentId, string> = {
  terms: 'settings.terms',
  privacy: 'settings.privacy',
  tokushoho: 'settings.tokushoho',
};

/** UI 表示用タイトル（呼び出し時に現在言語で解決） */
export function legalDocTitle(document: LegalDocumentId): string {
  return i18n.t(LEGAL_TITLE_KEYS[document], {
    defaultValue: i18n.t('legal.fallbackTitle'),
  });
}

/** UI 表示用イントロ */
export function legalDocIntro(document: LegalDocumentId): string {
  return i18n.t(`legal.intro.${document}`);
}

/**
 * 互換: タイトル／イントロは実行時に言語解決されるゲッター付き。
 * セクション本文は法的文書の原文（日本語）を維持。
 */
export const LEGAL_DOC_META: Record<
  LegalDocumentId,
  { title: string; intro: string }
> = {
  terms: {
    get title() {
      return legalDocTitle('terms');
    },
    get intro() {
      return legalDocIntro('terms');
    },
  },
  privacy: {
    get title() {
      return legalDocTitle('privacy');
    },
    get intro() {
      return legalDocIntro('privacy');
    },
  },
  tokushoho: {
    get title() {
      return legalDocTitle('tokushoho');
    },
    get intro() {
      return legalDocIntro('tokushoho');
    },
  },
};

export const TERMS_SECTIONS: LegalDocSection[] = [
  {
    id: 'scope',
    title: '第1条（適用）',
    paragraphs: [
      '本規約は、本サービスの提供条件および本サービスの利用に関する当社とユーザーとの間の権利義務関係を定めることを目的とし、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されます。',
    ],
  },
  {
    id: 'account',
    title: '第2条（アカウント）',
    paragraphs: [
      'ユーザーは、正確かつ最新の情報をもってアカウントを登録・維持するものとします。第三者にアカウントを利用させ、または貸与・譲渡してはなりません。',
      '当社は、虚偽の登録、不正利用、または本規約違反が認められる場合、事前通知なくアカウントの停止・削除その他必要な措置をとることができます。',
    ],
  },
  {
    id: 'service',
    title: '第3条（サービスの内容）',
    paragraphs: [
      '本サービスは、スポーツ等のイベントの掲載・発見・参加申込・決済・チャット等の機能を提供します。当社はイベントの主催者ではなく、主催者と参加者のマッチングおよび決済の仲介等を行うプラットフォームです。',
      'イベントの内容・安全・実施可否についての責任は、原則として主催者に帰属します。',
    ],
  },
  {
    id: 'payment',
    title: '第4条（料金・決済）',
    paragraphs: [
      '有料イベントの参加費は、各イベントページに表示された金額とします。決済は当社が指定する決済事業者（Stripe等）を通じて行われます。',
      '主催者への売上の支払いは、当社所定の手数料（プラットフォーム利用料・振込手数料等）を控除したうえで、当社の定めるスケジュールにより行います。詳細は主催者ガイドラインおよび特定商取引法に基づく表記をご確認ください。',
    ],
  },
  {
    id: 'cancel',
    title: '第5条（キャンセル・返金）',
    paragraphs: [
      '参加者によるキャンセルおよび返金可否は、各イベントに設定されたキャンセルポリシーに従います。主催者都合による中止の場合、原則として参加費を全額返金します。',
      '返金が発生した場合、当該分は主催者の売上総額およびプラットフォーム利用料の算定から自動的に相殺されます。',
    ],
  },
  {
    id: 'prohibit',
    title: '第6条（禁止事項）',
    paragraphs: [
      'ユーザーは、法令または公序良俗に反する行為、他者の権利侵害、虚偽情報の掲載、不正アクセス、迷惑行為、なりすまし、他人名義の振込口座の登録その他当社が不適切と判断する行為を行ってはなりません。',
    ],
  },
  {
    id: 'ip',
    title: '第7条（知的財産）',
    paragraphs: [
      '本サービスに関する著作権その他の知的財産権は、当社または正当な権利者に帰属します。ユーザーが投稿したコンテンツについて、当社は本サービスの提供・改善・宣伝のために必要な範囲で利用できるものとします。',
    ],
  },
  {
    id: 'disclaimer',
    title: '第8条（免責）',
    paragraphs: [
      '当社は、本サービスの正確性・完全性・有用性・特定目的適合性について保証しません。イベント当日のトラブル、参加可否、損害等について、当社に故意または重過失がある場合を除き責任を負いません。',
      '当社の損害賠償責任は、当該ユーザーが当社に支払った直近1か月分の利用料相当額を上限とします（無料利用の場合は0円）。',
    ],
  },
  {
    id: 'change',
    title: '第9条（規約の変更）',
    paragraphs: [
      '当社は、必要に応じて本規約を変更できます。変更後の規約は、本サービス上での掲示その他当社所定の方法により効力を生じます。',
    ],
  },
  {
    id: 'law',
    title: '第10条（準拠法・管轄）',
    paragraphs: [
      '本規約は日本法に準拠し、本サービスに関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalDocSection[] = [
  {
    id: 'collect',
    title: '1. 取得する情報',
    paragraphs: [
      '当社は、本サービスの提供にあたり、以下の情報を取得することがあります。',
    ],
    bullets: [
      'アカウント情報（氏名または表示名、メールアドレス、電話番号、プロフィール画像等）',
      '主催者の振込口座情報（銀行名・支店・口座番号・名義等）',
      'イベント情報、参加・決済・チャット・お問い合わせに関する情報',
      '端末情報、ログ、Cookie、広告識別子、位置情報（許諾がある場合）',
      'ソーシャルログインにより連携された識別子および公開プロフィール情報',
    ],
  },
  {
    id: 'purpose',
    title: '2. 利用目的',
    paragraphs: ['取得した個人情報は、以下の目的で利用します。'],
    bullets: [
      '本サービスの提供、本人確認、不正防止、サポート対応',
      '決済処理、売上集計、主催者への振込および関連する通知',
      '重要なお知らせ、リマインダー、プッシュ通知・メールの送信',
      'サービス改善、統計分析、新機能の検討',
      '法令に基づく対応、紛争解決',
    ],
  },
  {
    id: 'share',
    title: '3. 第三者提供・委託',
    paragraphs: [
      '当社は、決済（Stripe等）、ホスティング（Supabase等）、メール送信、プッシュ通知配信など、業務委託先に必要な範囲で個人情報の取扱いを委託することがあります。法令に基づく場合を除き、本人の同意なく第三者に提供しません。',
    ],
  },
  {
    id: 'security',
    title: '4. 安全管理',
    paragraphs: [
      '当社は、個人情報の漏えい・滅失・毀損の防止のため、アクセス制御、通信の暗号化、権限管理その他合理的な安全管理措置を講じます。',
    ],
  },
  {
    id: 'rights',
    title: '5. 開示・訂正・削除等',
    paragraphs: [
      'ユーザーは、法令の定めに従い、自己の個人情報の開示、訂正、利用停止、削除等を求めることができます。アカウント削除機能またはお問い合わせ窓口よりご請求ください。',
    ],
  },
  {
    id: 'cookie',
    title: '6. Cookie等',
    paragraphs: [
      '本サービス（特にWeb版）では、利便性向上や利用状況の把握のため Cookie や類似技術を使用することがあります。ブラウザ設定により拒否できる場合がありますが、一部機能が利用できなくなることがあります。',
    ],
  },
  {
    id: 'contact',
    title: '7. お問い合わせ',
    paragraphs: [
      '個人情報の取扱いに関するお問い合わせは、アプリ内「お問い合わせ」または support@spotto.fun までご連絡ください。',
    ],
  },
];

export const TOKUSHOHO_SECTIONS: LegalDocSection[] = [
  {
    id: 'seller',
    title: '販売事業者',
    paragraphs: [
      '名称: spotto 運営（サービス名: spotto）',
      '連絡先: support@spotto.fun（アプリ内「お問い合わせ」からも受付）',
      '住所・代表者名: 請求があった場合に遅滞なく開示します。',
    ],
  },
  {
    id: 'price',
    title: '販売価格',
    paragraphs: [
      '各イベントページに表示された参加費（税込表示。表示がない場合はイベント詳細の記載に従います）。',
      'プラットフォーム利用料（主催者負担: 売上の10%）および振込手数料（主催者への振込時 一律500円税込）は、主催者向けの受取額計算に適用されます。',
    ],
  },
  {
    id: 'extra',
    title: '代金以外の必要料金',
    paragraphs: [
      '決済手数料は原則として当社または決済事業者の負担区分に従い、イベント表示価格に含まれます。通信費等はユーザーの負担です。',
    ],
  },
  {
    id: 'payment-time',
    title: '支払方法・支払時期',
    paragraphs: [
      '支払方法: クレジットカード等（Stripe による決済）。',
      '支払時期: イベント参加申込時（決済完了時点で課金）。',
      '主催者への売上振込: 毎月末日締め・翌月末日払い（終了済みイベントの確定売上を対象）。',
    ],
  },
  {
    id: 'delivery',
    title: '役務の提供時期',
    paragraphs: [
      'デジタルサービスとしての予約確定は決済完了後ただちに行い、イベント本体の役務は各イベントに表示された開催日時に提供されます。',
    ],
  },
  {
    id: 'cancel-policy',
    title: 'キャンセル・返金に関する特約',
    paragraphs: [
      '参加者都合のキャンセル: 各イベントに設定されたキャンセルポリシー（例: 開催の○時間前まで全額返金、以降は返金なし）に従います。ポリシー期限外のキャンセルでは参加費の返金はありません。',
      '主催者都合の中止: 原則として参加費を全額返金します。',
      '返金処理: 決済事業者経由で返金し、主催者の売上台帳から当該金額および対応するプラットフォーム利用料を相殺します。',
      'クーリングオフ: 本サービスにおけるイベント参加の性質上、特定商取引法上のクーリングオフの適用対象外となる場合があります。詳細は個別契約およびイベント表示をご確認ください。',
    ],
  },
  {
    id: 'software',
    title: '動作環境',
    paragraphs: [
      '対応: iOS / Android アプリおよび対応ブラウザによる Web。最新版 OS・ブラウザでの利用を推奨します。',
    ],
  },
];

export function legalSections(document: LegalDocumentId): LegalDocSection[] {
  if (document === 'terms') return TERMS_SECTIONS;
  if (document === 'privacy') return PRIVACY_SECTIONS;
  return TOKUSHOHO_SECTIONS;
}
