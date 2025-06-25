class AudioFeedback {
  constructor() {
    this.audioContext = null;
  }
  
  async playSound(type) {
    try {
      // AudioContextを作成（初回のみ）
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // サウンドタイプに応じた設定
      const sounds = {
        start: {
          frequency: 800,
          duration: 0.15,
          type: 'sine',
          volume: 0.3
        },
        stop: {
          frequency: 400,
          duration: 0.2,
          type: 'sine',
          volume: 0.3
        },
        error: {
          frequency: 200,
          duration: 0.3,
          type: 'square',
          volume: 0.2
        }
      };
      
      const sound = sounds[type] || sounds.start;
      
      // オシレーターを作成
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      // 接続
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // 設定
      oscillator.type = sound.type;
      oscillator.frequency.setValueAtTime(sound.frequency, this.audioContext.currentTime);
      
      // ボリューム設定（フェードアウト効果）
      gainNode.gain.setValueAtTime(sound.volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + sound.duration);
      
      // 再生
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + sound.duration);
      
    } catch (error) {
      console.error('音声フィードバックエラー:', error);
    }
  }
  
  async playStartSound() {
    await this.playSound('start');
  }
  
  async playStopSound() {
    await this.playSound('stop');
  }
  
  async playErrorSound() {
    await this.playSound('error');
  }
}

export default AudioFeedback;