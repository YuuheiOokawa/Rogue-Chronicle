# 19. 敵・敵AI設計書（Enemy & Enemy AI Design）

- 対象プロダクト: Rogue Chronicle（ローグライトRPG）
- 目的: 敵マスタデータ構造、AI決定アルゴリズム（完全ランダム禁止・行動予告つき）、MVP敵8種の完全データ、ボス3フェーズ仕様、ドロップ・図鑑連携を実装可能な粒度で定義する
- 準拠: CORE_SPEC §5.1〜§5.4・§5.7（ステータス・計算式・敵一覧はCORE_SPECと完全一致）。基礎ステータス数値は16_Battle_Design.md §5（DEC-033）と同一
- 関連文書: 16_Battle_Design.md / 17_Dungeon_Design.md / 18_Skill_Design.md / 12_Database_Design.md / 13_API_Design.md

---

## 1. 敵データ構造（マスタ3テーブル）

### 1.1 enemies

| 列 | 型 | 内容 |
|---|---|---|
| id | uuid PK | — |
| code | text UNIQUE | 英小文字スネーク（例: `ruin_guardian`）。CORE_SPEC §3 |
| name | text | 表示名 |
| enemy_type | text | normal / strong / elite / boss（bossesテーブルは作らず本列で統合。CORE_SPEC §8） ※strongは「通常敵に強敵補正を掛けた出現形態」のためマスタ行としてはnormalのみ登録し、補正はスポーン時適用（§8） |
| element | text | none / fire / water / wind（CORE_SPEC §5.2） |
| base_stats | jsonb | `{ "maxHp": 30, "atk": 8, "def": 5, "spd": 6, "critRate": 5, "critDmg": 150, "eva": 0, "acc": 0, "statusRes": 0, "elemRes": {} }` |
| base_exp | int | 獲得EXP基礎値（式は§9.1） |
| base_gold | int | 獲得ゴールド基礎値（式は§9.2） |
| drop_table_id | uuid FK → reward_tables | ドロップ抽選テーブル（§9.3） |
| appear_floors | int[] | 出現階層範囲（例: `{1,2,3,4,5}`） |

### 1.2 enemy_actions（1敵N行動）

| 列 | 型 | 内容 |
|---|---|---|
| id | uuid PK / enemy_id | uuid FK → enemies |
| code | text | 行動コード（敵内ユニーク。例: `orc_mighty`） |
| name | text | 表示名（ログ・図鑑用） |
| action_type | text | attack / strong_attack / debuff / buff / heal / summon / guard |
| skill_mult | numeric | ダメージ倍率（非ダメージ行動は0）。ダメージ式は16章§4.1をそのまま使用 |
| effect | jsonb | 付随効果（例: `{"status":{"code":"weaken","chance":80}}`, `{"heal":{"target":"self","ratio":0.25}}`, `{"summon":{"enemyCode":"slime","count":1}}`, `{"drainRatio":1.0}`, `{"buff":{"code":"atkUp","target":"allyAll"}}`, `{"counter":{"mult":0.5,"maxPerTurn":2}}`） |
| intent_icon | text | 行動予告アイコン。16章§7.1のcategory（attack / strong_attack / buff / debuff / heal / summon / unknown）と1:1対応 |

### 1.3 enemy_ai_rules（1敵Nルール）

| 列 | 型 | 内容 |
|---|---|---|
| id | uuid PK / enemy_id | uuid FK → enemies |
| priority | int | 小さいほど先に評価。**condition=nullの行は「基本重みテーブル」**（priority=100で統一） |
| condition | jsonb NULL | 条件DSL（§2.2）。複数キーはAND。nullは無条件（基本テーブル行） |
| action_code | text | enemy_actions.code 参照 |
| weight | int | 同一priority内での重み抽選用（合致行動群の中で正規化） |

- run_state.battle.enemies[] にはスポーン時にこれらを展開したスナップショットを保持する（マスタ更新がラン途中の戦闘に影響しないように）

---

## 2. AI決定アルゴリズム（完全ランダム禁止）

### 2.1 決定手順（selectEnemyAction）

