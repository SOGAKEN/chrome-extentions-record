class Settings {
  constructor() {
    this.defaultSettings = {
      autoDownload: true,
      downloadFormat: 'mp4', // 'webm' or 'mp4'
      downloadPath: 'ScreenRecordings', // サブフォルダ名
      videoQuality: 'medium',
      recordAudio: true,
      convertToMp4: true,
      mp4Quality: 'high', // 'high', 'medium', 'low'
      deleteWebmAfterConvert: true,
      showRecordingIndicator: true
    };
    
    this.settings = { ...this.defaultSettings };
  }
  
  async load() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.settings = { ...this.defaultSettings, ...result.settings };
      }
    } catch (error) {
      console.error('設定の読み込みエラー:', error);
    }
    return this.settings;
  }
  
  async save(newSettings) {
    try {
      // autoDownloadを常にtrueに強制
      const settingsToSave = { ...this.settings, ...newSettings };
      settingsToSave.autoDownload = true;
      
      this.settings = settingsToSave;
      await chrome.storage.local.set({ settings: this.settings });
      return true;
    } catch (error) {
      console.error('設定の保存エラー:', error);
      return false;
    }
  }
  
  get(key) {
    return this.settings[key];
  }
  
  getAll() {
    return { ...this.settings };
  }
  
  reset() {
    this.settings = { ...this.defaultSettings };
    return this.save(this.settings);
  }
}

export default Settings;