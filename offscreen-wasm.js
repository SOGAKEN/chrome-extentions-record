/**
 * Enhanced offscreen document for WASM-based recording
 * Provides better performance and memory efficiency
 */

let mediaRecorder = null;
let stream = null;
let wasmEncoder = null;
let webmWriter = null;
let startTime = 0;
let isUsingWASM = false;

// Check if WebCodecs API is available
const isWebCodecsSupported = 'VideoEncoder' in self && 'AudioEncoder' in self;

// URLパラメータから設定を取得
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('autoStart') === 'true';
const audioOption = urlParams.get('audio') === 'true';
const useWASMOption = urlParams.get('useWASM') === 'true';

// 自動開始が有効な場合は録画を開始
if (autoStart) {
  console.log('Auto-starting WASM recording with options:', { audio: audioOption, useWASM: useWASMOption });
  startRecording({ audio: audioOption, useWASM: useWASMOption }).then(result => {
    if (!result.success) {
      console.error('Auto-start failed:', result.error);
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action);
  
  // Offscreenへの転送メッセージの場合
  if (request.toOffscreen) {
    let response;
    
    if (request.action === 'startRecording') {
      try {
        await startRecording(request.options);
        response = { success: true };
      } catch (error) {
        console.error('Failed to start recording:', error);
        response = { success: false, error: error.message };
      }
    } else if (request.action === 'stopRecording') {
      try {
        const result = await stopRecording();
        response = { success: true, data: result };
      } catch (error) {
        console.error('Failed to stop recording:', error);
        response = { success: false, error: error.message };
      }
    }
    
    // メッセージIDを含めて返信
    if (request.messageId) {
      chrome.runtime.sendMessage({
        messageId: request.messageId,
        data: response
      });
    }
    sendResponse(response);
  } else {
    // 直接のメッセージの場合（従来の処理）
    if (request.action === 'startRecording') {
      try {
        await startRecording(request.options);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to start recording:', error);
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
    
    // Decide whether to use WASM or fallback to MediaRecorder
    if (isWebCodecsSupported && options.useWASM !== false) {
      await startWASMRecording(stream, options);
    } else {
      await startMediaRecording(stream, options);
    }
    
    // Send notification that recording has started
    chrome.runtime.sendMessage({ 
      action: 'recordingStarted',
      method: isUsingWASM ? 'WASM' : 'MediaRecorder'
    });
    
    // Listen for stream end
    stream.getVideoTracks()[0].onended = async () => {
      console.log('Stream ended by user');
      await stopRecording();
      chrome.runtime.sendMessage({ action: 'recordingStopped' });
    };
    
  } catch (error) {
    console.error('Error starting recording:', error);
    cleanup();
    throw error;
  }
}

async function startWASMRecording(stream, options) {
  try {
    isUsingWASM = true;
    console.log('Starting WASM-based recording');
    
    // Dynamically import WASM encoder
    const { WASMVideoEncoder } = await import('./wasm-encoder.js');
    const { WebMWriter } = await import('./webm-writer.js');
    
    // Initialize WASM encoder
    wasmEncoder = new WASMVideoEncoder({
      width: options.width || 1920,
      height: options.height || 1080,
      bitrate: getBitrateForQuality(options.quality),
      framerate: options.framerate || 30,
      audio: options.audio
    });
    
    await wasmEncoder.initialize();
    
    // Initialize WebM writer
    webmWriter = new WebMWriter();
    
    // Generate WebM header
    const videoConfig = {
      width: options.width || 1920,
      height: options.height || 1080
    };
    
    const audioConfig = options.audio ? {
      sampleRate: 48000,
      numberOfChannels: 2
    } : null;
    
    const header = webmWriter.generateHeader(videoConfig, audioConfig);
    wasmEncoder.streamWriter.writeChunk('header', header, {});
    
    startTime = performance.now();
    
    // Start encoding
    const videoStream = new MediaStream([stream.getVideoTracks()[0]]);
    const audioStream = options.audio && stream.getAudioTracks().length > 0 
      ? new MediaStream([stream.getAudioTracks()[0]]) 
      : null;
    
    await wasmEncoder.startEncoding(videoStream, audioStream);
    
  } catch (error) {
    console.error('WASM recording failed, falling back to MediaRecorder:', error);
    isUsingWASM = false;
    // Fallback to MediaRecorder
    await startMediaRecording(stream, options);
  }
}

async function startMediaRecording(stream, options) {
  isUsingWASM = false;
  console.log('Starting MediaRecorder-based recording');
  
  // Configure MediaRecorder options
  const recorderOptions = {
    mimeType: 'video/webm;codecs=vp9,opus'
  };
  
  // Check if the preferred mimeType is supported
  if (!MediaRecorder.isTypeSupported(recorderOptions.mimeType)) {
    console.log('VP9 codec not supported, falling back to default WebM');
    recorderOptions.mimeType = 'video/webm';
  }
  
  // Add bitrate based on quality setting
  const bitrate = getBitrateForQuality(options.quality);
  if (bitrate) {
    recorderOptions.videoBitsPerSecond = bitrate;
  }
  
  // Create MediaRecorder instance
  mediaRecorder = new MediaRecorder(stream, recorderOptions);
  
  // Collect recorded chunks
  const recordedChunks = [];
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };
  
  mediaRecorder.onstop = async () => {
    console.log('MediaRecorder stopped');
    
    // Create blob from chunks
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    
    // Convert to base64 for transfer
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result;
      chrome.runtime.sendMessage({
        action: 'saveRecording',
        data: base64data
      });
    };
    reader.readAsDataURL(blob);
  };
  
  // Start recording with timeslice for better memory management
  const timeslice = options.quality === 'high' ? 1000 : 100; // 1s for high quality, 100ms otherwise
  mediaRecorder.start(timeslice);
}

async function stopRecording() {
  console.log('Stopping recording...');
  
  try {
    if (isUsingWASM && wasmEncoder) {
      // Stop WASM encoder
      const result = await wasmEncoder.stopEncoding();
      
      // Get the final WebM file
      const finalBlob = webmWriter ? webmWriter.finalize() : result;
      
      // Convert to base64 for transfer
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result);
        };
        reader.readAsDataURL(finalBlob);
      });
      
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Stop MediaRecorder
      return new Promise((resolve) => {
        mediaRecorder.onstop = async () => {
          // The onstop handler will send the data
          resolve({ success: true });
        };
        mediaRecorder.stop();
      });
    }
  } finally {
    cleanup();
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
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
  }
  
  // Clean up WASM encoder
  if (wasmEncoder) {
    wasmEncoder = null;
  }
  
  if (webmWriter) {
    webmWriter = null;
  }
  
  isUsingWASM = false;
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
console.log('Offscreen document with WASM support ready');