1. **条件ルール評価**: enemy_ai_rules を priority昇順に評価し、条件に合致した**最小priorityのルール群**を取得する
2. **重み抽選**: 合致ルール群が空でなければ、その中から weight で抽選（rngCursor 1消費）
3. **基本重みテーブル**: 合致なしの場合、condition=null の行（priority=100）から weight で抽選
4. 決定した行動を intent として保存・表示し、次の自行動でそのまま実行する（§2.3）

```typescript
// src/domain/enemy/selectEnemyAction.ts（擬似コード）
function selectEnemyAction(enemy: EnemyBattleState, battle: BattleState, rng: Rng): EnemyAction {
  const rules = [...enemy.aiRules].sort((a, b) => a.priority - b.priority);
  const matched: AiRule[] = [];
  let matchedPriority: number | null = null;

  for (const rule of rules) {
    if (rule.condition === null) continue;                       // 基本テーブル行は後段で使用
    if (matchedPriority !== null && rule.priority !== matchedPriority) break; // 最小priority群のみ
    if (evalCondition(rule.condition, enemy, battle)) {
      matched.push(rule);
      matchedPriority = rule.priority;
    }
  }

  const pool = matched.length > 0
    ? matched                                                    // (1) 合致ルール群から重み抽選
    : rules.filter(r => r.condition === null);                   // (2) 基本重みテーブル
  const picked = weightedPick(rng, pool);                        // rngCursor +1
  return enemy.actions.find(a => a.code === picked.actionCode)!;
}

function evalCondition(cond: Json, enemy: EnemyBattleState, battle: BattleState): boolean {
  return Object.entries(cond).every(([key, v]) => evalConditionKey(key, v, enemy, battle)); // 全キーAND
}
```

### 2.2 条件DSL（condition JSONB のキー一覧）

| キー | 例 | 意味 |
|---|---|---|
| hpBelow | `{"hpBelow":0.5}` | 自身のhp/maxHp < 値 |
| hpAbove | `{"hpAbove":0.7}` | 自身のhp/maxHp > 値 |
| playerHpBelow | `{"playerHpBelow":0.35}` | プレイヤーのhp/maxHp < 値 |
| turnMod | `{"turnMod":{"n":2,"eq":0}}` | 行動が**実行されるターン番号** % n == eq（intentは先抽選のため「次ターン番号」で評価する。§2.3） |
| selfBuffMissing | `{"selfBuffMissing":"atkUp"}` | 自身に該当バフ/状態がない |
| allyBuffMissing | `{"allyBuffMissing":"atkUp"}` | 敵側生存者に該当バフを持たない者が1体以上いる |
| targetStatusMissing | `{"targetStatusMissing":"weaken"}` | プレイヤーに該当状態異常が付与されていない |
| allyCount | `{"allyCount":{"lt":2}}` / `{"allyCount":{"gte":2}}` | 自身を含む敵側の生存数の比較 |
| phaseShiftPending | `{"phaseShiftPending":true}` | ボス専用: 直前のターン終了時にフェーズ移行が発生した（§6.3） |
| turnsInPhaseMod | `{"turnsInPhaseMod":{"n":3,"eq":0}}` | ボス専用: 現フェーズ突入後の経過ターン % n == eq |

- 未知キーは評価falseとしログ警告（マスタ入力ミスの検出）。条件は全キーANDのみ（ORは行を分けて表現する）

### 2.3 行動予告（intent）—「次ターン行動を先に抽選して表示→そのまま実行」方式（仮決定、16章§7.1・DEC-036準拠）

1. **決定タイミング**: 戦闘開始時（1ターン目分）と各ターン終了処理の最後。この時点で selectEnemyAction を実行し確定させる（**turnModは次ターン番号で評価**）
2. **保存・表示**: `run_state.battle.enemies[].intent = { actionCode, targetHint, category }`。API-401/402応答に含め、SCR-302で全敵の頭上にアイコン表示（CORE_SPEC §5.7「行動予告を全敵に表示」）
3. **実行**: 保存済みintentを再抽選せずそのまま実行。**無効化時のフォールバック**（DEC-036）: 対象死亡・HP全快でのheal・場が満員でのsummon等は「通常攻撃（各敵の基本attack行動）」に差し替え
4. スタン・麻痺で行動不能だった場合、intentは消化されず次ターンも同じintentを維持（予告詐欺防止）
5. 表示粒度: アイコン（category）+ ダメージ行動は「予測ダメージ帯」は表示しない（MVPはアイコンのみ。仮決定 DEC-050）

