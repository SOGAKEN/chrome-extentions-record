let isRecording = false;
let recordingTabId = null;

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startRecording(message.options, sender)
      .then(sendResponse)
      .catch(error => {
        console.error('Background: startRecording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期レスポンスのため
  } else if (message.action === 'stopRecording') {
    stopRecording()
      .then(sendResponse)
      .catch(error => {
        console.error('Background: stopRecording error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (message.action === 'getRecordingStatus') {
    sendResponse({ isRecording, recordingTabId });
  } else if (message.action === 'downloadRecording') {
    downloadRecording(message.data, message.filename);
    sendResponse({ success: true });
  } else if (message.action === 'recordingStopped') {
    // Offscreenから録画停止の通知を受け取った場合
    handleRecordingStopped();
    sendResponse({ success: true });
  } else if (message.action === 'recordingStartedWithType') {
    // Offscreenから録画開始の詳細情報を受け取った場合
    handleRecordingStartedWithType(message.recordingType, message.settings);
    sendResponse({ success: true });
  } else if (message.action === 'recordingStarted') {
    // WASM版のOffscreenから録画開始通知を受け取った場合
    console.log('Recording started with method:', message.method);
    sendResponse({ success: true });
  } else if (message.action === 'saveRecording') {
    // WASM版から録画データを受け取った場合
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
    const filename = `screen-recording-${timestamp}.webm`;
    downloadRecording(message.data, filename);
    sendResponse({ success: true });
  } else if (message.action === 'processingStatus') {
    // 処理状況の通知を受け取った場合
    handleProcessingStatus(message.status, message.progress);
    sendResponse({ success: true });
  }
  return true;
});

// 録画開始
async function startRecording(options, sender) {
  try {
    // 既にOffscreenドキュメントが存在するか確認
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length === 0) {
      // 録画オプションをURLパラメータとして追加
      const params = new URLSearchParams({
        audio: options.audio || false,
        autoStart: true,
        fixWebM: options.fixWebM || false
      });
      
      const offscreenUrl = `offscreen.html?${params.toString()}`;
      
      // Offscreenドキュメントを作成
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['DISPLAY_MEDIA'],
        justification: 'Recording screen for screen recording extension'
      });
    }

    // Offscreenドキュメントに録画開始を通知
    // 少し待ってからメッセージを送信（Offscreenドキュメントの初期化を待つ）
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Offscreenドキュメントの準備完了を確認
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (contexts.length === 0) {
      throw new Error('Offscreen document not found');
    }
    
    // Offscreenドキュメントは作成されたので、録画は開始されたとみなす
    // Offscreenドキュメント内で自動的に録画が開始される
    const response = { success: true };
    
    // 実際にメッセージを送信（エラーは無視）
    try {
      await chrome.runtime.sendMessage({
        action: 'startRecording',
        options: options
      });
    } catch (e) {
      // Service WorkerからOffscreenへの直接通信はサポートされていない場合がある
      console.log('Message sending skipped:', e.message);
    }

    if (response.success) {
      isRecording = true;
      
      // 現在アクティブなタブを取得
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        recordingTabId = activeTab?.id || null;
        console.log('Recording tab ID:', recordingTabId);
      } catch (error) {
        console.log('Could not get active tab:', error);
        recordingTabId = null;
      }
      
      // 拡張機能アイコンにバッジを表示
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
      
      // 通知を表示
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon.png'),
        title: '録画開始',
        message: '画面録画を開始しました。ポップアップを閉じても録画は継続されます。'
      });
      
      // 録画開始時はボーダー表示を行わない（録画対象の種類が分かってから処理）
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
    // Offscreenドキュメントが存在するか確認
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) {
      // Offscreenドキュメントに録画停止を通知
      // Service WorkerからOffscreenへの通信は一方向で、レスポンスを待たない
      const response = { success: true };
      
      // 実際にメッセージを送信（エラーは無視）
      try {
        await chrome.runtime.sendMessage({
          action: 'stopRecording'
        });
      } catch (e) {
        console.log('Stop message sending skipped:', e.message);
      }

      if (response && response.success) {
        isRecording = false;
        
        // ボーダーを非表示
        if (recordingTabId) {
          try {
            await chrome.tabs.sendMessage(recordingTabId, { action: 'hideRecordingBorder' });
          } catch (error) {
            console.log('Could not hide border - tab might have been closed');
          }
        }
        
        recordingTabId = null;
        
        // バッジをクリア
        chrome.action.setBadgeText({ text: '' });
        
        // 通知を表示
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon.png'),
          title: '録画停止',
          message: '画面録画を停止しました。'
        });

        // Offscreenドキュメントをクリーンアップ
        setTimeout(async () => {
          try {
            await chrome.offscreen.closeDocument();
          } catch (e) {
            // Already closed
          }
        }, 1000);
      }

      return response || { success: true };
    } else {
      // 録画していない場合
      isRecording = false;
      recordingTabId = null;
      chrome.action.setBadgeText({ text: '' });
      return { success: true };
    }
  } catch (error) {
    console.error('Background: 録画停止エラー:', error);
    // エラーが発生しても状態をリセット
    isRecording = false;
    recordingTabId = null;
    chrome.action.setBadgeText({ text: '' });
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

// 録画停止の処理（Offscreenから呼ばれる）
async function handleRecordingStopped() {
  isRecording = false;
  
  // ボーダーを非表示
  if (recordingTabId) {
    try {
      await chrome.tabs.sendMessage(recordingTabId, { action: 'hideRecordingBorder' });
    } catch (error) {
      console.log('Could not hide border - tab might have been closed');
    }
  }
  
  recordingTabId = null;
  
  // バッジをクリア
  chrome.action.setBadgeText({ text: '' });
  
  // 通知を表示
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.png'),
    title: '録画停止',
    message: '画面録画を停止しました。'
  });
}

