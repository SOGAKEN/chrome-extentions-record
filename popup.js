import ScreenRecorder from './recorder.js';
import UIController from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - 初期化開始');
  
  try {
    const recorder = new ScreenRecorder();
    const uiController = new UIController(recorder);
    
    // Chrome拡張機能のコンテキストで実行されているか確認
    if (chrome && chrome.runtime && chrome.runtime.id) {
      console.log('Simple Screen Recorder が初期化されました');
    }
  } catch (error) {
    console.error('初期化エラー:', error);
  }
});