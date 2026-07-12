/**
 * SCR-002 タイトル画面（Phase 1 プレースホルダ）。
 * 正式実装は Phase 2（認証導線）/ Phase 10（演出）。docs/09_Screen_Design.md §4.1 参照。
 */
export default function TitlePage() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-between px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm tracking-[0.3em] text-content-muted">ROGUELITE RPG</p>
        <h1 className="text-4xl font-bold tracking-wide text-accent-gold">Rogue Chronicle</h1>
        <p className="max-w-[36ch] text-sm leading-relaxed text-content-muted">
          挑戦するたびに姿を変えるダンジョン。
          敗北してもあなたの記録（クロニクル）は残り、次の挑戦を強くする。
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          disabled
          className="h-12 w-full rounded-lg bg-primary font-semibold text-white opacity-50"
          aria-disabled="true"
        >
          はじめる（Phase 2で実装）
        </button>
        <p className="text-xs text-content-muted">v0.1.0 — Phase 1: プロジェクト初期構築</p>
      </div>
    </main>
  );
}
