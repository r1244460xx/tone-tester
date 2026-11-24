/**
 * 混淆項生成演算法 (Distractor Generation Algorithm)
 * 專為聽力測驗設計：生成「既非答案、又具高度迷惑性」的音高選項
 * 支援：純自然音過濾 (關閉升降號) 與寬音距分開模式 (新手友善)
 */

import { MIN_MIDI, MAX_MIDI, getNoteInfo, isNaturalNote } from './notes.js';

// 音程偏移定義（半音數）
const OFFSETS = {
  // 極度逼近的相鄰音（人耳最常見的微幅判斷誤差）
  microNeighbors: [-1, 1],
  wholeNeighbors: [-2, 2],
  
  // 諧波與調性相關音程（泛音列共鳴容易引起的聽覺混淆）
  minorThird: [-3, 3],
  majorThird: [-4, 4],
  fourth: [-5, 5],
  tritone: [-6, 6],
  fifth: [-7, 7],

  // 八度混淆（音名音色一致、僅音高頻率差一倍）
  octave: [-12, 12]
};

/**
 * 依據目標音高與難度模式，生成 3 個具迷惑性的干擾項
 * @param {number} targetMidi 目標音高 MIDI (48 ~ 72)
 * @param {'wide'|'balanced'|'tight'|'harmonic'} mode 混淆模式
 * @param {boolean} naturalOnly 是否關閉升降音 (僅白鍵自然音)
 * @returns {number[]} 3 個唯一的干擾項 MIDI 編號
 */
