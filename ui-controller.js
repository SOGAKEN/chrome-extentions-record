import Settings from './settings.js';
import DownloadManager from './download-manager.js';
import AudioFeedback from './audio-feedback.js';

class UIController {
  constructor(recorder) {
    this.recorder = recorder;
    this.settings = new Settings();
    this.downloadManager = null;
    this.audioFeedback = new AudioFeedback();
    
    this.elements = {
      startButton: document.getElementById('start'),
      stopButton: document.getElementById('stop'),
      preview: document.getElementById('preview'),
      download: document.getElementById('download'),
      status: document.getElementById('status'),
      timer: document.getElementById('timer'),
      settings: document.getElementById('settings'),
      quality: document.getElementById('quality'),
      audioToggle: document.getElementById('audio'),
      // 新しい要素
      downloadFormat: document.getElementById('download-format'),
      downloadPath: document.getElementById('download-path'),
      openDownloads: document.getElementById('open-downloads'),
      showRecordingIndicator: document.getElementById('show-recording-indicator')
    };
    
    this.timerInterval = null;
    this.init();
  }
  
  async init() {
    try {
      console.log('UIController初期化開始');
      
      if (!this.recorder.isSupported()) {
        this.showError('お使いのブラウザは画面録画に対応していません');
        this.elements.startButton.disabled = true;
        return;
      }
      
      // 設定を読み込み
      await this.settings.load();
      this.downloadManager = new DownloadManager(this.settings);
      
      // UIに設定を反映
      this.loadSettingsToUI();
      
      this.attachEventListeners();
      
      // 録画状態を確認
      await this.checkAndRestoreState();
      
      console.log('UIController初期化完了');
    } catch (error) {
      console.error('UIController初期化エラー:', error);
      this.showError('初期化に失敗しました');
    }
  }
  
  attachEventListeners() {
    this.elements.startButton.addEventListener('click', () => this.handleStart());
    this.elements.stopButton.addEventListener('click', () => this.handleStop());
    
    if (this.elements.quality) {
      this.elements.quality.addEventListener('change', (e) => {
        this.updateRecordingQuality(e.target.value);
        this.settings.save({ videoQuality: e.target.value });
      });
    }
    
    if (this.elements.audioToggle) {
      this.elements.audioToggle.addEventListener('change', (e) => {
        this.recorder.updateOptions({ 
          audio: e.target.checked 
        });
        this.settings.save({ recordAudio: e.target.checked });
      });
    }
    
    // 新しいイベントリスナー
    
    if (this.elements.downloadFormat) {
      this.elements.downloadFormat.addEventListener('change', (e) => {
        this.settings.save({ downloadFormat: e.target.value });
      });
    }
    
    if (this.elements.downloadPath) {
      // 入力時にプレビューを更新
      this.elements.downloadPath.addEventListener('input', (e) => {
        const folderName = e.target.value.trim() || 'ScreenRecordings';
        const previewText = document.getElementById('folder-preview-text');
        if (previewText) {
          previewText.textContent = folderName;
        }
      });
      
      // フォーカスアウト時に設定を保存
      this.elements.downloadPath.addEventListener('blur', (e) => {
        const folderName = e.target.value.trim() || 'ScreenRecordings';
        this.settings.save({ downloadPath: folderName });
        e.target.value = folderName; // 空の場合はデフォルト値を設定
      });
    }
    
    if (this.elements.openDownloads) {
      this.elements.openDownloads.addEventListener('click', () => {
        this.downloadManager.openDownloadFolder();
      });
    }
    
    
    if (this.elements.showRecordingIndicator) {
      this.elements.showRecordingIndicator.addEventListener('change', (e) => {
        this.settings.save({ showRecordingIndicator: e.target.checked });
      });
    }
  }
  
  async handleStart() {
    try {
      this.updateUI('starting');
      
      const stream = await this.recorder.startRecording();
      this.elements.preview.srcObject = stream;
      
      this.updateUI('recording');
      this.startTimer();
      
      // 録画開始音を再生
      if (this.settings.get('audioFeedback') !== false) {
        await this.audioFeedback.playStartSound();
      }
      
    } catch (error) {
      if (error.message.includes('キャンセル')) {
        this.updateUI('ready');
        this.showStatus('録画がキャンセルされました', 'info');
      } else {
        this.showError(error.message);
        this.updateUI('ready');
        // エラー音を再生
        if (this.settings.get('audioFeedback') !== false) {
          await this.audioFeedback.playErrorSound();
        }
      }
    }
  }
  
  async handleStop() {
    try {
      this.updateUI('stopping');
      this.stopTimer();
      
      const result = await this.recorder.stopRecording();
      this.showRecordedVideo(result);
      
      this.updateUI('ready');
      this.showStatus('録画が完了しました', 'success');
      
      // 録画停止音を再生
      if (this.settings.get('audioFeedback') !== false) {
        await this.audioFeedback.playStopSound();
      }
      
    } catch (error) {
      this.showError(error.message);
      this.updateUI('ready');
    }
  }
  
  async showRecordedVideo(result) {
    const { blob, filename, duration } = result;
    
    this.elements.preview.srcObject = null;
    this.elements.preview.src = URL.createObjectURL(blob);
    
    const durationText = this.recorder.formatDuration(duration);
    this.showStatus(`録画時間: ${durationText}`, 'info');
    
    // 自動ダウンロードを実行（必須）
    this.showStatus('録画を自動ダウンロード中...', 'info');
    
    const downloadResult = await this.downloadManager.downloadVideo(blob, filename);
    
    if (downloadResult.success) {
      this.showStatus('録画が自動ダウンロードされました', 'success');
      // ダウンロード完了後もリンクを表示（手動で再ダウンロード可能）
      this.createDownloadLink(blob, filename);
    } else {
      this.showError(`ダウンロードエラー: ${downloadResult.error || '不明なエラー'}`);
      // エラーの場合は手動ダウンロードリンクを表示
      this.createDownloadLink(blob, filename);
    }
  }
  