---

## 3. 敵共通パラメータ（仮決定 DEC-050）

- critRate: 全敵5%（batのみ10%）/ critDmg: 全敵150% / acc: 全敵0 / elemRes: 全敵なし（属性相性のみで差別化）
- 階層スケーリング（CORE_SPEC §5.4）:

```
stat(floor) = floor(base × (1 + 0.12 × (floor - 1)) × difficultyMod × 種別補正)
  種別補正（HP/ATKのみ）: 通常×1.0 / 強敵 HP×1.5,ATK×1.15 / エリート HP×2.0,ATK×1.3 / ボス HP×4.0,ATK×1.5
  DEF/SPDは階層スケールのみ。difficultyMod: Normal 1.0（MVP唯一）
  階層係数: 階層3=×1.24 / 階層5=×1.48 / 階層8=×1.84 / 階層10=×2.08
```

## 4. MVP敵8種 基礎データ表（基礎値は16章DEC-033と同一）

| code | 名前 | 種別 | 属性 | baseHP | baseATK | baseDEF | baseSPD | クリ率 | 回避(eva) | 状態異常耐性 | baseExp | baseGold | 出現階層(appear_floors) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slime | スライム | 通常 | 水 | 30 | 8 | 5 | 6 | 5% | 0 | 0 | 8 | 10 | 1〜5（+召喚） |
| goblin | ゴブリン | 通常 | 無 | 40 | 10 | 6 | 8 | 5% | 0 | 0 | 10 | 14 | 1〜6 |
| bat | 洞窟コウモリ | 通常 | 風 | 28 | 9 | 4 | 13 | 10% | 15 | 0 | 10 | 12 | 2〜7 |
| skeleton | スケルトン | 通常 | 無 | 45 | 9 | 12 | 7 | 5% | 0 | 20 | 12 | 15 | 3〜9 |
| fire_imp | 火の小鬼 | 通常 | 火 | 34 | 11 | 5 | 9 | 5% | 5 | 0 | 12 | 15 | 4〜9 |
| orc_champion | オークチャンピオン | エリート | 無 | 50 | 12 | 8 | 8 | 5% | 0 | 30 | 40 | 60 | 3〜9 |
| dark_shaman | 闇のシャーマン | エリート | 水 | 42 | 11 | 7 | 10 | 5% | 5 | 30 | 40 | 60 | 4〜9 |
| ruin_guardian | 遺跡の守護者 | ボス | 無 | 60 | 13 | 10 | 9 | 5% | 0 | 60 | 150 | 200 | 10 |

### 4.1 階層3・階層8の実数値例（種別補正込み・Normal・floor丸め）

計算例: goblin階層3 HP = floor(40 × (1+0.12×2)) = floor(40×1.24) = 49。orc_champion階層8 HP = floor(50 × 1.84 × 2.0) = 184、ATK = floor(12 × 1.84 × 1.3) = floor(28.70) = 28。

| 敵 | 階層3 HP/ATK/DEF/SPD | 階層8 HP/ATK/DEF/SPD |
|---|---|---|
| slime | 37 / 9 / 6 / 7 | 55 / 14 / 9 / 11 ※出現範囲外の参考値 |
| goblin | 49 / 12 / 7 / 9 | 73 / 18 / 11 / 14 ※参考値 |
| bat | 34 / 11 / 4 / 16 | 51 / 16 / 7 / 23 ※参考値 |
| skeleton | 55 / 11 / 14 / 8 | 82 / 16 / 22 / 12 |
| fire_imp | 42 / 13 / 6 / 11 ※参考値 | 62 / 20 / 9 / 16 |
| orc_champion（HP×2.0, ATK×1.3） | 124 / 19 / 9 / 9 | 184 / 28 / 14 / 14 |
| dark_shaman（HP×2.0, ATK×1.3） | 104 / 17 / 8 / 12 ※参考値 | 154 / 26 / 12 / 18 |
| ruin_guardian（HP×4.0, ATK×1.5） | —（階層10固定） | 階層10: **499 / 40 / 20 / 18** |

