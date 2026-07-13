// ストーリーマスタ（docs/05 §4.6: MVPは忘却の遺跡の断章5話程度・仮決定 / docs/17 §2 STORYノード）
// プロローグ（初期解放）+ STORYノードで解放される断章 + クリアで解放されるエピローグ
import type { StoryMaster } from './types';

export const STORIES: StoryMaster[] = [
  {
    code: 'story_prologue',
    title: '序章 — 忘却の遺跡',
    body:
      '大陸の果てに、記憶を喰らうと伝えられる遺跡がある。' +
      '持ち出された財宝は翌朝すべて元の場所へ戻り、挑んだ者の名だけが入口の村から消えていく。' +
      'それでも人は遺跡に潜る。遺跡の最深部に眠るという「年代記」——' +
      'この世界の全てが記された書物に、己の答えを求めて。',
    unlockCondition: { type: 'initial' },
    sortOrder: 1,
  },
  {
    code: 'story_fragment_01',
    title: '断章一 — 最初の探索者',
    body:
      '崩れた壁に、古い文字で走り書きが残っている。' +
      '「この遺跡は覚えている。我々が忘れたものを、すべて」。' +
      '署名はない。だが筆跡は、どこか懐かしい。',
    unlockCondition: { type: 'storyNode' },
    sortOrder: 2,
  },
  {
    code: 'story_fragment_02',
    title: '断章二 — 守護者の由来',
    body:
      '祭壇の浮彫は、巨大な石の巨人を描いている。' +
      '年代記を守るため、最初の探索者たちが自らの記憶を捧げて築いた番人——' +
      '「遺跡の守護者」。奪われた記憶は今も、あの巨躯の中で眠っているという。',
    unlockCondition: { type: 'storyNode' },
    sortOrder: 3,
  },
  {
    code: 'story_fragment_03',
    title: '断章三 — 戻る財宝',
    body:
      '行商人は笑って言った。「持ち出せた奴はいないよ。金貨も、剣も、朝には遺跡へ帰る」。' +
      'ならばなぜ人は潜るのか。「決まってるだろう。帰らないものが、ひとつだけあるからさ」。' +
      '男は自分の頭を指で叩いた。——経験だけは、遺跡も奪えない。',
    unlockCondition: { type: 'storyNode' },
    sortOrder: 4,
  },
  {
    code: 'story_epilogue',
    title: '終章 — 年代記の白い頁',
    body:
      '守護者が崩れ落ち、最深部の扉が開く。台座の上の年代記は——白紙だった。' +
      'いや、触れた瞬間、頁にインクが滲み出す。刻まれていくのは、ここまでの旅路そのもの。' +
      '年代記は読む者の物語を記す書物だった。そして最後の行は、こう結ばれている。' +
      '「物語は、次のランへ続く」。',
    unlockCondition: { type: 'clear', dungeonCode: 'forgotten_ruins' },
    sortOrder: 5,
  },
];
