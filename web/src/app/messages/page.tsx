import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'メッセージ',
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-extrabold tracking-tight">メッセージ</h1>
      <p className="card-shadow mt-4 px-4 py-8 text-sm font-bold leading-6 text-[#5B6B75]">
        参加したイベントのチャットは、ログイン後にアプリと同じアカウントで開けます。
      </p>
    </main>
  );
}