  createDownloadLink(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.className = 'download-link';
    
    const icon = document.createElement('span');
    icon.textContent = '📥 ';
    
    const text = document.createElement('span');
    text.textContent = 'ダウンロード';
    
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = ` (${this.formatFileSize(blob.size)})`;
    
    a.appendChild(icon);
    a.appendChild(text);
    a.appendChild(size);
    
    this.elements.download.innerHTML = '';
    this.elements.download.appendChild(a);
  }
  
  updateUI(state) {
    const states = {
      ready: {
        startButton: { disabled: false, text: '🔴 録画開始' },
        stopButton: { disabled: true, text: '⏹️ 録画停止' },
        status: { text: '録画の準備ができています', class: 'ready' }
      },
      starting: {
        startButton: { disabled: true, text: '準備中...' },
        stopButton: { disabled: true, text: '⏹️ 録画停止' },
        status: { text: '画面を選択してください', class: 'info' }
      },
      recording: {
        startButton: { disabled: true, text: '録画中...' },
        stopButton: { disabled: false, text: '⏹️ 録画停止' },
        status: { text: '録画中', class: 'recording' }
      },
      stopping: {
        startButton: { disabled: true, text: '🔴 録画開始' },
        stopButton: { disabled: true, text: '処理中...' },
        status: { text: '録画を処理しています', class: 'info' }
      }
    };
    
    const currentState = states[state];
    if (!currentState) return;
    
    this.elements.startButton.disabled = currentState.startButton.disabled;
    this.elements.startButton.textContent = currentState.startButton.text;
    this.elements.stopButton.disabled = currentState.stopButton.disabled;
    this.elements.stopButton.textContent = currentState.stopButton.text;
    
    if (this.elements.status) {
      this.elements.status.textContent = currentState.status.text;
      this.elements.status.className = `status ${currentState.status.class}`;
    }
  }
  
  
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      
      if (this.elements.timer) {
        this.elements.timer.textContent = '00:00';
      }
    }
  }
  
  updateRecordingQuality(quality) {
    const qualitySettings = {
      high: { videoBitsPerSecond: 5000000 },
      medium: { videoBitsPerSecond: 2500000 },
      low: { videoBitsPerSecond: 1000000 }
    };
    
    this.recorder.updateRecordingOptions(qualitySettings[quality] || qualitySettings.medium);
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  showStatus(message, type = 'info') {
    if (this.elements.status) {
      this.elements.status.textContent = message;
      this.elements.status.className = `status ${type}`;
    }
  }
  
  showError(message) {
    this.showStatus(`エラー: ${message}`, 'error');
    console.error(message);
  }
  
  async checkAndRestoreState() {
    try {
      // バックグラウンドから状態を取得
      const state = await this.recorder.checkRecordingState();
      
      if (state && state.isRecording) {
        // 録画中の状態を復元
        this.updateUI('recording');
        this.showStatus('録画中（別のウィンドウで開始）', 'recording');
        
        // タイマーを復元
        if (state.startTime) {
          const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
          this.startTimer(elapsed);
        }
      } else {
        // 最後の録画を確認
        const response = await chrome.runtime.sendMessage({ action: 'getLastRecording' });
        if (response.lastRecording) {
          // 録画データがある場合
          this.showStatus('前回の録画データがあります', 'info');
          
          // ダウンロードボタンを表示
          const chunks = await this.recorder.decodeChunks(response.lastRecording.chunks);
          const blob = new Blob(chunks, { type: response.lastRecording.mimeType });
          const filename = this.recorder.generateFilename(response.lastRecording.duration);
          
          this.createDownloadLink(blob, filename);
          this.showStatus('録画データを復元しました', 'success');
          
          // データをクリア
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'clearLastRecording' });
          }, 60000); // 1分後にクリア
        }
        
        this.updateUI('ready');
      }
    } catch (error) {
      console.error('状態復元エラー:', error);
      this.updateUI('ready');
    }
  }
  
  startTimer(initialSeconds = 0) {
    let seconds = initialSeconds;
    this.updateTimerDisplay(seconds);
    
    this.timerInterval = setInterval(() => {
      seconds++;
      this.updateTimerDisplay(seconds);
    }, 1000);
  }
  
  updateTimerDisplay(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    
    if (this.elements.timer) {
      this.elements.timer.textContent = timeString;
    }
  }
  
  loadSettingsToUI() {
    const settings = this.settings.getAll();
    
    if (this.elements.quality) {
      this.elements.quality.value = settings.videoQuality;
    }
    
    if (this.elements.audioToggle) {
      this.elements.audioToggle.checked = settings.recordAudio;
    }
    
    if (this.elements.downloadFormat) {
      this.elements.downloadFormat.value = settings.downloadFormat;
    }
    
    if (this.elements.downloadPath) {
      this.elements.downloadPath.value = settings.downloadPath;
      // 初期プレビューを設定
      const previewText = document.getElementById('folder-preview-text');
      if (previewText) {
        previewText.textContent = settings.downloadPath;
      }
    }
    
    if (this.elements.showRecordingIndicator) {
      this.elements.showRecordingIndicator.checked = settings.showRecordingIndicator;
    }
  }
  
}

export default UIController;