（階層1/5/10の実数値は16章§5.2、16章と同式・同値）

---

## 5. 敵別 行動一覧・AIルール表（数値は仮決定 DEC-051）

行動のダメージ計算・命中・クリティカル・状態異常成功率は全て16章§4の式を共用する。weightは同一priority内の合致ルール群の中で正規化される（§2.1）。

### 5.1 slime（スライム）— 低脅威・回復小技持ち

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| slime_tackle | 体当たり | attack | 1.0 | — | attack |
| slime_heal | 自己修復 | heal | 0 | `{"heal":{"target":"self","ratio":0.25}}`（maxHpの25%、floor） | heal |

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"hpBelow":0.5}` | slime_heal | 70 |
| 10 | `{"hpBelow":0.5}` | slime_tackle | 30 |
| 100 | null（基本） | slime_tackle | 100 |

### 5.2 goblin（ゴブリン）— 標準アタッカー

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| goblin_slash | なぎ切り | attack | 1.0 | — | attack |
| goblin_smash | 力任せの一撃 | strong_attack | 1.5 | — | strong_attack |

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"playerHpBelow":0.35}` | goblin_smash | 100 ※とどめ狙い |
| 100 | null | goblin_slash | 70 |
| 100 | null | goblin_smash | 30 |

### 5.3 bat（洞窟コウモリ）— 高速・高回避・吸血

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| bat_bite | 噛みつき | attack | 0.9 | — | attack |
| bat_drain | 吸血 | attack | 0.7 | `{"drainRatio":1.0}`（与ダメージの100%を自己回復、maxHp上限） | heal |

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"hpBelow":0.6}` | bat_drain | 80 |
| 10 | `{"hpBelow":0.6}` | bat_bite | 20 |
| 100 | null | bat_bite | 70 |
| 100 | null | bat_drain | 30 |

### 5.4 skeleton（スケルトン）— 高防御・weaken付与・防御時カウンター

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| skeleton_strike | 骨打ち | attack | 1.0 | — | attack |
| skeleton_curse | 骨の呪い | debuff | 0 | `{"status":{"code":"weaken","chance":80}}`（基本成功率80%、statusResで軽減） | debuff |
| skeleton_guard | 白骨の構え | guard | 0 | `{"guard":true,"counter":{"mult":0.5,"maxPerTurn":2}}` | unknown（盾アイコン） |

**カウンター仕様（仮決定 DEC-054）**: skeleton_guard実行ターンの終了まで、①受ける全ダメージ50%減（防御コマンドと同処理）、②プレイヤーの直接ダメージ行動（attack / damage / damage_aoe）で被弾するたび、**即時に skill_mult 0.5 で反撃**する（命中判定あり・クリティカルなし・無属性・1ターン最大2回）。状態異常tickダメージ・シールド越しの0ダメージには反撃しない。反撃はactionLogに `type: enemy_action, code: skeleton_counter` として記録する。

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"turnMod":{"n":3,"eq":0}}` | skeleton_guard | 100 ※3の倍数ターンに構える |
| 20 | `{"targetStatusMissing":"weaken"}` | skeleton_curse | 60 |
| 20 | `{"targetStatusMissing":"weaken"}` | skeleton_strike | 40 |
| 100 | null | skeleton_strike | 100 |

### 5.5 fire_imp（火の小鬼）— burn付与

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| imp_claw | 引っかき | attack | 0.9 | — | attack |
| imp_firebolt | 火の粉 | attack | 1.1 | `{"status":{"code":"burn","chance":80}}`（火属性ダメージ+burn80%。16章§4.5の例と一致） | strong_attack（炎アイコン） |

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"targetStatusMissing":"burn"}` | imp_firebolt | 70 |
| 10 | `{"targetStatusMissing":"burn"}` | imp_claw | 30 |
| 100 | null | imp_claw | 60 |
| 100 | null | imp_firebolt | 40 |

### 5.6 orc_champion（オークチャンピオン・エリート）— 2ターンごと強撃（予告あり）

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| orc_smash | 叩きつけ | attack | 1.0 | — | attack |
| orc_mighty | 渾身の一撃 | strong_attack | 2.0 | — | strong_attack |
| orc_warcry | 雄叫び | buff | 0 | `{"buff":{"code":"atkUp","target":"self"}}`（atk+25%/3T。16章DEC-035の初期値） | buff |

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"turnMod":{"n":2,"eq":0}}` | orc_mighty | 100 ※偶数ターンは必ず強撃=CORE_SPEC「2ターンごと強撃(予告あり)」。intent先抽選により前ターン終了時点で予告される |
| 20 | `{"selfBuffMissing":"atkUp","hpBelow":0.7}` | orc_warcry | 100 |
| 100 | null | orc_smash | 100 |

