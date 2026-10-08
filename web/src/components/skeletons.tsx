/** 読み込み中テキストの代わりに使うプレースホルダー群 */

export function FadeIn({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`content-fade-in ${className}`.trim()}>{children}</div>;
}

function Bone({ className = '' }: { className?: string }) {
  return <span className={`skeleton-bone block ${className}`.trim()} aria-hidden />;
}

/** メッセージ一覧・クラブ一覧などの行カード */
export function ListRowSkeleton({ rounded = 'full' }: { rounded?: 'full' | '2xl' }) {
  return (
    <li className="card-shadow flex items-center gap-3 px-5 py-4" aria-hidden>
      <Bone
        className={`h-12 w-12 shrink-0 ${rounded === 'full' ? 'rounded-full' : 'rounded-2xl'}`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-3.5 w-[42%] max-w-[10rem] rounded-full" />
        <Bone className="h-3 w-[70%] max-w-[14rem] rounded-full" />
      </div>
    </li>
  );
}

export function ListRowsSkeleton({
  count = 4,
  rounded = 'full',
  className = 'mt-5 space-y-2',
}: {
  count?: number;
  rounded?: 'full' | '2xl';
  className?: string;
}) {
  return (
    <ul className={className} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton key={index} rounded={rounded} />
      ))}
    </ul>
  );
}

/** メッセージ一覧（1カード内の区切り行） */
export function MessageListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <section className="card-shadow mt-4 overflow-hidden" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`flex items-center gap-3.5 px-4 py-3.5 ${
            index > 0 ? 'border-t border-[#E4EBEE]' : ''
          }`}
          aria-hidden
        >
          <Bone className="h-12 w-12 shrink-0 rounded-2xl sm:h-14 sm:w-14" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex justify-between gap-3">
              <Bone className="h-3.5 w-[55%] max-w-[12rem] rounded-full" />
              <Bone className="h-3 w-10 shrink-0 rounded-full" />
            </div>
            <Bone className="h-3 w-16 rounded-full" />
            <Bone className="h-3 w-[75%] max-w-[16rem] rounded-full" />
          </div>
        </div>
      ))}
    </section>
  );
}

/** チャットルームの吹き出し */
export function ChatBubblesSkeleton() {
  return (
    <div className="card-shadow mt-4 flex flex-1 flex-col overflow-hidden" aria-busy="true">
      <div className="flex-1 space-y-4 px-3 py-4 sm:px-4" style={{ minHeight: '40vh' }}>
        <div className="flex justify-start gap-2" aria-hidden>
          <Bone className="h-8 w-8 shrink-0 rounded-full" />
          <Bone className="h-14 w-[58%] max-w-[14rem] rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end gap-2" aria-hidden>
          <Bone className="h-12 w-[48%] max-w-[12rem] rounded-2xl rounded-br-md" />
          <Bone className="h-8 w-8 shrink-0 rounded-full" />
        </div>
        <div className="flex justify-start gap-2" aria-hidden>
          <Bone className="h-8 w-8 shrink-0 rounded-full" />
          <Bone className="h-20 w-[64%] max-w-[16rem] rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end gap-2" aria-hidden>
          <Bone className="h-10 w-[40%] max-w-[10rem] rounded-2xl rounded-br-md" />
          <Bone className="h-8 w-8 shrink-0 rounded-full" />
        </div>
      </div>
      <div className="border-t border-[#E4EBEE] p-3" aria-hidden>
        <Bone className="h-11 w-full rounded-full" />
      </div>
    </div>
  );
}

/** イベントカードグリッド（マイページ等） */
export function EventCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <article key={index} className="card-shadow overflow-hidden" aria-hidden>
          <Bone className="h-40 w-full rounded-none" />
          <div className="space-y-2 px-4 py-3">
            <Bone className="h-3 w-20 rounded-full" />
            <Bone className="h-4 w-[80%] rounded-full" />
            <Bone className="h-3 w-[60%] rounded-full" />
          </div>
        </article>
      ))}
    </div>
  );
}

