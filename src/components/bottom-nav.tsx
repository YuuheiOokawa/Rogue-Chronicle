import Link from 'next/link';

type Tab = 'home' | 'characters' | 'upgrades' | 'codex' | 'settings';

const TABS: { key: Tab; label: string; icon: string; href: string }[] = [
  { key: 'home', label: 'ホーム', icon: '🏠', href: '/home' },
  { key: 'characters', label: 'キャラ', icon: '🛡', href: '/characters' },
  { key: 'upgrades', label: '強化', icon: '✦', href: '/upgrades' },
  { key: 'codex', label: '図鑑', icon: '📖', href: '/codex' },
  { key: 'settings', label: '設定', icon: '⚙', href: '/settings' },
];

/** 下部固定ナビ5タブ（docs/09 SCR-101。強化・図鑑はPhase 8で解放） */
export function BottomNav(props: { current: Tab }) {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-raised bg-surface-base/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-[480px]">
        {TABS.map((tab) => {
          const active = tab.key === props.current;
          const className = `flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
            active ? 'font-bold text-primary' : 'text-content-muted'
          }`;
          return (
            <li key={tab.key} className="flex-1">
              {tab.href ? (
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={className}
                >
                  <span aria-hidden>{tab.icon}</span>
                  {tab.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="今後のアップデートで解放"
                  className={`${className} opacity-40`}
                >
                  <span aria-hidden>{tab.icon}</span>
                  {tab.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
