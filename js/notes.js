/**
 * 音樂理論與音高定義模組 (C3 ~ C5 男生音高範圍)
 * MIDI 48 (C3) ~ MIDI 72 (C5)
 */

export const MIN_MIDI = 48; // C3
export const MAX_MIDI = 72; // C5

// 12 平均律音名
const PITCH_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const PITCH_NAMES_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

const SOLFEGE_NATURAL = ['Do', 'Do', 'Re', 'Re', 'Mi', 'Fa', 'Fa', 'Sol', 'Sol', 'La', 'La', 'Si'];
const SOLFEGE_DETAILED = [
  'Do',
  'Do♯ / Re♭',
  'Re',
  'Re♯ / Mi♭',
  'Mi',
  'Fa',
  'Fa♯ / Sol♭',
  'Sol',
  'Sol♯ / La♭',
  'La',
  'La♯ / Si♭',
  'Si'
];

const BLACK_KEYS = [false, true, false, true, false, false, true, false, true, false, true, false];

// 音程名稱對照
const INTERVAL_NAMES = {
  0: '同音 (Unison)',
  1: '小二度 (Minor 2nd)',
  2: '大二度 (Major 2nd)',
  3: '小三度 (Minor 3rd)',
  4: '大三度 (Major 3rd)',
  5: '完全四度 (Perfect 4th)',
  6: '增四/減五度 (Tritone)',
  7: '完全五度 (Perfect 5th)',
  8: '小六度 (Minor 6th)',
  9: '大六度 (Major 6th)',
  10: '小七度 (Minor 7th)',
  11: '大七度 (Major 7th)',
  12: '完全八度 (Octave)',
  13: '小九度 (Minor 9th)',
  14: '大九度 (Major 9th)',
  15: '小十度',
  16: '大十度',
  17: '完全十一度',
  18: '減十二度',
  19: '完全十二度',
  24: '雙八度 (2 Octaves)'
};

/**
 * 取得指定 MIDI 編號的完整資訊
 * @param {number} midi 48 ~ 72
 */
export function getNoteInfo(midi) {
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const isBlack = BLACK_KEYS[pitchClass];

  const sharpName = `${PITCH_NAMES_SHARP[pitchClass]}${octave}`;
  const flatName = `${PITCH_NAMES_FLAT[pitchClass]}${octave}`;
  const combinedName = isBlack ? `${sharpName} / ${flatName}` : sharpName;
  const solfege = isBlack ? SOLFEGE_DETAILED[pitchClass] : SOLFEGE_NATURAL[pitchClass];

  // 頻率：A4 (69) = 440Hz
  const frequency = 440 * Math.pow(2, (midi - 69) / 12);

  let specialTag = '';
  if (midi === 48) specialTag = '男聲低音極限 C3';
  if (midi === 60) specialTag = '中央 C (Middle C)';
  if (midi === 69) specialTag = '標準音 A4 (440Hz)';
  if (midi === 72) specialTag = '男聲高音極限 C5 (Tenor High C)';

  return {
    midi,
    pitchClass,
    octave,
    isBlack,
    sharpName,
    flatName,
    combinedName,
    solfege,
    frequency: Math.round(frequency * 10) / 10,
    specialTag
  };
}

/**
 * 取得所有 C3 ~ C5 的音高陣列 (共 25 個音)
 */
export const ALL_NOTES = [];
for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
  ALL_NOTES.push(getNoteInfo(m));
}

/**
 * 僅自然音（白鍵，無升降號 ♯ / ♭，共 15 個音）
 */
export const NATURAL_NOTES = ALL_NOTES.filter(n => !n.isBlack);

/**
 * 判斷是否為自然音（白鍵）
 */
export function isNaturalNote(midi) {
  return !BLACK_KEYS[midi % 12];
}

/**
 * 格式化音名顯示
 * @param {object} noteInfo 
 * @param {'combined'|'sharp'|'flat'} mode 
 */
export function formatNoteName(noteInfo, mode = 'combined') {
  if (!noteInfo.isBlack) {
    return noteInfo.sharpName;
  }
  if (mode === 'sharp') return noteInfo.sharpName;
  if (mode === 'flat') return noteInfo.flatName;
  return noteInfo.combinedName;
}

/**
 * 比較兩音差距並產生說明文字
 * @param {number} guessMidi 
 * @param {number} targetMidi 
 */
export function compareInterval(guessMidi, targetMidi) {
  const diff = guessMidi - targetMidi;
  const absDiff = Math.abs(diff);

  if (diff === 0) {
    return {
      diff: 0,
      text: '完全命中！音高一致。',
      isExact: true
    };
  }

  const direction = diff > 0 ? '偏高' : '偏低';
  const intervalName = INTERVAL_NAMES[absDiff] || `${absDiff} 個半音`;

  return {
    diff,
    absDiff,
    direction,
    intervalName,
    text: `相差 ${absDiff} 個半音（${intervalName}，你的選擇${direction}）`,
    isExact: false
  };
}
