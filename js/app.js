/**
 * ToneTester Standalone Bundle
 * Works seamlessly both via file:// and http://
 */
(function() {
  "use strict";

  // --- notes.js ---
  /**
 * 音樂理論與音高定義模組 (C3 ~ C5 男生音高範圍)
 * MIDI 48 (C3) ~ MIDI 72 (C5)
 */

const MIN_MIDI = 48; // C3
const MAX_MIDI = 72; // C5

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
function getNoteInfo(midi) {
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
const ALL_NOTES = [];
for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
  ALL_NOTES.push(getNoteInfo(m));
}

/**
 * 僅自然音（白鍵，無升降號 ♯ / ♭，共 15 個音）
 */
const NATURAL_NOTES = ALL_NOTES.filter(n => !n.isBlack);

/**
 * 判斷是否為自然音（白鍵）
 */
function isNaturalNote(midi) {
  return !BLACK_KEYS[midi % 12];
}

/**
 * 格式化音名顯示
 * @param {object} noteInfo 
 * @param {'combined'|'sharp'|'flat'} mode 
 */
function formatNoteName(noteInfo, mode = 'combined') {
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
function compareInterval(guessMidi, targetMidi) {
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


  // --- distractor.js ---
  /**
 * 混淆項生成演算法 (Distractor Generation Algorithm)
 * 專為聽力測驗設計：生成「既非答案、又具高度迷惑性」的音高選項
 * 支援：純自然音過濾 (關閉升降號) 與寬音距分開模式 (新手友善)
 */


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
function generateDistractors(targetMidi, mode = 'wide', naturalOnly = false) {
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
function buildQuestionOptions(targetMidi, mode = 'wide', naturalOnly = false) {
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


  // --- audio.js ---
  /**
 * Web Audio API 音訊合成引擎
 * 專為高擬真「鋼琴」音色設計，支援多泛音疊加、非諧波性 (Inharmonicity)、琴槌敲擊瞬態與自然衰減
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.currentSource = null;
    this.isPlaying = false;
    this.duration = 1.0; // 播放約 1 秒
    this.currentTimbre = 'piano'; // 'piano' | 'epiano' | 'sine'
    
    // 預先快取的 AudioBuffer: { timbre: { midi: AudioBuffer } }
    this.bufferCache = {
      piano: {},
      epiano: {},
      sine: {}
    };

    this.playEndTimer = null;
  }

  /**
   * 初始化 AudioContext（必須在使用者點擊按鈕等互動後呼叫）
   */
  async init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * 設定音量 (0.0 ~ 1.0)
   */
  setVolume(volume) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.02);
    }
  }

  /**
   * 設定音色
   */
  setTimbre(timbre) {
    if (['piano', 'epiano', 'sine'].includes(timbre)) {
      this.currentTimbre = timbre;
    }
  }

  /**
   * 合成鋼琴音色的 PCM 訊號 (逼真加法合成 + 弦不和諧性 + 琴槌敲擊)
   */
  renderPianoBuffer(midi, sampleRate) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const numSamples = Math.floor(sampleRate * this.duration);
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // 鋼琴弦剛性非諧波係數 (Inharmonicity constant)
    const B = 0.00014;

    // 泛音強度與衰減率：越高階泛音能量衰減越快
    // [泛音倍數, 相對震幅, 衰減指數]
    const harmonics = [
      [1, 1.00, 1.3],
      [2, 0.65, 2.4],
      [3, 0.40, 3.8],
      [4, 0.25, 5.2],
      [5, 0.16, 7.0],
      [6, 0.09, 9.2],
      [7, 0.05, 11.5],
      [8, 0.03, 14.0]
    ];

    // 模擬鋼琴同音多弦 (Unison 3 strings) 的微小失諧，產生自然琴音共鳴
    const unisonDetunes = [-0.0012, 0.0, 0.0012];

    for (let h = 0; h < harmonics.length; h++) {
      const [hNum, baseAmp, decay] = harmonics[h];
      const partialFreq = hNum * f0 * Math.sqrt(1 + B * hNum * hNum);
      const amp = baseAmp / unisonDetunes.length;

      for (let u = 0; u < unisonDetunes.length; u++) {
        const freq = partialFreq * (1.0 + unisonDetunes[u]);
        const phaseInc = (2 * Math.PI * freq) / sampleRate;
        let phase = 0;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          // 4毫秒極速起音 (Attack)
          const attack = t < 0.004 ? t / 0.004 : 1.0;
          // 自然指數衰減
          const env = attack * Math.exp(-decay * t);
          data[i] += amp * env * Math.sin(phase);
          phase += phaseInc;
        }
      }
    }

    // 加入毛氈琴槌敲擊瞬態 (Hammer Strike Impulse) - 8ms 阻尼敲擊雜訊
    const hammerSamples = Math.floor(sampleRate * 0.012);
    for (let i = 0; i < hammerSamples; i++) {
      const t = i / sampleRate;
      const hammerEnv = Math.pow(1.0 - t / 0.012, 3) * 0.25;
      const noise = (Math.random() * 2 - 1);
      data[i] += noise * hammerEnv;
    }

    // 結尾 50ms 平滑釋放，防止破音 (De-click)
    const releaseSamples = Math.floor(sampleRate * 0.06);
    const releaseStart = numSamples - releaseSamples;
    for (let i = releaseStart; i < numSamples; i++) {
      const factor = (numSamples - i) / releaseSamples;
      data[i] *= factor;
    }

    // 正規化振幅
    let peak = 0;
    for (let i = 0; i < numSamples; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0) {
      const norm = 0.92 / peak;
      for (let i = 0; i < numSamples; i++) {
        data[i] *= norm;
      }
    }

    return buffer;
  }

  /**
   * 合成電鋼琴 (Rhodes / FM 鈴音質感)
   */
  renderEpianoBuffer(midi, sampleRate) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const numSamples = Math.floor(sampleRate * this.duration);
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // FM 合成調變參數
    const modFreq = f0 * 2.0; // 2:1 調變比
    const modIndexMax = 2.5;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const modEnv = Math.exp(-6.0 * t);
      const carrierEnv = Math.exp(-1.4 * t);
      const modPhase = 2 * Math.PI * modFreq * t;
      const modSignal = Math.sin(modPhase) * (modIndexMax * modEnv);
      const carrierPhase = 2 * Math.PI * f0 * t + modSignal;
      data[i] = carrierEnv * Math.sin(carrierPhase);
    }

    // 結尾平滑釋放
    const releaseSamples = Math.floor(sampleRate * 0.05);
    const releaseStart = numSamples - releaseSamples;
    for (let i = releaseStart; i < numSamples; i++) {
      data[i] *= (numSamples - i) / releaseSamples;
    }

    return buffer;
  }

  /**
   * 合成純正弦音 (純物理音頻)
   */
  renderSineBuffer(midi, sampleRate) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const numSamples = Math.floor(sampleRate * this.duration);
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-1.0 * t);
      data[i] = env * Math.sin(2 * Math.PI * f0 * t);
    }

    const releaseSamples = Math.floor(sampleRate * 0.05);
    const releaseStart = numSamples - releaseSamples;
    for (let i = releaseStart; i < numSamples; i++) {
      data[i] *= (numSamples - i) / releaseSamples;
    }

    return buffer;
  }

  /**
   * 取得或生成指定音色的 AudioBuffer
   */
  getAudioBuffer(midi) {
    const timbre = this.currentTimbre;
    if (this.bufferCache[timbre][midi]) {
      return this.bufferCache[timbre][midi];
    }

    const sampleRate = this.ctx.sampleRate;
    let buf;
    if (timbre === 'piano') {
      buf = this.renderPianoBuffer(midi, sampleRate);
    } else if (timbre === 'epiano') {
      buf = this.renderEpianoBuffer(midi, sampleRate);
    } else {
      buf = this.renderSineBuffer(midi, sampleRate);
    }

    this.bufferCache[timbre][midi] = buf;
    return buf;
  }

  /**
   * 播放指定 MIDI 音符
   * @param {number} midi MIDI 編號 (48 ~ 72)
   * @param {Function} onProgress 每微秒進度回呼 (progress 0.0 ~ 1.0)
   * @param {Function} onEnded 播放完成後回呼
   */
  async playNote(midi, onProgress = null, onEnded = null) {
    await this.init();

    // 若前一個音仍在播放，先停止
    this.stop();

    const buffer = this.getAudioBuffer(midi);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);

    this.currentSource = source;
    this.isPlaying = true;

    const startTime = this.ctx.currentTime;
    const durationMs = this.duration * 1000;
    source.start(startTime);

    // 動畫更新與計時器
    const startPerfTime = performance.now();
    let animFrameId = null;

    const updateProgress = () => {
      if (!this.isPlaying) return;
      const elapsed = performance.now() - startPerfTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      if (onProgress) {
        onProgress(progress, (durationMs - elapsed) / 1000);
      }

      if (progress < 1.0) {
        animFrameId = requestAnimationFrame(updateProgress);
      }
    };
    animFrameId = requestAnimationFrame(updateProgress);

    // 播放結束事件
    source.onended = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      this.isPlaying = false;
      this.currentSource = null;
      if (onProgress) onProgress(1.0, 0);
      if (onEnded) onEnded();
    };

    // 保險定時器 (確保一定觸發結束)
    this.playEndTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.currentSource = null;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (onProgress) onProgress(1.0, 0);
        if (onEnded) onEnded();
      }
    }, durationMs + 80);
  }

  /**
   * 停止目前播放
   */
  stop() {
    if (this.playEndTimer) {
      clearTimeout(this.playEndTimer);
      this.playEndTimer = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // 忽略可能已停止的異常
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }
}