### 5.7 dark_shaman（闇のシャーマン・エリート）— デバフ・仲間強化・召喚

| 行動code | 名称 | action_type | skill_mult | effect | intent |
|---|---|---|---|---|---|
| shaman_bolt | 深淵の弾 | attack | 1.1 | 水属性ダメージ | attack |
| shaman_weaken | 衰弱の呪い | debuff | 0 | `{"status":{"code":"weaken","chance":90}}` | debuff |
| shaman_bless | 邪神の加護 | buff | 0 | `{"buff":{"code":"atkUp","target":"allyAll"}}`（敵側全体にatk+25%/3T） | buff |
| shaman_summon | 深淵の呼び声 | summon | 0 | `{"summon":{"enemyCode":"slime","count":1}}` | summon |

**召喚仕様（仮決定 DEC-053）**: スライム1体を空きスロットに召喚する。①場の敵は最大3体（満員時はintentフォールバックで shaman_bolt に差し替え。DEC-036）、②召喚スライムのステータスは現在階層のスケール適用値（通常補正）、③行動は次ターンから（召喚ターンは行動キューに入らない）、④召喚スライムの**EXP・ゴールド・ドロップは0**（無限狩り防止）、⑤図鑑登録・killsカウントは対象になる。

| priority | condition | action_code | weight |
|---|---|---|---|
| 10 | `{"allyCount":{"lt":2}}` | shaman_summon | 100 ※単独になったら必ず召喚（初手も単独出現のため1ターン目に召喚予告） |
| 20 | `{"targetStatusMissing":"weaken"}` | shaman_weaken | 70 |
| 20 | `{"targetStatusMissing":"weaken"}` | shaman_bolt | 30 |
| 30 | `{"allyBuffMissing":"atkUp","allyCount":{"gte":2}}` | shaman_bless | 60 |
| 30 | `{"allyBuffMissing":"atkUp","allyCount":{"gte":2}}` | shaman_bolt | 40 |
| 100 | null | shaman_bolt | 100 |

---

## 6. ボス詳細: ruin_guardian「遺跡の守護者」3フェーズ

階層10ステータス（§4.1）: **HP499 / ATK40 / DEF20 / SPD18 / statusRes60**。逃走不可。行動コード・重みは16章§8と共通。

### 6.1 フェーズ定義（HP割合。hpBelow条件で判定）

| フェーズ | HP帯 | HP実数値（maxHp499） |
|---|---|---|
| フェーズ1「静観」 | 100%〜70%超 | 499〜350 |
| フェーズ2「覚醒」 | 70%〜40%超 | 349〜200 |
| フェーズ3「暴走」 | 40%〜0% | 199〜0 |

### 6.2 行動テーブル（weightは各フェーズ内で合計100）

| 行動code | 名称 | action_type | skill_mult | effect / intent | P1 | P2 | P3 |
|---|---|---|---|---|---|---|---|
| guardian_smash | 守護者の一撃 | attack | 1.0 | — / attack | 60 | 40 | 30 |
| guardian_crush | 圧砕 | strong_attack | 1.6 | `{"status":{"code":"stun","chance":20}}` / strong_attack | 20 | 30 | 40 |
| guardian_harden | 硬化 | buff | 0 | `{"buff":{"code":"defUp","target":"self"}}`（def+25%/3T） / buff | 20 | 10 | 0 |
| guardian_roar | 崩壊の咆哮 | debuff | 0 | `{"status":{"code":"atkDown","chance":90}}`（atk-25%/3T） / debuff | 0 | 20 | 10 |
| guardian_quake | 崩落の一撃（全体攻撃） | strong_attack | 2.2 | 全体対象（MVPは対象=プレイヤー1体） / strong_attack **必ず1ターン前に予告** | 0 | 移行時+条件 | 20 |

