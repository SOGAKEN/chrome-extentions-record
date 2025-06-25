class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.startTime = null;
    this.useBackground = true; // バックグラウンド処理を使用
    
    this.options = {
      video: {
        displaySurface: 'browser',
        logicalSurface: true,
        cursor: 'always'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      },
      preferCurrentTab: false
    };
    
    this.recordingOptions = {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 2500000
    };
  }
  
  async startRecording() {
    try {
      this.recordedChunks = [];
      this.stream = await navigator.mediaDevices.getDisplayMedia(this.options);
      
      if (!this.stream) {
        throw new Error('画面の取得がキャンセルされました');
      }
      
      this.setupMediaRecorder();
      this.mediaRecorder.start(1000); // 1秒ごとにデータを取得
      this.isRecording = true;
      this.startTime = Date.now();
      
      // バックグラウンドに録画開始を通知
      if (this.useBackground) {
        const showIndicator = await this.shouldShowIndicator();
        console.log('録画インジケーター表示設定:', showIndicator);
        chrome.runtime.sendMessage({
          action: 'startRecording',
          mimeType: this.recordingOptions.mimeType,
          showIndicator: showIndicator
        });
      }
      
      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopRecording();
      });
      
      return this.stream;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }
  
  setupMediaRecorder() {
    const supportedMimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    
    let selectedMimeType = supportedMimeTypes.find(type => 
      MediaRecorder.isTypeSupported(type)
    );
    
    this.recordingOptions.mimeType = selectedMimeType || 'video/webm';
    
    this.mediaRecorder = new MediaRecorder(this.stream, this.recordingOptions);
    
    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
        
        // バックグラウンドにチャンクを送信
        if (this.useBackground) {
          // Blobをbase64に変換して送信
          const reader = new FileReader();
          reader.onloadend = () => {
            chrome.runtime.sendMessage({
              action: 'addChunk',
              chunk: reader.result
            });
          };
          reader.readAsDataURL(event.data);
        }
      }
    };
    
    this.mediaRecorder.onerror = (error) => {
      this.handleError(error);
    };
  }
  
  stopRecording() {
    return new Promise(async (resolve, reject) => {
      // バックグラウンドから録画を停止する場合
      if (this.useBackground && (!this.mediaRecorder || this.mediaRecorder.state === 'inactive')) {
        try {
          const response = await chrome.runtime.sendMessage({ action: 'stopRecording' });
          if (response.success && response.hasChunks) {
            // バックグラウンドから録画データを取得
            const result = await chrome.runtime.sendMessage({ action: 'getLastRecording' });
            if (result.lastRecording) {
              const chunks = await this.decodeChunks(result.lastRecording.chunks);
              const blob = new Blob(chunks, { type: result.lastRecording.mimeType });
              const filename = this.generateFilename(result.lastRecording.duration);
              
              resolve({ blob, filename, duration: result.lastRecording.duration });
              return;
            }
          }
        } catch (error) {
          console.error('バックグラウンドからの録画取得エラー:', error);
        }
      }
      
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('録画が開始されていません'));
        return;
      }
      
      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordedChunks, { 
            type: this.recordingOptions.mimeType 
          });
          
          const duration = Date.now() - this.startTime;
          const filename = this.generateFilename(duration);
          
          // バックグラウンドに停止を通知
          if (this.useBackground) {
            await chrome.runtime.sendMessage({ action: 'stopRecording' });
          }
          
          this.cleanup();
          
          resolve({ blob, filename, duration });
        } catch (error) {
          reject(error);
        }
      };
      
      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }
  
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = null;
  }
  
  generateFilename(duration) {
    const date = new Date();
    const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const durationStr = this.formatDuration(duration);
    return `screen-recording_${timestamp}_${durationStr}.webm`;
  }
  
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m${remainingSeconds}s`;
  }
  
  handleError(error) {
    console.error('録画エラー:', error);
    this.cleanup();
  }
  
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }
  
  updateOptions(options) {
    this.options = { ...this.options, ...options };
  }
  
  updateRecordingOptions(options) {
    this.recordingOptions = { ...this.recordingOptions, ...options };
  }
  
  async decodeChunks(base64Chunks) {
    const chunks = [];
    for (const base64 of base64Chunks) {
      const response = await fetch(base64);
      const blob = await response.blob();
      chunks.push(blob);
    }
    return chunks;
  }
  
  async checkRecordingState() {
    if (this.useBackground) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getState' });
        return response.recordingState;
      } catch (error) {
        console.error('録画状態の確認エラー:', error);
        return null;
      }
    }
    return null;
  }
  
  async shouldShowIndicator() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      return result.settings?.showRecordingIndicator !== false;
    } catch (error) {
      return true; // デフォルトは表示
    }
  }
}

export default ScreenRecorder;