const audioEngine = new AudioEngine();


  // --- game.js ---
  /**
 * 遊戲主控制器 (Game Controller)
 * 負責掌控題目流程、答題回饋、再播機制、分數統計、自然音切換與難度控制
 */




class PitchQuizGame {
  constructor() {
    // 遊戲狀態
    this.state = 'IDLE'; // 'IDLE' | 'PLAYING' | 'WAITING_ANSWER' | 'ANSWERED'
    this.questionCount = 0;
    this.correctCount = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.recentTargets = []; // 避免連續題目完全相同音

    // 當前題目資訊
    this.currentQuestion = null;
    this.userSelectedIndex = null;

    // 設定選項
    this.settings = {
      naturalOnly: true,          // 是否關閉升降半音 (預設開啟：純白鍵自然音，新手最友善)
      distractorMode: 'wide',     // 'wide' (新手寬距分開) | 'balanced' | 'tight' | 'harmonic'
      accidentalMode: 'combined', // 'combined' (C♯/D♭) | 'sharp' (C♯) | 'flat' (D♭)
      timbre: 'piano',            // 'piano' | 'epiano' | 'sine'
      volume: 0.85
    };

    // DOM 元素引用
    this.dom = {};
  }

  /**
   * 初始化 DOM 綁定與事件監聽
   */
  init() {
    this.cacheDomElements();
    this.bindEvents();
    this.renderKeyboard();
    this.updateControlsUI();
    this.updateStatsUI();
  }

