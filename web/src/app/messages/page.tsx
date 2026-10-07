import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'メッセージ',
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return (
    <main className="pt-4 md:pt-2">
      <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
      <section className="card-shadow mt-4 px-5 py-8">
        <p className="text-sm font-bold leading-6 text-[#5B6B75]">
          参加したイベントのチャットは、アプリと同じアカウントで開けます。Web
          版のチャット一覧は順次対応予定です。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/mypage"
            className="brand-gradient inline-flex h-11 items-center rounded-full px-5 text-sm font-extrabold"
          >
            マイページへ
          </Link>
          <Link
            href="/settings"
            className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-extrabold text-[#5B6B75] shadow-sm ring-1 ring-[#E4EBEE]"
          >
            設定
          </Link>
        </div>
      </section>
    </main>
  );
}
