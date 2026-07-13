import Link from 'next/link';

/** SCR-008 プライバシーポリシー画面（文面ドラフト。公開前に法的観点の確認を行う） */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold">プライバシーポリシー（ドラフト）</h1>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-content-muted">
        <h2 className="text-base font-semibold text-content">1. 取得する情報</h2>
        <p>
          本サービスは、アカウント登録時のメールアドレス、およびゲームプレイに関するデータ（進行状況・戦績等）を取得します。氏名・住所等の情報は取得しません。
        </p>
        <h2 className="text-base font-semibold text-content">2. 利用目的</h2>
        <p>
          取得した情報は、本人確認（ログイン）、データ引き継ぎ、不正行為の検知、サービス品質の改善のためにのみ利用します。
        </p>
        <h2 className="text-base font-semibold text-content">3. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得した情報を第三者に提供しません。サービス運用のため、ホスティング（Vercel）およびデータベース（Neon）の各事業者のインフラを利用します。
        </p>
        <h2 className="text-base font-semibold text-content">4. データの保管と削除</h2>
        <p>
          退会後、アカウントデータは30日以内に削除されます。長期間アクセスのないゲストデータは削除されることがあります。
        </p>
        <h2 className="text-base font-semibold text-content">5. Cookie</h2>
        <p>ログイン状態の維持のためにCookieを使用します。広告目的のCookieは使用しません。</p>
      </div>
      <p className="text-sm">
        <Link href="/" className="text-primary underline">
          タイトルへ戻る
        </Link>
      </p>
    </main>
  );
}
