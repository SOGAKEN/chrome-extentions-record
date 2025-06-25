// 録画インジケーターの管理
class RecordingIndicator {
  constructor() {
    this.indicatorId = 'chrome-screen-recorder-indicator';
    this.indicator = null;
  }
  
  show() {
    if (this.indicator) return;
    
    // インジケーター要素を作成
    this.indicator = document.createElement('div');
    this.indicator.id = this.indicatorId;
    this.indicator.innerHTML = `
      <div class="recording-dot"></div>
      <span class="recording-text">録画中</span>
    `;
    
    // スタイルを適用
    this.applyStyles();
    
    // ページに追加
    document.body.appendChild(this.indicator);
    
    // 画面の境界線を表示
    this.showBorder();
  }
  
  hide() {
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
    
    this.hideBorder();
  }
  
  applyStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #${this.indicatorId} {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(220, 38, 38, 0.9);
        color: white;
        padding: 10px 20px;
        border-radius: 25px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        animation: pulse-indicator 2s infinite;
      }
      
      @keyframes pulse-indicator {
        0%, 100% { opacity: 0.9; }
        50% { opacity: 1; }
      }
      
      #${this.indicatorId} .recording-dot {
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
        animation: blink 1s infinite;
      }
      
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      
      .chrome-screen-recorder-border {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        border: 4px solid #facc15;
        box-shadow: 
          inset 0 0 20px rgba(250, 204, 21, 0.3),
          0 0 20px rgba(250, 204, 21, 0.3);
        animation: border-pulse 2s infinite;
      }
      
      @keyframes border-pulse {
        0%, 100% { 
          opacity: 0.8; 
          box-shadow: 
            inset 0 0 20px rgba(250, 204, 21, 0.3),
            0 0 20px rgba(250, 204, 21, 0.3);
        }
        50% { 
          opacity: 1; 
          box-shadow: 
            inset 0 0 30px rgba(250, 204, 21, 0.5),
            0 0 30px rgba(250, 204, 21, 0.5);
        }
      }
      
      .chrome-screen-recorder-border-top {
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
      }
      
      .chrome-screen-recorder-border-bottom {
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
      }
      
      .chrome-screen-recorder-border-left {
        top: 0;
        bottom: 0;
        left: 0;
        width: 4px;
      }
      
      .chrome-screen-recorder-border-right {
        top: 0;
        bottom: 0;
        right: 0;
        width: 4px;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  showBorder() {
    const borders = ['top', 'bottom', 'left', 'right'];
    
    borders.forEach(position => {
      const border = document.createElement('div');
      border.className = `chrome-screen-recorder-border chrome-screen-recorder-border-${position}`;
      document.body.appendChild(border);
    });
  }
  
  hideBorder() {
    const borders = document.querySelectorAll('.chrome-screen-recorder-border');
    borders.forEach(border => border.remove());
  }
}

// インスタンスを作成
const recordingIndicator = new RecordingIndicator();

// バックグラウンドスクリプトからのメッセージを受信
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('コンテンツスクリプト: メッセージ受信', request);
    
    try {
      switch (request.action) {
        case 'ping':
          sendResponse({ success: true, pong: true });
          break;
          
        case 'showRecordingIndicator':
          recordingIndicator.show();
          sendResponse({ success: true });
          break;
          
        case 'hideRecordingIndicator':
          recordingIndicator.hide();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false });
      }
    } catch (error) {
      console.error('コンテンツスクリプトエラー:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true;
  });
}