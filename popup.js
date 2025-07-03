let startTime = null;
let timerInterval = null;

const elements = {
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  status: document.getElementById('status'),
  timer: document.getElementById('timer'),
  audioCheck: document.getElementById('audioCheck'),
  downloadSection: document.getElementById('downloadSection'),
  downloadList: document.getElementById('downloadList')
};

// 初期化時に録画状態を確認
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getRecordingStatus' });
    if (response && response.isRecording) {
      // 録画中の場合はUIを更新
      elements.status.textContent = '録画中...';
      elements.status.className = 'status recording';
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      elements.audioCheck.disabled = true;
      
      // タイマーは開始時間を推定（正確な時間は保持していないため）
      startTime = Date.now();
      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      // 録画していない場合はUIをリセット
      resetUI();
    }
  } catch (error) {
    console.error('録画状態の確認エラー:', error);
    // エラーが発生した場合は安全のためUIをリセット
    resetUI();
  }
  
  // 最近のダウンロードを表示
  updateDownloadList();
});

// 録画開始
async function startRecording() {
  try {
    elements.status.textContent = '録画を開始しています...';
    
    const options = {
      audio: elements.audioCheck.checked,
      useWASM: true // 常にWASMモードを使用
    };
    
    // バックグラウンドスクリプトに録画開始を依頼
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      options: options
    });
    
    if (response.success) {
      // UI更新
      elements.status.textContent = '録画中...';
      elements.status.className = 'status recording';
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      elements.audioCheck.disabled = true;
      
      // タイマー開始
      startTime = Date.now();
      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      throw new Error(response.error || '録画開始に失敗しました');
    }
  } catch (error) {
    console.error('録画開始エラー:', error);
    elements.status.textContent = 'エラー: ' + error.message;
    resetUI();
  }
}

// 録画停止
async function stopRecording() {
  try {
    elements.status.textContent = '録画を停止しています...';
    elements.stopBtn.disabled = true; // 連打防止
    
    // バックグラウンドスクリプトに録画停止を依頼
    const response = await chrome.runtime.sendMessage({
      action: 'stopRecording'
    });
    
    if (response && response.success) {
      elements.status.textContent = '録画を保存しました';
      
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      
      resetUI();
      // ダウンロードリストを更新
      setTimeout(updateDownloadList, 1000);
    } else {
      throw new Error(response?.error || '録画停止に失敗しました');
    }
  } catch (error) {
    console.error('録画停止エラー:', error);
    elements.status.textContent = 'エラー: ' + error.message;
    // エラー時もUIをリセット
    resetUI();
  }
}

// UI初期化
function resetUI() {
  elements.status.textContent = '準備完了';
  elements.status.className = 'status';
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.audioCheck.disabled = false;
  elements.timer.textContent = '00:00';
}

// タイマー更新
function updateTimer() {
  if (!startTime) return;
  
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  elements.timer.textContent = `${minutes}:${seconds}`;
}

// イベントリスナー
elements.startBtn.addEventListener('click', startRecording);
elements.stopBtn.addEventListener('click', stopRecording);

// MediaRecorderサポート確認
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
  elements.status.textContent = 'お使いのブラウザは画面録画に対応していません';
  elements.startBtn.disabled = true;
}

// 最近のダウンロードを表示
async function updateDownloadList() {
  try {
    // 最新の1件のみ取得（パフォーマンス改善）
    const downloads = await chrome.downloads.search({
      query: ['screen-recording-'],
      orderBy: ['-startTime'],
      limit: 1
    });
    
    if (downloads.length > 0 && downloads[0].filename.includes('screen-recording-')) {
      elements.downloadSection.style.display = 'block';
      elements.downloadList.innerHTML = '';
      
      const item = createDownloadItem(downloads[0]);
      elements.downloadList.appendChild(item);
    } else {
      elements.downloadSection.style.display = 'none';
    }
  } catch (error) {
    console.error('ダウンロードリスト取得エラー:', error);
  }
}

// ダウンロードアイテムを作成
function createDownloadItem(download) {
  const item = document.createElement('div');
  item.className = 'download-item';
  
  const filename = download.filename.split('/').pop() || download.filename.split('\\').pop();
  const fileSize = formatBytes(download.fileSize || download.totalBytes);
  
  item.innerHTML = `
    <span class="filename" title="${filename}">${filename}</span>
    <span class="size">${fileSize}</span>
    <button onclick="openFile('${download.id}')">開く</button>
  `;
  
  return item;
}

// ファイルサイズをフォーマット
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイルを開く
window.openFile = function(downloadId) {
  chrome.downloads.open(parseInt(downloadId));
};

// ダウンロード完了時にリストを更新
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    updateDownloadList();
  }
});