export function generateDistractors(targetMidi, mode = 'wide', naturalOnly = false) {
  const chosenDistractors = new Set();

  // 輔助函式：過濾在 [MIN_MIDI, MAX_MIDI] 內、非目標音且符合自然音設定的音符
  const filterValid = (offsets) => {
    return offsets
      .map(o => targetMidi + o)
      .filter(m => {
        if (m < MIN_MIDI || m > MAX_MIDI || m === targetMidi || chosenDistractors.has(m)) {
          return false;
        }
        if (naturalOnly && !isNaturalNote(m)) {
          return false;
        }
        return true;
      });
  };

  // 取得當前設定下所有可用的音符池
  const getAllAvailableNotes = () => {
    const list = [];
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      if (m !== targetMidi) {
        if (!naturalOnly || isNaturalNote(m)) {
          list.push(m);
        }
      }
    }
    return list;
  };

  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  if (mode === 'wide') {
    // 【新手友善：寬音距分開模式】
    // 目標：4 個選項之間距離拉開 (至少相差 3 ~ 6 個半音)，分佈在不同音區，讓新手更容易分辨音高差異
    const pool = getAllAvailableNotes();
    let bestSet = null;
    let bestMinGap = -1;

    // 嘗試尋找最小間距最大化的四個音集合
    for (let attempt = 0; attempt < 80; attempt++) {
      const candidates = shuffle(pool);
      const currentChosen = [];

      for (const cand of candidates) {
        const testSet = [targetMidi, ...currentChosen];
        const minDistance = Math.min(...testSet.map(m => Math.abs(m - cand)));
        // 優先確保與已選音之間至少間隔 3 個半音 (自然音) 或 4 個半音 (全半音)
        const threshold = naturalOnly ? 3 : 4;
        if (minDistance >= threshold) {
          currentChosen.push(cand);
          if (currentChosen.length === 3) break;
        }
      }

      if (currentChosen.length === 3) {
        // 計算這組 4 個音在排序後的最小相鄰距離
        const all4 = [targetMidi, ...currentChosen].sort((a, b) => a - b);
        let minGap = 999;
        for (let i = 1; i < all4.length; i++) {
          minGap = Math.min(minGap, all4[i] - all4[i - 1]);
        }
        if (minGap > bestMinGap) {
          bestMinGap = minGap;
          bestSet = currentChosen;
        }
        if (bestMinGap >= 4) break; // 已達到理想寬度
      }
    }

    if (bestSet && bestSet.length === 3) {
      bestSet.forEach(m => chosenDistractors.add(m));
    }
  } else if (mode === 'tight') {
    // 【微音階極限模式】：全部落在目標音 ±1 ~ ±4 半音之內
    const tightOffsets = [-4, -3, -2, -1, 1, 2, 3, 4];
    const pool = shuffle(filterValid(tightOffsets));
    for (const m of pool) {
      if (chosenDistractors.size < 3) chosenDistractors.add(m);
    }
  } else if (mode === 'harmonic') {
    // 【和聲音程模式】：三度、四度、五度、八度
    const harmonicOffsets = [-12, -7, -5, -4, -3, 3, 4, 5, 7, 12];
    const pool = shuffle(filterValid(harmonicOffsets));
    for (const m of pool) {
      if (chosenDistractors.size < 3) chosenDistractors.add(m);
    }
  } else {
    // 【智能平衡模式】：
    // 1. 相鄰音 (±1, ±2) 或自然音鄰音 (±1, ±2, ±3)
    const neighborPool = shuffle(filterValid([...OFFSETS.microNeighbors, ...OFFSETS.wholeNeighbors, 3, -3]));
    if (neighborPool.length > 0) {
      chosenDistractors.add(neighborPool[0]);
    }

    // 2. 和聲音程 (三度、四度、五度)
    const harmonicPool = shuffle(filterValid([
      ...OFFSETS.minorThird,
      ...OFFSETS.majorThird,
      ...OFFSETS.fourth,
      ...OFFSETS.fifth
    ]));
    if (harmonicPool.length > 0) {
      chosenDistractors.add(harmonicPool[0]);
    }

    // 3. 八度或互補音程
    const octavePool = filterValid(OFFSETS.octave);
    if (octavePool.length > 0 && Math.random() < 0.35) {
      chosenDistractors.add(octavePool[Math.floor(Math.random() * octavePool.length)]);
    } else {
      const firstDistractor = Array.from(chosenDistractors)[0];
      let preferredSign = 0;
      if (firstDistractor) {
        preferredSign = (firstDistractor > targetMidi) ? -1 : 1;
      }
      const complementaryPool = filterValid([
        preferredSign * 2, preferredSign * 4, preferredSign * 5, preferredSign * 7,
        ...OFFSETS.fourth, ...OFFSETS.fifth
      ]);
      if (complementaryPool.length > 0) {
        chosenDistractors.add(complementaryPool[0]);
      }
    }
  }

  // 補底防護：若候選數不足 3 個，從有效音符池補足
  if (chosenDistractors.size < 3) {
    const allCandidates = getAllAvailableNotes().filter(m => !chosenDistractors.has(m));
    allCandidates.sort((a, b) => {
      const distA = Math.abs(a - targetMidi);
      const distB = Math.abs(b - targetMidi);
      if (mode === 'wide') {
        // 寬音距偏好較分散的音
        return (distB - distA) + (Math.random() - 0.5) * 4;
      }
      return (distA - distB) + (Math.random() - 0.5) * 2;
    });

    for (const m of allCandidates) {
      if (chosenDistractors.size < 3) {
        chosenDistractors.add(m);
      }
    }
  }

  return Array.from(chosenDistractors).slice(0, 3);
}

/**
 * 組合一道題目：包含目標音與四個選項 (A, B, C, D)
 * @param {number} targetMidi 
 * @param {'wide'|'balanced'|'tight'|'harmonic'} mode 
 * @param {boolean} naturalOnly 
 */
export function buildQuestionOptions(targetMidi, mode = 'wide', naturalOnly = false) {
  const distractors = generateDistractors(targetMidi, mode, naturalOnly);
  
  // 隨機指定 A, B, C, D 其中一個為正確答案
  const answerIndex = Math.floor(Math.random() * 4);
  const slots = ['A', 'B', 'C', 'D'];
  const options = [];

  let distractorIdx = 0;
  for (let i = 0; i < 4; i++) {
    const isCorrect = (i === answerIndex);
    const midi = isCorrect ? targetMidi : distractors[distractorIdx++];
    const noteInfo = getNoteInfo(midi);

    options.push({
      slot: slots[i],
      index: i,
      midi,
      isCorrect,
      noteInfo
    });
  }

  return {
    targetMidi,
    targetInfo: getNoteInfo(targetMidi),
    answerIndex,
    answerSlot: slots[answerIndex],
    options
  };
}