### 6.3 AIルール表（enemy_ai_rules表現）

| priority | condition | action_code | weight |
|---|---|---|---|
| 5 | `{"phaseShiftPending":true}` | guardian_quake | 100 ※フェーズ移行の翌行動は必ず「崩落の一撃」。**移行が起きたターンの終了処理でintentに予告が表示され、次の自行動で発動**（=1ターン前予告） |
| 10 | `{"hpBelow":0.4,"turnsInPhaseMod":{"n":3,"eq":0}}` | guardian_quake | 100 ※P3中は3ターンごとに再発動（毎回予告つき） |
| 20 | `{"hpBelow":0.4}` | guardian_smash | 30 |
| 20 | `{"hpBelow":0.4}` | guardian_crush | 40 |
| 20 | `{"hpBelow":0.4}` | guardian_roar | 10 |
| 20 | `{"hpBelow":0.4}` | guardian_quake | 20 |
| 30 | `{"hpBelow":0.7}` | guardian_smash | 40 |
| 30 | `{"hpBelow":0.7}` | guardian_crush | 30 |
| 30 | `{"hpBelow":0.7}` | guardian_harden | 10 |
| 30 | `{"hpBelow":0.7}` | guardian_roar | 20 |
| 100 | null（P1基本） | guardian_smash | 60 |
| 100 | null | guardian_crush | 20 |
| 100 | null | guardian_harden | 20 |

- `phaseShiftPending` は「ターン終了時のフェーズ判定で帯が変わった」ときに立ち、guardian_quake の予告を出した時点で消費する（各フェーズ移行につき1回）
- **怒り状態（CORE_SPEC §5.7）**: HP≤50%（249以下）になった瞬間、恒久フラグ `enrage`（**atk+30%**、解除不能、バフ枠外）を得る。フェーズとは独立に判定
- 被弾想定: guardian_quake = 40 × 1.3(怒り) × 2.2 × (100/119) ≒ 96ダメージ（防御で48）。予告ターンに防御・回復を選ばせる設計（16章§8と同値）

---

## 7. 難易度別補正

- **MVP: Normalのみ**。difficultyMod = 1.0（ステータス・EXP・報酬とも等倍）
- **将来Hardの方針（仮決定 DEC-056）**: ①difficultyMod 1.3（CORE_SPEC §5.4。EXP・報酬も同率増加）、②**AIルール追加方式**: enemy_ai_rules に difficulty列（default 'normal'）を追加し、Hard専用ルールを重ねる。数値式の変更やコード分岐はしない（データ駆動）
  - 追加例: goblinに priority 15 `{"turnMod":{"n":3,"eq":0}}` → goblin_smash 100（3ターンごと強撃）/ ruin_guardianのP3 quake周期を3→2ターン / slimeの自己修復ratioを0.25→0.35

## 8. 敵編成（スポーン）ルール（仮決定 DEC-057）

戦闘ノード進入時（API-305）にサーバーが編成を抽選する（rngCursor消費）。敵スロットは enemies[0]〜[2]、行動順は16章§2.2。

| ノード | 編成 |
|---|---|
| BATTLE | 敵数: 階層1〜3 = 1体50% / 2体50%、階層4〜6 = 1体15% / 2体60% / 3体25%、階層7〜9 = 1体10% / 2体40% / 3体50%。プール = appear_floorsに現階層を含む通常敵（等重み・同種は最大2体） |
| STRONG | プールから1体に強敵補正（HP×1.5, ATK×1.15）。階層6以降は50%で通常敵1体随伴。EXP・ゴールド1.5倍（17章§2） |
| ELITE | 階層3 = orc_champion固定 / 階層4〜9 = orc_champion 50% / dark_shaman 50%。単体出現（shamanは召喚で増える） |
| BOSS | ruin_guardian 単体（階層10） |

