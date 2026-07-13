import Link from 'next/link';

import { PageHeader } from '@/components/page-header';

/** SCR-117 ヘルプ画面（docs/09 §5.2。静的コンテンツ） */
export default function HelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-6 py-6">
      <PageHeader title="ヘルプ" backHref="/home" />

      <Section title="ゲームの流れ">
        <p>
          「ラン」と呼ばれる1回の挑戦で、全10階層のダンジョンを攻略します。
          各階層でノード（戦闘・宝箱・ショップ・休憩・イベントなど）を1つ選んで進み、
          階層10のボスを倒せばクリアです。
        </p>
        <p>
          敗北してもラン中に獲得したソウルシャードの一部は持ち帰れます（クリア100% / リタイア80% /
          敗北50%）。挑戦するたびに拠点が強くなるのがこのゲームの核です。
        </p>
      </Section>

      <Section title="戦闘">
        <p>
          ターン制の戦闘です。攻撃・スキル・防御・アイテム・逃走から行動を選びます。
          敵の次の行動は「予告アイコン」で表示されるので、それを見て対策しましょう。
        </p>
        <p>
          属性相性（火→風→水→火）があり、有利属性で攻撃するとダメージが増えます。
          スキルはSPを消費します。SPは毎ターン少しずつ回復します。
        </p>
      </Section>

      <Section title="成長とスキル">
        <p>
          戦闘で経験値を得てレベルアップすると、スキルを3つの候補から1つ選んで習得できます。
          同じスキルを再取得すると強化されます（最大Lv3、所持上限8枠）。
        </p>
      </Section>

      <Section title="ソウルシャードと永続強化">
        <p>
          ソウルシャードはラン終了時に獲得できる永続通貨です。新しいキャラクターの解放や、
          拠点の永続強化（今後のアップデートで開放）に使用します。
        </p>
      </Section>

      <Section title="データの引き継ぎ">
        <p>
          ゲストのままでもプレイできますが、メールアドレスを登録すると他の端末でも
          同じデータで遊べます。設定画面の「データ引き継ぎ設定」から登録してください。
        </p>
      </Section>

      <p className="text-xs text-content-muted">
        その他のご質問は
        <Link href="/announcements" className="underline">
          お知らせ
        </Link>
        も確認してください。
      </p>
    </main>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-raised p-4 text-sm text-content-muted">
      <h2 className="text-sm font-bold text-content">▼ {props.title}</h2>
      {props.children}
    </section>
  );
}