// 録画開始時の詳細情報を処理
async function handleRecordingStartedWithType(recordingType, settings) {
  console.log('Recording type:', recordingType, 'Settings:', settings);
  
  // ブラウザタブの録画の場合のみボーダーを表示
  if (recordingType === 'browser' && recordingTabId) {
    try {
      await chrome.tabs.sendMessage(recordingTabId, { action: 'showRecordingBorder' });
      console.log('Border display message sent to tab:', recordingTabId);
    } catch (error) {
      console.log('Could not show border - tab might not support content scripts:', error);
    }
  } else if (recordingType === 'monitor') {
    console.log('画面全体の録画中 - ボーダー表示をスキップ');
  } else if (recordingType === 'window') {
    console.log('ウィンドウの録画中 - ボーダー表示をスキップ');
  }
}

// 処理状況の通知を処理
function handleProcessingStatus(status, progress) {
  console.log('Processing status:', status, 'Progress:', progress);
  
  // 処理状況に応じて通知を表示
  if (status === 'processing_started') {
    chrome.notifications.create('processing', {
      type: 'progress',
      iconUrl: chrome.runtime.getURL('icon.png'),
      title: '録画データを処理中',
      message: 'WebMファイルを修正しています...',
      progress: 0
    });
  } else if (status === 'processing_progress' && progress !== undefined) {
    chrome.notifications.update('processing', {
      progress: Math.round(progress)
    });
  } else if (status === 'processing_complete') {
    chrome.notifications.update('processing', {
      type: 'basic',
      title: '処理完了',
      message: '録画データの処理が完了しました。ダウンロードを開始します。',
      progress: undefined
    });
  } else if (status === 'processing_error') {
    chrome.notifications.update('processing', {
      type: 'basic',
      title: '処理エラー',
      message: '録画データの処理中にエラーが発生しました。',
      progress: undefined
    });
  }
}

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
          iconUrl: chrome.runtime.getURL('icon.png'),
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
                iconUrl: chrome.runtime.getURL('icon.png'),
                title: 'ダウンロード完了',
                message: `録画ファイル「${filename}」を保存しました。`
              });
            } else if (delta.error) {
              chrome.downloads.onChanged.removeListener(listener);
              chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icon.png'),
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
      iconUrl: chrome.runtime.getURL('icon.png'),
      title: 'エラー',
      message: '録画ファイルの処理中にエラーが発生しました。'
    });
  }
}