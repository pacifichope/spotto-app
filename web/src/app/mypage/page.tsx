import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'マイページ',
  robots: { index: false, follow: false },
};

export default function MyPage() {
  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
      <p className="card-shadow mt-4 px-4 py-8 text-sm font-bold leading-6 text-[#5B6B75]">
        参加予定とプロフィールは、イベント詳細のログインから同じアカウントで確認できます。
      </p>
    </main>
  );
}
