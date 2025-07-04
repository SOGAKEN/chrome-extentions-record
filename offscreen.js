/**
 * Offscreen document for screen recording
 * Uses MediaRecorder API for stable recording
 */

let stream = null;
let mediaRecorder = null;
let startTime = 0;
let ffmpegProcessor = null;

// URLパラメータから設定を取得
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('autoStart') === 'true';
const audioOption = urlParams.get('audio') === 'true';
const fixWebM = urlParams.get('fixWebM') !== 'false'; // デフォルトで有効
let isRecordingStarted = false; // 録画開始済みフラグ

// FFmpegProcessorの動的インポート関数
async function loadFFmpegProcessor() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('ffmpeg-processor.js');
    document.head.appendChild(script);
    
    // スクリプトがロードされるまで待機
    await new Promise((resolve) => {
      script.onload = resolve;
    });
    
    // グローバルなFFmpegProcessorクラスを使用
    if (typeof FFmpegProcessor !== 'undefined') {
      ffmpegProcessor = new FFmpegProcessor();
      console.log('FFmpegProcessor loaded');
    }
  } catch (error) {
    console.error('Failed to load FFmpegProcessor:', error);
  }
}

// FFmpegが必要な場合は事前にロード
if (fixWebM) {
  loadFFmpegProcessor();
}

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
    
    // FFmpegProcessorが利用可能でfixWebMが有効な場合、WebMファイルを修正
    if (fixWebM && ffmpegProcessor) {
      try {
        console.log('Fixing WebM timestamps with FFmpeg...');
        chrome.runtime.sendMessage({
          action: 'processingStatus',
          status: 'Fixing WebM file timestamps...'
        });
        
        // 進捗コールバック関数
        const progressCallback = (status, progress) => {
          chrome.runtime.sendMessage({
            action: 'processingStatus',
            status: status,
            progress: progress
          });
        };
        
        blob = await ffmpegProcessor.fixWebMTimestamps(blob, progressCallback);
        console.log('WebM timestamps fixed successfully');
      } catch (error) {
        console.error('Failed to fix WebM timestamps:', error);
        // エラーが発生しても元のblobを使用して続行
        chrome.runtime.sendMessage({
          action: 'processingStatus',
          status: 'FFmpeg processing failed, using original file'
        });
      }
    }
    
    // Convert to base64 for transfer
    const reader = new FileReader();
    reader.onloadend = () => {
      // Send the recording to background for download
      chrome.runtime.sendMessage({
        action: 'saveRecording',
        data: reader.result
      });
    };
    reader.readAsDataURL(blob);
  };
  
  // Store recorder reference
  mediaRecorder = recorder;
  
  // Start recording
  recorder.start(1000); // Collect data every second
  startTime = performance.now();
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