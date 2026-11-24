/**
 * 遊戲主控制器 (Game Controller)
 * 負責掌控題目流程、答題回饋、再播機制、分數統計、自然音切換與難度控制
 */

import { MIN_MIDI, MAX_MIDI, getNoteInfo, formatNoteName, compareInterval, ALL_NOTES, NATURAL_NOTES, isNaturalNote } from './notes.js';
import { buildQuestionOptions } from './distractor.js';
import { audioEngine } from './audio.js';

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
