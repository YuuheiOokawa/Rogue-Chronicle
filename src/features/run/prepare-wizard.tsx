'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError, usePending } from '@/components/auth-form';

interface CharacterOption {
  code: string;
  name: string;
  description: string;
  element: string;
  favoredWeaponType: string;
  baseStats: Record<string, number>;
  unlocked: boolean;
}
interface EquipmentOption {
  code: string;
  name: string;
  slot: string;
  weaponType: string | null;
  rarity: string;
  baseStats: Record<string, number | undefined>;
}

const ELEMENT_LABEL: Record<string, string> = {
  none: '無',
  fire: '火',
  water: '水',
  wind: '風',
};
const SLOT_LABEL: Record<string, string> = { weapon: '武器', armor: '防具', accessory: '装飾' };

/** SCR-204/205/207 出撃準備の3ステップウィザード（API-303で出撃） */
export function PrepareWizard(props: {
  dungeon: { code: string; name: string; floors: number };
  characters: CharacterOption[];
  equipment: EquipmentOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [characterCode, setCharacterCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string | null>>({
    weapon: null,
    armor: null,
    accessory: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = usePending();

  const character = props.characters.find((c) => c.code === characterCode) ?? null;

  const start = () =>
    run(async () => {
      setError(null);
      const res = await fetch('/api/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dungeonCode: props.dungeon.code,
          difficulty: 'normal',
          characterCode,
          equipment: selected,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          errorCode?: string;
          message?: string;
        } | null;
        if (body?.errorCode === 'ERR_RUN_ALREADY_ACTIVE') {
          router.push('/run/map');
          return;
        }
        setError(body?.message ?? '出撃に失敗しました');
        return;
      }
      router.push('/run/map');
    });

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">出撃準備 — {props.dungeon.name}</h1>
        <Link href={`/dungeons/${props.dungeon.code}`} className="text-sm text-content-muted underline">
          戻る
        </Link>
      </header>
      <ol className="flex gap-2 text-xs text-content-muted">
        {(['キャラクター', '初期装備', '出撃確認'] as const).map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-primary text-white' : 'bg-surface-raised'}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      <FormError message={error} />

      {step === 1 ? (
        <section className="flex flex-col gap-3">
          {props.characters.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={!c.unlocked}
              onClick={() => {
                setCharacterCode(c.code);
                setSelected({ weapon: null, armor: null, accessory: null });
                setStep(2);
              }}
              className={`rounded-lg p-4 text-left ${
                c.unlocked ? 'bg-surface-raised' : 'bg-surface-raised/40 text-content-muted'
              } ${characterCode === c.code ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{c.unlocked ? c.name : '？？？（未解放）'}</span>
                <span className="text-xs">{ELEMENT_LABEL[c.element] ?? c.element}属性</span>
              </div>
              {c.unlocked ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-content-muted">{c.description}</p>
                  <p className="mt-2 font-mono text-xs text-content-muted">
                    HP {c.baseStats.maxHp} / 攻 {c.baseStats.atk} / 防 {c.baseStats.def} / 速{' '}
                    {c.baseStats.spd}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs">キャラクター一覧から解放できます</p>
              )}
            </button>
          ))}
        </section>
      ) : null}

      {step === 2 && character ? (
        <section className="flex flex-col gap-4">
          {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
            const options = props.equipment.filter((e) => e.slot === slot);
            return (
              <div key={slot} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-content-muted">{SLOT_LABEL[slot]}</h2>
                {options.length === 0 ? (
                  <p className="text-xs text-content-muted">所持している{SLOT_LABEL[slot]}がありません（なしで出撃できます）</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {options.map((e) => {
                      const favored = slot === 'weapon' && e.weaponType === character.favoredWeaponType;
                      const active = selected[slot] === e.code;
                      return (
                        <button
                          key={e.code}
                          type="button"
                          onClick={() =>
                            setSelected((prev) => ({ ...prev, [slot]: active ? null : e.code }))
                          }
                          className={`flex items-center justify-between rounded-lg bg-surface-raised px-4 py-3 text-left ${active ? 'ring-2 ring-primary' : ''}`}
                        >
                          <span className="text-sm font-semibold">
                            {e.name}
                            {favored ? (
                              <span className="ml-2 text-xs text-accent-gold">得意武器 +10%</span>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs text-content-muted">
                            {Object.entries(e.baseStats)
                              .filter(([, v]) => typeof v === 'number')
                              .map(([k, v]) => `${k}+${v}`)
                              .join(' ')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-12 flex-1 rounded-lg border border-surface-raised text-content-muted"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-12 flex-1 rounded-lg bg-primary font-semibold text-white"
            >
              次へ
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && character ? (
        <section className="flex flex-col gap-4">
          <div className="rounded-lg bg-surface-raised p-4 text-sm">
            <p className="font-bold">{props.dungeon.name}（全{props.dungeon.floors}階層・ノーマル）</p>
            <p className="mt-2">キャラクター: {character.name}</p>
            <p className="mt-1 text-content-muted">
              装備:{' '}
              {(['weapon', 'armor', 'accessory'] as const)
                .map((slot) => {
                  const code = selected[slot];
                  const name = props.equipment.find((e) => e.code === code)?.name;
                  return `${SLOT_LABEL[slot]}=${name ?? 'なし'}`;
                })
                .join(' / ')}
            </p>
            <p className="mt-3 text-xs text-content-muted">
              ※敗北すると冒険中に得たレベル・スキル・装備・ゴールドは失われます。記録（図鑑・ソウルシャードの一部）は残ります。
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={pending}
              className="h-12 flex-1 rounded-lg border border-surface-raised text-content-muted disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="h-14 flex-1 rounded-lg bg-primary text-lg font-bold text-white disabled:opacity-50"
            >
              {pending ? '出撃中…' : '出撃する'}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
