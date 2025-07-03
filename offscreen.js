let mediaRecorder = null;
let recordedChunks = [];
let stream = null;

// URLパラメータから設定を取得
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('autoStart') === 'true';
const audioOption = urlParams.get('audio') === 'true';

// 自動開始が有効な場合は録画を開始
if (autoStart) {
  console.log('Auto-starting recording with options:', { audio: audioOption });
  startRecording({ audio: audioOption }).then(result => {
    if (!result.success) {
      console.error('Auto-start failed:', result.error);
    }
  });
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 新しい統一されたアクション名に対応
  if (message.action === 'startRecording' || message.action === 'startOffscreenRecording') {
    startRecording(message.options).then(sendResponse);
    return true; // 非同期レスポンスのため
  } else if (message.action === 'stopRecording' || message.action === 'stopOffscreenRecording') {
    stopRecording().then(sendResponse);
    return true;
  }
});

// 録画開始
async function startRecording(options) {
  try {
    // 既存の録画があれば停止
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      await stopRecording();
    }

    // 画面共有の取得
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser'
      },
      audio: options.audio || false
    });

    // MediaRecorderの設定
    const recorderOptions = {
      mimeType: 'video/webm;codecs=vp9,opus'
    };
    
    if (!MediaRecorder.isTypeSupported(recorderOptions.mimeType)) {
      recorderOptions.mimeType = 'video/webm';
    }
    
    mediaRecorder = new MediaRecorder(stream, recorderOptions);
    recordedChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      await saveRecording();
    };
    
    // ストリームが終了したら自動的に停止（共有停止ボタンが押された場合）
    stream.getVideoTracks()[0].onended = async () => {
      console.log('共有が停止されました。録画を終了します。');
      await stopRecording();
      // バックグラウンドに通知
      chrome.runtime.sendMessage({ action: 'recordingStopped' });
    };
    
    mediaRecorder.start();
    
    // 録画対象の情報を取得
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    console.log('Recording started with settings:', settings);
    
    // 録画対象の種類を判別
    let recordingType = 'unknown';
    if (settings.displaySurface) {
      recordingType = settings.displaySurface; // 'monitor', 'window', 'browser'
    }
    
    // バックグラウンドに録画開始を通知
    chrome.runtime.sendMessage({ 
      action: 'recordingStartedWithType',
      recordingType: recordingType,
      settings: settings
    });
    
    return { success: true, trackSettings: settings, recordingType: recordingType };
  } catch (error) {
    console.error('Offscreen: 録画開始エラー:', error);
    return { success: false, error: error.message };
  }
}

// 録画停止
async function stopRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      
      // stopイベントが完了するまで待機
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (mediaRecorder.state === 'inactive') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Offscreen: 録画停止エラー:', error);
    return { success: false, error: error.message };
  }
}

// 録画保存
async function saveRecording() {
  try {
    const blob = new Blob(recordedChunks, {
      type: 'video/webm'
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `screen-recording-${timestamp}.webm`;
    
    // BlobをBase64に変換
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    await new Promise((resolve, reject) => {
      reader.onloadend = resolve;
      reader.onerror = reject;
    });
    
    const base64data = reader.result;
    
    // バックグラウンドスクリプトに送信してダウンロード
    chrome.runtime.sendMessage({
      action: 'downloadRecording',
      data: base64data,
      filename: filename
    });
    
    recordedChunks = [];
  } catch (error) {
    console.error('Offscreen: 録画保存エラー:', error);
  }
}