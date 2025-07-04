/**
 * Offscreen document for screen recording
 * Uses MediaRecorder API for stable recording
 */

let stream = null;
let mediaRecorder = null;
let startTime = 0;
let recordingStartTime = null;
let webmDurationFix = null;

// URLパラメータから設定を取得
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('autoStart') === 'true';
const audioOption = urlParams.get('audio') === 'true';
let isRecordingStarted = false; // 録画開始済みフラグ

// WebMDurationFixの読み込み
async function loadWebMDurationFix() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('webm-duration-fix.js');
    document.head.appendChild(script);
    
    await new Promise((resolve) => {
      script.onload = resolve;
    });
    
    if (typeof WebMDurationFix !== 'undefined') {
      webmDurationFix = new WebMDurationFix();
      console.log('WebMDurationFix loaded');
    }
  } catch (error) {
    console.error('Failed to load WebMDurationFix:', error);
  }
}

// 必要なライブラリをロード
loadWebMDurationFix(); // 常にロード（軽量なため）

// 自動開始が有効な場合は録画を開始
if (autoStart && !isRecordingStarted) {
  console.log('Auto-starting recording with options:', { audio: audioOption });
  // 自動開始を少し遅延させて初期化を待つ
  setTimeout(async () => {
    if (!isRecordingStarted) {
      isRecordingStarted = true;
      try {
        await startRecording({ audio: audioOption });
      } catch (error) {
        console.error('Auto-start failed:', error);
        isRecordingStarted = false;
      }
    }
  }, 500);
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action);
  
  if (request.action === 'startRecording') {
    // 既に録画開始している場合はスキップ
    if (isRecordingStarted) {
      console.log('Recording already started, skipping duplicate request');
      sendResponse({ success: true });
      return;
    }
    
    try {
      isRecordingStarted = true;
      await startRecording(request.options || { audio: audioOption });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Failed to start recording:', error);
      isRecordingStarted = false;
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'stopRecording') {
    try {
      const result = await stopRecording();
      sendResponse({ success: true, data: result });
    } catch (error) {
      console.error('Failed to stop recording:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true; // Keep the message channel open for async response
});

async function startRecording(options) {
  try {
    // Request screen capture
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser'
      },
      audio: options.audio || false
    });
    
    console.log('Screen capture started');
    
    // Use MediaRecorder directly
    await startMediaRecording(stream, options);
    
    // Send notification that recording has started
    chrome.runtime.sendMessage({ 
      action: 'recordingStarted',
      method: 'MediaRecorder'
    });
    
    // Listen for stream end
    stream.getVideoTracks()[0].onended = async () => {
      console.log('Stream ended by user');
      await stopRecording();
      chrome.runtime.sendMessage({ action: 'recordingStopped' });
    };
    
    return { success: true };
  } catch (error) {
    console.error('Error starting recording:', error);
    cleanup();
    throw error;
  }
}

async function startMediaRecording(stream, options) {
  console.log('Starting recording with MediaRecorder');
  
  // MediaRecorder APIを使用（より安定）
  const mimeType = 'video/webm;codecs=vp8' + (options.audio ? ',opus' : '');
  
  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType,
    videoBitsPerSecond: getBitrateForQuality(options.quality)
  });
  
  const chunks = [];
  
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  
  recorder.onstop = async () => {
    let blob = new Blob(chunks, { type: 'video/webm' });
    const recordingDuration = Date.now() - recordingStartTime; // 録画時間を計算
    
    // WebMDurationFixで軽量な修正を試みる
    if (webmDurationFix) {
      try {
        console.log('Fixing WebM duration metadata...');
        blob = await webmDurationFix.fixDuration(blob, recordingDuration);
        console.log('WebM duration fixed successfully');
      } catch (error) {
        console.error('Failed to fix WebM duration:', error);
        // エラーが発生しても続行
      }
    }
    
    // Convert to base64 for transfer
    const reader = new FileReader();
    reader.onloadend = () => {
      // Send the recording to background for download
      chrome.runtime.sendMessage({
        action: 'saveRecording',
        data: reader.result,
        duration: recordingDuration // 録画時間も送信
      });
    };
    reader.readAsDataURL(blob);
  };
  
  // Store recorder reference
  mediaRecorder = recorder;
  
  // Start recording
  recorder.start(1000); // Collect data every second
  startTime = performance.now();
  recordingStartTime = Date.now(); // 録画開始時刻を記録
}

async function stopRecording() {
  console.log('Stopping recording...');
  
  try {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      // Stop MediaRecorder
      mediaRecorder.stop();
      
      // Wait for stop event to fire
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true });
        }, 100);
      });
    }
  } finally {
    cleanup();
    isRecordingStarted = false;
  }
}

function cleanup() {
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  // Clean up MediaRecorder
  if (mediaRecorder) {
    mediaRecorder = null;
  }
}

function getBitrateForQuality(quality) {
  switch (quality) {
    case 'high':
      return 5_000_000; // 5 Mbps
    case 'medium':
      return 2_500_000; // 2.5 Mbps
    case 'low':
      return 1_000_000; // 1 Mbps
    default:
      return 2_500_000; // Default to medium
  }
}

// Log that offscreen document is ready
console.log('Offscreen document ready');