- 編成例: 階層3のBATTLE（プール = slime/goblin/bat/skeleton）で2体 → 例 `[goblin, bat]`、階層8（プール = skeleton/fire_imp）で3体 → 例 `[skeleton, fire_imp, fire_imp]`

## 9. 報酬・ドロップ

### 9.1 EXP（CORE_SPEC §5.4そのまま）

```
獲得EXP = Σ 敵のbaseExp × (1 + 0.10 × (floor - 1)) × difficultyExpMod（Normal 1.0）
```
例: goblin（baseExp10）階層1→10 / 階層5→14 / 階層10→19（16章§4.6と同値）。召喚スライムは0（DEC-053）。

### 9.2 ゴールド（16章DEC-038そのまま）

```
ゴールド = floor(Σ 敵のbaseGold × (1 + 0.10 × (floor - 1)) × rand(0.9〜1.1))
```

| 敵 | baseGold | 階層1での範囲 | 階層5での範囲 |
|---|---|---|---|
| slime | 10 | 9〜11 | 12〜15 |
| goblin | 14 | 12〜15 | 17〜21 |
| bat | 12 | 10〜13 | 15〜18 |
| skeleton | 15 | 13〜16 | 18〜23 |
| fire_imp | 15 | 13〜16 | 18〜23 |
| orc_champion | 60 | —（階層3〜） | 75〜92 |
| dark_shaman | 60 | —（階層4〜） | 75〜92 |
| ruin_guardian | 200 | —（階層10のみ） | 階層10: 342〜418 |

（STRONG戦はゴールド・EXPとも1.5倍を乗算後にfloor）

### 9.3 ドロップ（reward_tables参照方式・仮決定 DEC-052）

`enemies.drop_table_id → reward_tables(code, entries[{itemType, itemCode|rarityPool, weight}])` を参照し、**戦闘単位で1回**ドロップ判定→当選時にentriesを重み抽選する。

| 敵種別 | ドロップ発生率 | 参照テーブル | entries（重み） |
|---|---|---|---|
| 通常（BATTLE） | **10%** | rt_battle_normal | 消耗品60 / 装備common35 / 装備rare5 |
| 強敵（STRONG） | **30%** | rt_battle_strong | 装備common50 / 装備rare40 / 消耗品10 |
| エリート（ELITE） | **50%** | rt_battle_elite | 装備rare60 / 装備epic20 / レリック20 |
| ボス（BOSS） | **100%（固定+抽選）** | rt_boss | レリック1個確定 + 装備epic 50%で追加 |

- レア度重み内の個別装備は該当レア度のequipmentから等重み（レリックは未所持から等重み、全所持時は装備rareへ振替）
- ※16章§9.1の表（通常30%/強敵50%/エリート100%）は初期案であり、**本表（10/30/50/100）を正とする**（ISSUE-112で16章を改訂）
- ドロップ判定・抽選は勝利処理（checkBattleEnd→calculateBattleReward）内でサーバー実行し、`run_state.pendingReward` へ格納 → phase=reward_pending（17章§10.1）

## 10. 敵図鑑（player_codex連携・仮決定 DEC-055）

- **登録契機**: 敵を初回撃破（HP0にした）時点で `run_state.earned.defeatedEnemies[]` にcodeを重複なしで追加 → **リザルト確定（API-307）時**に `player_codex` へ upsert（entry_type='enemy', entry_code, discovered_at）。敗北・リタイアのランでも撃破済み分は登録される
- 召喚スライムの撃破も登録・kills集計の対象（DEC-053）
- 図鑑表示（SCR-110 / API-601）: 発見済み = 名前・イラスト・属性・種別・基礎ステータス・行動一覧（名称とintentアイコン）・ドロップ内容・累計撃破数（player_progressの統計から）。未発見 = シルエット+「？？？」
- 撃破数などの統計は player_progress 側に集計（player_codexは発見フラグと初回日時のみ）

---

## 未決事項

