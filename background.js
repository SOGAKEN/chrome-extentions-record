let isRecording = false;
let recordingTabId = null;

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startRecording(message.options, sender).then(sendResponse);
    return true; // 非同期レスポンスのため
  } else if (message.action === 'stopRecording') {
    stopRecording().then(sendResponse);
    return true;
  } else if (message.action === 'getRecordingStatus') {
    sendResponse({ isRecording, recordingTabId });
  } else if (message.action === 'downloadRecording') {
    downloadRecording(message.data, message.filename);
  }
});

// 録画開始
async function startRecording(options, sender) {
  try {
    // 既にOffscreenドキュメントが存在するか確認
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length === 0) {
      // Offscreenドキュメントを作成
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DISPLAY_MEDIA'],
        justification: 'Recording screen for screen recording extension'
      });
    }

    // Offscreenドキュメントに録画開始を通知
    const response = await chrome.runtime.sendMessage({
      action: 'startOffscreenRecording',
      options: options
    });

    if (response.success) {
      isRecording = true;
      recordingTabId = sender?.tab?.id || null;
      
      // 拡張機能アイコンにバッジを表示
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
      
      // 通知を表示
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '録画開始',
        message: '画面録画を開始しました。ポップアップを閉じても録画は継続されます。'
      });
    }

    return response;
  } catch (error) {
    console.error('Background: 録画開始エラー:', error);
    return { success: false, error: error.message };
  }
}

// 録画停止
async function stopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'stopOffscreenRecording'
    });

    if (response.success) {
      isRecording = false;
      recordingTabId = null;
      
      // バッジをクリア
      chrome.action.setBadgeText({ text: '' });
      
      // 通知を表示
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '録画停止',
        message: '画面録画を停止しました。'
      });
    }

    return response;
  } catch (error) {
    console.error('Background: 録画停止エラー:', error);
    return { success: false, error: error.message };
  }
}

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

// タブが閉じられた時の処理
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && isRecording) {
    // 録画タブが閉じられた場合は録画を継続（バックグラウンドで）
    console.log('録画タブが閉じられましたが、録画は継続します');
  }
});

// 録画のダウンロード
async function downloadRecording(base64data, filename) {
  try {
    // Service WorkerではURL.createObjectURLが使えないため、
    // base64データURLを直接使用してダウンロード
    chrome.downloads.download({
      url: base64data,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('ダウンロードエラー:', chrome.runtime.lastError);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'ダウンロードエラー',
          message: '録画ファイルのダウンロードに失敗しました。'
        });
      } else {
        // ダウンロード状態を監視
        chrome.downloads.onChanged.addListener(function listener(delta) {
          if (delta.id === downloadId) {
            if (delta.state && delta.state.current === 'complete') {
              chrome.downloads.onChanged.removeListener(listener);
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'ダウンロード完了',
                message: `録画ファイル「${filename}」を保存しました。`
              });
            } else if (delta.error) {
              chrome.downloads.onChanged.removeListener(listener);
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'ダウンロードエラー',
                message: 'ファイルの保存中にエラーが発生しました。'
              });
            }
          }
        });
      }
    });
  } catch (error) {
    console.error('録画ダウンロードエラー:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'エラー',
      message: '録画ファイルの処理中にエラーが発生しました。'
    });
  }
}