/** 設定・フォーム系ページ */
export function SettingsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mt-5 space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="card-shadow flex items-center gap-3 px-4 py-4"
          aria-hidden
        >
          <Bone className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-3.5 w-[40%] max-w-[9rem] rounded-full" />
            <Bone className="h-3 w-[65%] max-w-[14rem] rounded-full" />
          </div>
          <Bone className="h-4 w-4 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

/** マイページ本体（プロフィール＋リスト） */
export function MyPageSkeleton() {
  return (
    <div className="mt-5 space-y-5" aria-busy="true">
      <section className="card-shadow flex items-center gap-4 px-5 py-5" aria-hidden>
        <Bone className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bone className="h-4 w-[45%] max-w-[10rem] rounded-full" />
          <Bone className="h-3 w-[60%] max-w-[14rem] rounded-full" />
        </div>
      </section>
      <div className="flex gap-2" aria-hidden>
        <Bone className="h-9 w-24 rounded-full" />
        <Bone className="h-9 w-24 rounded-full" />
        <Bone className="h-9 w-20 rounded-full" />
      </div>
      <EventCardsSkeleton count={4} />
    </div>
  );
}

/** クラブ詳細 */
export function ClubDetailSkeleton() {
  return (
    <div className="pb-28" aria-busy="true">
      <Bone className="h-44 w-full rounded-none sm:h-56 md:h-64 md:rounded-b-3xl" />
      <div className="-mt-10 flex justify-center" aria-hidden>
        <Bone className="h-[72px] w-[72px] rounded-full border-4 border-white sm:h-20 sm:w-20" />
      </div>
      <div className="mt-4 space-y-3 px-2 text-center" aria-hidden>
        <Bone className="mx-auto h-5 w-40 rounded-full" />
        <Bone className="mx-auto h-3 w-28 rounded-full" />
        <Bone className="mx-auto h-3 w-48 rounded-full" />
        <Bone className="mx-auto mt-2 h-16 w-full max-w-xl rounded-2xl" />
      </div>
      <div className="card-shadow mt-6 px-4 py-4" aria-hidden>
        <Bone className="h-3.5 w-28 rounded-full" />
        <div className="mt-3 flex gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex w-16 flex-col items-center gap-2">
              <Bone className="h-11 w-11 rounded-full" />
              <Bone className="h-2.5 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 space-y-3" aria-hidden>
        <Bone className="h-4 w-32 rounded-full" />
        <Bone className="h-20 w-full rounded-2xl" />
        <Bone className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** チケット */
export function TicketSkeleton() {
  return (
    <div className="mx-auto mt-8 max-w-md space-y-4" aria-busy="true">
      <Bone className="h-48 w-full rounded-3xl" />
      <Bone className="mx-auto h-4 w-40 rounded-full" />
      <Bone className="mx-auto h-3 w-56 rounded-full" />
      <Bone className="h-24 w-full rounded-2xl" />
    </div>
  );
}

/** 売上・口座などダッシュボード */
export function DashboardSkeleton() {
  return (
    <div className="mt-5 space-y-3" aria-busy="true">
      <Bone className="h-28 w-full rounded-3xl" />
      <Bone className="h-20 w-full rounded-2xl" />
      <Bone className="h-20 w-full rounded-2xl" />
      <Bone className="h-16 w-full rounded-2xl" />
    </div>
  );
}

/** 参加者アバター列 */
export function AttendeesSkeleton() {
  return (
    <div className="mt-3 flex gap-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Bone key={i} className="h-10 w-10 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

/** 認証コールバックなど最小 */
export function PulseBlock({ className = 'h-12 w-48' }: { className?: string }) {
  return (
    <div className="flex justify-center" aria-busy="true">
      <Bone className={`${className} rounded-2xl`} />
    </div>
  );
}
