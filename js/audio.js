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

export const audioEngine = new AudioEngine();