| ID | 内容 |
|---|---|
| ISSUE-111 | ボスのフェーズ3閾値: 本書は40%（HP199以下）、16章§8は35%と記載されており不一致。**本書40%を正**として16章§8を改訂する |
| ISSUE-112 | ドロップ発生率: 本書（通常10%/強敵30%/エリート50%/ボス100%）と16章§9.1（30/50/100/100）が不一致。**本書を正**として16章を改訂する。実プレイでの装備入手テンポは要検証 |
| ISSUE-113 | intentカテゴリに guard 系がない（16章§7.1の列挙は attack/strong_attack/buff/debuff/heal/summon/unknown）。skeleton_guard は暫定 unknown+盾アイコン。カテゴリ「defend」の追加を16章と合わせて検討 |
| ISSUE-114 | bat のクリ率10%は16章DEC-033に未記載の本書追加値（DEC-050）。バランス検証のうえ16章早見表への反映要否を決める |
| ISSUE-115 | dark_shaman が初手で必ず召喚予告になる（allyCount<2）。単調に感じる場合は初手のみ weight 分散（召喚70/弾30）に変更する余地 |
| ISSUE-116 | 敵イラスト・intentアイコンの実アセット（lucideアイコンで代替するか独自SVGか）は08_UI_UX_Design.md側で確定 |

## 実装時の注意点

1. **selectEnemyActionは「最小priorityの合致群のみ」から抽選する**: priorityを跨いで合致ルールを混ぜない（跨ぐと条件設計の意図が壊れる）。同一priorityに複数行を置くのが「合致ルール群から重み抽選」の表現方法
2. **turnModはintent決定時に「実行される次ターン番号」で評価する**: 現在ターン番号で評価すると「2ターンごと強撃」が1ターンずれる。単体テストで orc_mighty が偶数ターンに実行されることを固定する
3. **intentのフォールバック（DEC-036）を必ず実装する**: 対象死亡・召喚枠満員・HP全快heal。フォールバック先は各敵の基本attack行動（enemy_actionsの先頭ではなくaction_typeで解決）
4. **カウンターの無限ループ防止**: skeleton_counterの反撃はカウンター対象行動を発生させない（反撃に反撃しない）。maxPerTurn=2 のカウンタはターン終了時にリセット
5. **召喚時のスロット・行動キュー**: 召喚された敵は当該ターンのactionQueueに追加しない（次ターンの行動順決定から参加）。intentも次ターン終了処理から付与
6. **rngCursor消費順の固定**: 敵行動の抽選順は enemies[0]→[2] のスロット順で固定（シード再現性のため。変更はschemaVersion更新を伴う）
7. **スナップショット方式**: 戦闘開始時にenemies/enemy_actions/enemy_ai_rulesの内容をrun_state.battleへ展開する。マスタ更新はmaster_data_versionsで管理し、進行中のランには影響させない
8. **数値バリデーション**: シード投入時に「基本重み行（condition=null）が全敵に1行以上ある」「各priority群のweight合計>0」「action_codeの参照整合」をスクリプトで検証する（マスタ入力ミスで行動不能になる事故の防止）
9. **enrageはバフ枠外**: atkUp（DEC-035の3ターンバフ）と別管理。上書き・解除の対象にしないこと。実効atk = 基礎 × enrage1.3 × バフデバフ × 状態異常 の乗算順は16章§6.2に従う
10. **ドロップ・EXPの丸めは常にfloor**、召喚敵の報酬0はEXP計算のΣから除外して実装する（0を足すのではなくリストに入れない方が安全）

## 関連設計書

- CORE_SPEC.md（§5.1 ステータス / §5.2 属性 / §5.3 状態異常 / §5.4 計算式 / §5.7 敵一覧 / §8 テーブル一覧）
- 16_Battle_Design.md（戦闘フロー・計算式詳細・intent運用DEC-036・敵基礎値DEC-033・ボス数値DEC-037・報酬式DEC-038）
- 17_Dungeon_Design.md（ノードタイプ別の戦闘発生・報酬フロー・phase遷移）
- 18_Skill_Design.md（プレイヤー側スキル・レリック・装備との相互作用）
- 12_Database_Design.md（enemies / enemy_actions / enemy_ai_rules / reward_tables / player_codex のDDL）
- 13_API_Design.md（API-305 / API-401 / API-402 / API-307 / API-601）
- 21_Test_Design.md（AIルール評価・intent再現・シード再現のTC登録）
