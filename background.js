let recordingState = {
  isRecording: false,
  startTime: null,
  recordedChunks: [],
  mimeType: 'video/webm'
};

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startRecording':
      recordingState.isRecording = true;
      recordingState.startTime = Date.now();
      recordingState.recordedChunks = [];
      recordingState.mimeType = request.mimeType || 'video/webm';
      
      // 状態を保存
      chrome.storage.local.set({ recordingState });
      
      // 録画インジケーターを表示
      if (request.showIndicator) {
        console.log('録画インジケーターを表示します');
        showRecordingIndicator();
      }
      
      // 通知を表示
      showNotification('recording-started', {
        title: '画面録画を開始しました',
        message: '録画中...',
        iconUrl: 'icon.png',
        requireInteraction: true,
        silent: false
      });
      
      // 定期的に録画状態を通知
      startRecordingReminder();
      
      // 拡張機能アイコンにバッジを設定
      setBadgeRecording();
      
      sendResponse({ success: true });
      break;
      
    case 'addChunk':
      if (recordingState.isRecording && request.chunk) {
        recordingState.recordedChunks.push(request.chunk);
        chrome.storage.local.set({ recordingState });
      }
      sendResponse({ success: true });
      break;
      
    case 'stopRecording':
      if (recordingState.isRecording) {
        recordingState.isRecording = false;
        const duration = Date.now() - recordingState.startTime;
        
        // 録画インジケーターを非表示
        hideRecordingIndicator();
        
        // リマインダーを停止
        stopRecordingReminder();
        
        // バッジをクリア
        clearBadge();
        
        // 通知を更新
        showNotification('recording-stopped', {
          title: '画面録画を停止しました',
          message: `録画時間: ${formatDuration(duration)}`,
          iconUrl: 'icon.png',
          requireInteraction: false,
          silent: false
        });
        
        // 録画データを一時的に保存
        chrome.storage.local.set({ 
          recordingState,
          lastRecording: {
            chunks: recordingState.recordedChunks,
            duration: duration,
            mimeType: recordingState.mimeType,
            timestamp: Date.now()
          }
        });
        
        sendResponse({ 
          success: true, 
          duration: duration,
          hasChunks: recordingState.recordedChunks.length > 0
        });
        
        // 状態をリセット
        recordingState = {
          isRecording: false,
          startTime: null,
          recordedChunks: [],
          mimeType: 'video/webm'
        };
      } else {
        sendResponse({ success: false, error: '録画が開始されていません' });
      }
      break;
      
    case 'getState':
      sendResponse({ recordingState });
      break;
      
    case 'getLastRecording':
      chrome.storage.local.get(['lastRecording'], (result) => {
        sendResponse({ lastRecording: result.lastRecording });
      });
      return true; // 非同期レスポンスのため
      
    case 'clearLastRecording':
      chrome.storage.local.remove(['lastRecording']);
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: '不明なアクション' });
  }
  
  return true;
});

// 拡張機能の起動時に状態を復元
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['recordingState'], (result) => {
    if (result.recordingState) {
      recordingState = result.recordingState;
    }
  });
});

// インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.clear();
});

// 録画インジケーターを表示
async function showRecordingIndicator() {
  try {
    // 全てのタブに録画インジケーターを表示
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && isValidTabUrl(tab.url)) {
        try {
          // まずコンテンツスクリプトが注入されているか確認
          await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
          // 応答があればインジケーターを表示
          await chrome.tabs.sendMessage(tab.id, { action: 'showRecordingIndicator' });
        } catch (error) {
          // コンテンツスクリプトが注入されていない場合、注入を試みる
          console.log(`タブ ${tab.id} にコンテンツスクリプトを注入中...`);
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content-script.js']
            });
            // 注入成功後、インジケーターを表示
            await chrome.tabs.sendMessage(tab.id, { action: 'showRecordingIndicator' });
          } catch (injectError) {
            console.warn(`タブ ${tab.id} へのスクリプト注入失敗:`, injectError.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('録画インジケーター表示エラー:', error);
  }
}

// 録画インジケーターを非表示
async function hideRecordingIndicator() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && isValidTabUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { action: 'hideRecordingIndicator' }).catch((error) => {
          console.log(`タブ ${tab.id} への非表示メッセージ送信失敗:`, error.message);
        });
      }
    }
  } catch (error) {
    console.error('録画インジケーター非表示エラー:', error);
  }
}

// URLが有効かチェック
function isValidTabUrl(url) {
  if (!url) return false;
  
  // 除外するURLパターン
  const excludedPatterns = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'blob:',
    'file:///Applications/', // macOSのアプリケーション
    'file:///System/'       // システムファイル
  ];
  
  return !excludedPatterns.some(pattern => url.startsWith(pattern));
}

// 通知を表示
function showNotification(notificationId, options) {
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: options.iconUrl || 'icon.png',
    title: options.title,
    message: options.message,
    requireInteraction: options.requireInteraction || false,
    silent: options.silent !== false ? true : false,
    priority: 2
  });
}

// 録画中リマインダー
let reminderInterval = null;

function startRecordingReminder() {
  stopRecordingReminder(); // 既存のリマインダーを停止
  
  // 30秒ごとに録画中であることを通知
  reminderInterval = setInterval(() => {
    if (recordingState.isRecording) {
      const duration = Date.now() - recordingState.startTime;
      chrome.notifications.update('recording-started', {
        message: `録画中... (${formatDuration(duration)})`
      });
    }
  }, 30000); // 30秒
}

function stopRecordingReminder() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  // 録画通知をクリア
  chrome.notifications.clear('recording-started');
}

// 時間フォーマット
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}

// 通知クリック時の処理
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'recording-started') {
    // 拡張機能のポップアップを開く（制限があるため、新しいタブで開く）
    chrome.action.openPopup();
  }
});

// 拡張機能アイコンのバッジ設定
function setBadgeRecording() {
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  
  // アイコンタイトルを更新
  chrome.action.setTitle({ title: '録画中 - クリックして停止' });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: 'Simple Screen Recorder' });
}

// 拡張機能起動時にバッジ状態を復元
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['recordingState'], (result) => {
    if (result.recordingState && result.recordingState.isRecording) {
      setBadgeRecording();
    }
  });
});