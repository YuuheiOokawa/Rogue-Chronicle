import Link from 'next/link';

/** SCR-007 利用規約画面（文面ドラフト。公開前にISSUE-001の名称確定と併せて見直す） */
export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold">利用規約（ドラフト）</h1>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-content-muted">
        <p>
          本規約は、Rogue
          Chronicle（以下「本サービス」）の利用条件を定めるものです。プレイヤーの皆さまは、本規約に同意のうえ本サービスをご利用ください。
        </p>
        <h2 className="text-base font-semibold text-content">1. サービス内容</h2>
        <p>
          本サービスは、ブラウザで遊べるローグライトRPGです。個人により運営されており、サービス内容は予告なく変更・終了することがあります。稼働はベストエフォートで提供され、可用性を保証するものではありません。
        </p>
        <h2 className="text-base font-semibold text-content">2. アカウント</h2>
        <p>
          ゲストプレイのデータは端末（ブラウザ）に紐づきます。引き継ぎ設定を行っていないゲストデータは、ブラウザのデータ削除等により失われることがあります。
        </p>
        <h2 className="text-base font-semibold text-content">3. 禁止事項</h2>
        <p>
          不正なリクエストの送信、チート行為、本サービスの運営を妨げる行為、法令または公序良俗に違反する行為を禁止します。不正行為が確認された場合、アカウントの停止等の措置を行うことがあります。
        </p>
        <h2 className="text-base font-semibold text-content">4. 免責</h2>
        <p>
          本サービスの利用により生じた損害について、運営者は故意または重過失による場合を除き責任を負いません。
        </p>
        <h2 className="text-base font-semibold text-content">5. 規約の変更</h2>
        <p>本規約は必要に応じて変更されることがあります。変更後の規約はお知らせにて告知します。</p>
      </div>
      <p className="text-sm">
        <Link href="/" className="text-primary underline">
          タイトルへ戻る
        </Link>
      </p>
    </main>
  );
}