  cacheDomElements() {
    this.dom = {
      // 畫面切換
      welcomeScreen: document.getElementById('welcome-screen'),
      gameScreen: document.getElementById('game-screen'),
      btnStart: document.getElementById('btn-start'),
      btnTestSound: document.getElementById('btn-test-sound'),

      // 快速控制切換列 (Quick Toolbar)
      toggleNaturalBtn: document.getElementById('toggle-natural-btn'),
      quickModeSelect: document.getElementById('quick-mode-select'),
      currentModeBadge: document.getElementById('current-mode-badge'),

      // 頂部統計
      statQuestionNumber: document.getElementById('stat-question-num'),
      statCorrectRate: document.getElementById('stat-correct-rate'),
      statScore: document.getElementById('stat-score'),
      statStreak: document.getElementById('stat-streak'),
      statBestStreak: document.getElementById('stat-best-streak'),

      // 播放卡片
      btnReplay: document.getElementById('btn-replay'),
      replayText: document.getElementById('replay-text'),
      playStatusBadge: document.getElementById('play-status-badge'),
      waveBars: document.querySelectorAll('.wave-bar'),
      playbackProgress: document.getElementById('playback-progress'),

      // 選項容器
      optionsContainer: document.getElementById('options-container'),
      optionCards: [
        document.getElementById('option-0'),
        document.getElementById('option-1'),
        document.getElementById('option-2'),
        document.getElementById('option-3')
      ],

      // 回饋與下一題
      feedbackCard: document.getElementById('feedback-card'),
      feedbackStatus: document.getElementById('feedback-status'),
      feedbackDetail: document.getElementById('feedback-detail'),
      feedbackComparison: document.getElementById('feedback-comparison'),
      btnNext: document.getElementById('btn-next'),

      // 琴鍵容器
      pianoKeyboard: document.getElementById('piano-keyboard'),

      // 設定面板
      btnSettingsToggle: document.getElementById('btn-settings-toggle'),
      settingsModal: document.getElementById('settings-modal'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      chkNaturalOnly: document.getElementById('chk-natural-only'),
      selectAccidental: document.getElementById('select-accidental'),
      selectDistractor: document.getElementById('select-distractor'),
      selectTimbre: document.getElementById('select-timbre'),
      sliderVolume: document.getElementById('slider-volume'),
      btnResetStats: document.getElementById('btn-reset-stats')
    };
  }

  bindEvents() {
    // 開始遊戲按鈕
    this.dom.btnStart.addEventListener('click', async () => {
      await audioEngine.init();
      this.dom.welcomeScreen.classList.add('hidden');
      this.dom.gameScreen.classList.remove('hidden');
      this.startNextQuestion();
    });

    // 試聽按鈕 (歡迎畫面)
    this.dom.btnTestSound.addEventListener('click', async () => {
      await audioEngine.init();
      this.dom.btnTestSound.disabled = true;
      this.dom.btnTestSound.textContent = '🔊 播放中央 C (1秒)...';
      audioEngine.playNote(60, null, () => {
        this.dom.btnTestSound.disabled = false;
        this.dom.btnTestSound.textContent = '🔊 測試音量 (中央 C)';
      });
    });

    // 快速切換：自然音 (無升降) / 全半音階
    if (this.dom.toggleNaturalBtn) {
      this.dom.toggleNaturalBtn.addEventListener('click', () => {
        this.settings.naturalOnly = !this.settings.naturalOnly;
        this.updateControlsUI();
        this.updateKeyboardState();
      });
    }

    // 快速切換：難度模式 (寬距 / 平衡 / 微距 / 和聲)
    if (this.dom.quickModeSelect) {
      this.dom.quickModeSelect.addEventListener('change', (e) => {
        this.settings.distractorMode = e.target.value;
        this.updateControlsUI();
      });
    }

    // 再播一次按鈕 (在答題前後都需保證能正常運作)
    this.dom.btnReplay.addEventListener('click', () => {
      if (this.currentQuestion && !audioEngine.isPlaying) {
        this.playCurrentTone();
      }
    });

    // 四個選項按鈕點擊
    this.dom.optionCards.forEach((card, index) => {
      card.addEventListener('click', () => {
        if (this.state === 'WAITING_ANSWER' || this.state === 'PLAYING') {
          this.handleOptionSelect(index);
        }
      });
    });

    // 下一題按鈕 (不自動跳題，需點擊)
    this.dom.btnNext.addEventListener('click', () => {
      this.startNextQuestion();
    });

    // 鍵盤快捷鍵支援
    window.addEventListener('keydown', (e) => {
      if (this.dom.gameScreen.classList.contains('hidden')) return;

      const key = e.key.toUpperCase();

      // 答題快捷鍵: A, B, C, D 或 1, 2, 3, 4
      if (this.state === 'WAITING_ANSWER' || this.state === 'PLAYING') {
        const slotMap = { 'A': 0, '1': 0, 'B': 1, '2': 1, 'C': 2, '3': 2, 'D': 3, '4': 3 };
        if (key in slotMap) {
          e.preventDefault();
          this.handleOptionSelect(slotMap[key]);
          return;
        }
      }

      // 再播一次快捷鍵: R
      if (key === 'R') {
        if (!this.dom.btnReplay.disabled && this.currentQuestion) {
          e.preventDefault();
          this.playCurrentTone();
          return;
        }
      }

      // 下一題快捷鍵: Enter 或 Space 或 N (僅在已揭曉答案後有效)
      if (this.state === 'ANSWERED') {
        if (key === 'ENTER' || key === ' ' || key === 'N') {
          e.preventDefault();
          this.startNextQuestion();
          return;
        }
      }
    });

    // 設定面板控制
    this.dom.btnSettingsToggle.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('hidden');
    });

    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('hidden');
    });

    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) {
        this.dom.settingsModal.classList.add('hidden');
      }
    });

    // 設定面板內的自然音核取方塊
    if (this.dom.chkNaturalOnly) {
      this.dom.chkNaturalOnly.addEventListener('change', (e) => {
        this.settings.naturalOnly = e.target.checked;
        this.updateControlsUI();
        this.updateKeyboardState();
      });
    }

    this.dom.selectAccidental.addEventListener('change', (e) => {
      this.settings.accidentalMode = e.target.value;
      this.refreshOptionsDisplay();
    });

    this.dom.selectDistractor.addEventListener('change', (e) => {
      this.settings.distractorMode = e.target.value;
      this.updateControlsUI();
    });

    this.dom.selectTimbre.addEventListener('change', (e) => {
      this.settings.timbre = e.target.value;
      audioEngine.setTimbre(e.target.value);
    });

    this.dom.sliderVolume.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.settings.volume = vol;
      audioEngine.setVolume(vol);
    });

    this.dom.btnResetStats.addEventListener('click', () => {
      if (confirm('確定要重置所有答題統計與連勝紀錄嗎？')) {
        this.questionCount = 0;
        this.correctCount = 0;
        this.currentStreak = 0;
        this.bestStreak = 0;
        this.updateStatsUI();
      }
    });
  }

  /**
   * 同步更新快捷控制列與設定選單的狀態
   */
  updateControlsUI() {
    // 自然音開關切換鈕
    if (this.dom.toggleNaturalBtn) {
      if (this.settings.naturalOnly) {
        this.dom.toggleNaturalBtn.className = 'btn-toggle-natural active';
        this.dom.toggleNaturalBtn.innerHTML = '🎹 範圍：<strong>純白鍵自然音 (無升降 ♯/♭)</strong>';
      } else {
        this.dom.toggleNaturalBtn.className = 'btn-toggle-natural';
        this.dom.toggleNaturalBtn.innerHTML = '🎹 範圍：<strong>全半音階 (含黑鍵 ♯/♭)</strong>';
      }
    }

    // Modal 核取方塊同步
    if (this.dom.chkNaturalOnly) {
      this.dom.chkNaturalOnly.checked = this.settings.naturalOnly;
    }

    // 下拉選單同步
    if (this.dom.quickModeSelect) {
      this.dom.quickModeSelect.value = this.settings.distractorMode;
    }
    if (this.dom.selectDistractor) {
      this.dom.selectDistractor.value = this.settings.distractorMode;
    }

    // 狀態徽章更新
    if (this.dom.currentModeBadge) {
      const modeNames = {
        wide: '寬音距拉開 (新手)',
        balanced: '智能平衡',
        tight: '微音階極限',
        harmonic: '和聲音程'
      };
      const scopeName = this.settings.naturalOnly ? '純自然音' : '全半音階';
      this.dom.currentModeBadge.textContent = `${scopeName} · ${modeNames[this.settings.distractorMode] || ''}`;
    }
  }

  /**
   * 隨機選出題目的音高
   * 若開啟 naturalOnly，則嚴格從白鍵自然音 (15 個) 隨機挑選
   */
  pickRandomTargetMidi() {
    const pool = this.settings.naturalOnly ? NATURAL_NOTES : ALL_NOTES;
    let candidate;
    let attempts = 0;

    do {
      const idx = Math.floor(Math.random() * pool.length);
      candidate = pool[idx].midi;
      attempts++;
    } while (this.recentTargets.includes(candidate) && attempts < 12);

    this.recentTargets.push(candidate);
    if (this.recentTargets.length > 4) {
      this.recentTargets.shift();
    }

    return candidate;
  }

  /**
   * 進入下一題 (核心流程)
   */
  startNextQuestion() {
    this.questionCount++;
    this.userSelectedIndex = null;
    this.state = 'PLAYING';

    // 挑選目標音並生成 4 個選項 (套用自然音過濾與指定難度模式)
    const targetMidi = this.pickRandomTargetMidi();
    this.currentQuestion = buildQuestionOptions(targetMidi, this.settings.distractorMode, this.settings.naturalOnly);

    // 重設 UI
    this.resetQuestionUI();
    this.updateStatsUI();

    // 播放題目音符 (約 1 秒)
    this.playCurrentTone();
  }

  /**
   * 播放當前題目的音高，並控制「再播一次」按鈕的啟用/停用
   */
  playCurrentTone() {
    if (!this.currentQuestion) return;

    const midi = this.currentQuestion.targetMidi;
    this.setReplayButtonPlaying(true);
    this.setWaveAnimation(true);

    if (this.state !== 'ANSWERED') {
      this.state = 'PLAYING';
      this.dom.playStatusBadge.textContent = '🎶 正在播放題目音高...';
      this.dom.playStatusBadge.className = 'status-badge status-playing';
    }

    // 播放 1.0 秒
    audioEngine.playNote(
      midi,
      // 進度回呼 (更新倒數條)
      (progress, remainingSec) => {
        this.dom.playbackProgress.style.width = `${progress * 100}%`;
        if (remainingSec > 0.05) {
          this.dom.replayText.textContent = `播放中 (${remainingSec.toFixed(1)}s)`;
        }
      },
      // 結束回呼 (精確在播放完畢後解鎖再播按鈕)
      () => {
        this.setReplayButtonPlaying(false);
        this.setWaveAnimation(false);
        this.dom.playbackProgress.style.width = '0%';
        this.dom.replayText.textContent = '🔊 再播一次 (R)';

        if (this.state === 'PLAYING') {
          this.state = 'WAITING_ANSWER';
          this.dom.playStatusBadge.textContent = '🎧 請由下方四個選項選出正確音高';
          this.dom.playStatusBadge.className = 'status-badge status-waiting';
        } else if (this.state === 'ANSWERED') {
          this.dom.playStatusBadge.textContent = '📋 答案已揭曉 (可繼續重播聽音鞏固記憶)';
          this.dom.playStatusBadge.className = 'status-badge status-answered';
        }
      }
    );
  }

  /**
   * 設定「再播一次」按鈕的播放中/可用狀態
   */
  setReplayButtonPlaying(isPlaying) {
    this.dom.btnReplay.disabled = isPlaying;
    if (isPlaying) {
      this.dom.btnReplay.classList.add('playing');
    } else {
      this.dom.btnReplay.classList.remove('playing');
    }
  }

  /**
   * 聲波動畫開關
   */
  setWaveAnimation(active) {
    this.dom.waveBars.forEach((bar) => {
      if (active) {
        bar.classList.add('animating');
      } else {
        bar.classList.remove('animating');
      }
    });
  }

  /**
   * 重設題目區域的視覺狀態
   */
  resetQuestionUI() {
    this.dom.statQuestionNumber.textContent = `第 ${this.questionCount} 題`;

    // 隱藏回饋面板
    this.dom.feedbackCard.classList.add('hidden');
    this.dom.feedbackCard.className = 'feedback-card hidden';

    // 重設選項卡片
    this.currentQuestion.options.forEach((opt, idx) => {
      const card = this.dom.optionCards[idx];
      card.className = 'option-card';
      card.disabled = false;

      const slotEl = card.querySelector('.option-slot');
      const noteEl = card.querySelector('.option-note');
      const solfegeEl = card.querySelector('.option-solfege');
      const badgeEl = card.querySelector('.option-badge');

      slotEl.textContent = opt.slot;
      noteEl.textContent = formatNoteName(opt.noteInfo, this.settings.accidentalMode);
      solfegeEl.textContent = opt.noteInfo.solfege;
      badgeEl.textContent = '';
      badgeEl.className = 'option-badge';
    });

    // 重設琴鍵高亮
    this.clearKeyboardHighlights();
    this.updateKeyboardState();
  }

  /**
   * 重新整理選項顯示名稱
   */
  refreshOptionsDisplay() {
    if (!this.currentQuestion) return;
    this.currentQuestion.options.forEach((opt, idx) => {
      const card = this.dom.optionCards[idx];
      const noteEl = card.querySelector('.option-note');
      noteEl.textContent = formatNoteName(opt.noteInfo, this.settings.accidentalMode);
    });
  }

  /**
   * 處理使用者選擇選項
   */
  handleOptionSelect(selectedIndex) {
    if (this.state === 'ANSWERED') return;

    this.userSelectedIndex = selectedIndex;
    this.state = 'ANSWERED';

    const selectedOpt = this.currentQuestion.options[selectedIndex];
    const correctOpt = this.currentQuestion.options[this.currentQuestion.answerIndex];
    const isCorrect = selectedOpt.isCorrect;

    // 更新統計
    if (isCorrect) {
      this.correctCount++;
      this.currentStreak++;
      if (this.currentStreak > this.bestStreak) {
        this.bestStreak = this.currentStreak;
      }
    } else {
      this.currentStreak = 0;
    }
    this.updateStatsUI();

    // 標記四個選項卡片
    this.currentQuestion.options.forEach((opt, idx) => {
      const card = this.dom.optionCards[idx];
      card.disabled = true; // 鎖定選項，避免重複點選
      const badgeEl = card.querySelector('.option-badge');

      if (opt.isCorrect) {
        if (idx === selectedIndex) {
          card.classList.add('is-correct', 'user-selected');
          badgeEl.textContent = '✓ 正確答案 (你的選擇)';
          badgeEl.className = 'option-badge badge-correct';
        } else {
          card.classList.add('is-correct');
          badgeEl.textContent = '✓ 正確答案';
          badgeEl.className = 'option-badge badge-correct';
        }
      } else {
        if (idx === selectedIndex) {
          card.classList.add('is-wrong', 'user-selected');
          badgeEl.textContent = '✗ 你的選擇';
          badgeEl.className = 'option-badge badge-wrong';
        } else {
          card.classList.add('is-dimmed');
          badgeEl.textContent = '';
        }
      }
    });

    // 顯示詳細回饋與「下一題」按鈕
    this.showFeedback(isCorrect, selectedOpt, correctOpt);

    // 在琴鍵上標示正解與選擇
    this.highlightKeyboardNotes(correctOpt.midi, selectedOpt.midi);

    // 狀態徽章更新
    this.dom.playStatusBadge.textContent = '📋 答案已揭曉 (仍可點擊「再播一次」重複聆聽)';
    this.dom.playStatusBadge.className = 'status-badge status-answered';
  }

  /**
   * 顯示答題結果回饋面板
   */
  showFeedback(isCorrect, selectedOpt, correctOpt) {
    this.dom.feedbackCard.classList.remove('hidden');

    if (isCorrect) {
      this.dom.feedbackCard.className = 'feedback-card feedback-correct';
      this.dom.feedbackStatus.innerHTML = `
        <span class="feedback-icon">🎉</span>
        <span class="feedback-title">恭喜答對！完全精準！</span>
      `;
      this.dom.feedbackDetail.innerHTML = `
        題目音高為 <strong>${formatNoteName(correctOpt.noteInfo, this.settings.accidentalMode)}</strong>
        (${correctOpt.noteInfo.solfege}，頻率 <strong>${correctOpt.noteInfo.frequency} Hz</strong>)。
        ${correctOpt.noteInfo.specialTag ? `<span class="tag-badge">${correctOpt.noteInfo.specialTag}</span>` : ''}
      `;
      this.dom.feedbackComparison.innerHTML = `連續答對 <strong>${this.currentStreak}</strong> 題！`;
    } else {
      this.dom.feedbackCard.className = 'feedback-card feedback-wrong';
      const interval = compareInterval(selectedOpt.midi, correctOpt.midi);

      this.dom.feedbackStatus.innerHTML = `
        <span class="feedback-icon">💡</span>
        <span class="feedback-title">差一點！正確答案是選項 [${correctOpt.slot}]</span>
      `;
      this.dom.feedbackDetail.innerHTML = `
        正確答案為 <strong>${formatNoteName(correctOpt.noteInfo, this.settings.accidentalMode)}</strong>
        (${correctOpt.noteInfo.solfege}，頻率 <strong>${correctOpt.noteInfo.frequency} Hz</strong>)。
      `;
      this.dom.feedbackComparison.innerHTML = `
        你選擇了 <strong>[${selectedOpt.slot}] ${formatNoteName(selectedOpt.noteInfo, this.settings.accidentalMode)}</strong>：<br/>
        <strong>${interval.text}</strong>。建議點擊「再播一次」對照聽感！
      `;
    }
  }

  /**
   * 更新統計數值
   */
  updateStatsUI() {
    this.dom.statScore.textContent = `${this.correctCount} / ${this.questionCount}`;
    const rate = this.questionCount > 0 ? Math.round((this.correctCount / this.questionCount) * 100) : 0;
    this.dom.statCorrectRate.textContent = `${rate}%`;
    this.dom.statStreak.textContent = this.currentStreak;
    this.dom.statBestStreak.textContent = this.bestStreak;
  }

  /**
   * 繪製 2 個八度的鋼琴鍵盤 (C3 ~ C5, 48 ~ 72)
   */
  renderKeyboard() {
    this.dom.pianoKeyboard.innerHTML = '';
    
    ALL_NOTES.forEach((note) => {
      const keyEl = document.createElement('div');
      keyEl.className = `piano-key ${note.isBlack ? 'black-key' : 'white-key'}`;
      keyEl.dataset.midi = note.midi;
      keyEl.title = `${note.sharpName} (${note.frequency}Hz) - 點擊試聽`;

      const labelEl = document.createElement('span');
      labelEl.className = 'key-label';
      labelEl.textContent = note.isBlack ? '' : note.sharpName;
      keyEl.appendChild(labelEl);

      // 點擊琴鍵自主試聽
      keyEl.addEventListener('click', () => {
        if (this.settings.naturalOnly && note.isBlack) return;
        audioEngine.playNote(note.midi);
        keyEl.classList.add('key-active-tap');
        setTimeout(() => keyEl.classList.remove('key-active-tap'), 300);
      });

      this.dom.pianoKeyboard.appendChild(keyEl);
    });

    this.updateKeyboardState();
  }

  /**
   * 當切換自然音模式時，更新鍵盤黑鍵的外觀狀態
   */
  updateKeyboardState() {
    const keys = this.dom.pianoKeyboard.querySelectorAll('.piano-key.black-key');
    keys.forEach((key) => {
      if (this.settings.naturalOnly) {
        key.classList.add('key-disabled');
        key.title = '升降半音已停用 (純白鍵模式)';
      } else {
        key.classList.remove('key-disabled');
        const midi = parseInt(key.dataset.midi, 10);
        const info = getNoteInfo(midi);
        key.title = `${info.sharpName} (${info.frequency}Hz) - 點擊試聽`;
      }
    });
  }

  clearKeyboardHighlights() {
    const keys = this.dom.pianoKeyboard.querySelectorAll('.piano-key');
    keys.forEach((key) => {
      key.classList.remove('key-correct-target', 'key-user-wrong');
    });
  }

  highlightKeyboardNotes(correctMidi, userMidi) {
    this.clearKeyboardHighlights();

    const correctKey = this.dom.pianoKeyboard.querySelector(`[data-midi="${correctMidi}"]`);
    if (correctKey) {
      correctKey.classList.add('key-correct-target');
    }

    if (userMidi !== correctMidi) {
      const userKey = this.dom.pianoKeyboard.querySelector(`[data-midi="${userMidi}"]`);
      if (userKey) {
        userKey.classList.add('key-user-wrong');
      }
    }
  }
}

// 實例化並掛載於 window 方便除錯
window.game = new PitchQuizGame();
document.addEventListener('DOMContentLoaded', () => {
  window.game.init();
});

})();
