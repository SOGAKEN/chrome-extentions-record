// content-script.js
// 録画中のインジケーターを表示

let borderElement = null;

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showRecordingBorder') {
    showRecordingBorder();
  } else if (request.action === 'hideRecordingBorder') {
    hideRecordingBorder();
  }
  sendResponse({ success: true });
});

// 録画中のボーダーを表示
function showRecordingBorder() {
  if (borderElement) return;

  borderElement = document.createElement('div');
  borderElement.id = 'screen-recording-border';
  borderElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 5px solid #ff0000;
    pointer-events: none;
    z-index: 2147483647;
    box-sizing: border-box;
    animation: recording-pulse 2s ease-in-out infinite;
  `;

  // アニメーション用のスタイルを追加
  const style = document.createElement('style');
  style.textContent = `
    @keyframes recording-pulse {
      0% { border-color: #ff0000; }
      50% { border-color: #ff6666; }
      100% { border-color: #ff0000; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(borderElement);
}

// 録画中のボーダーを非表示
function hideRecordingBorder() {
  if (borderElement) {
    borderElement.remove();
    borderElement = null;
  }
}