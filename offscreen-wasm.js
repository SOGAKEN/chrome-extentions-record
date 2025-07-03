/**
 * WASM-based offscreen document for high-performance recording
 * Uses WebCodecs API for optimal performance and memory efficiency
 */

let stream = null;
let wasmEncoder = null;
let webmWriter = null;
let startTime = 0;

// Check if WebCodecs API is available
if (!('VideoEncoder' in self && 'AudioEncoder' in self)) {
  console.error('WebCodecs API is not supported in this browser. Chrome 94+ is required.');
}

// URLパラメータから設定を取得
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('autoStart') === 'true';
const audioOption = urlParams.get('audio') === 'true';

// 自動開始が有効な場合は録画を開始
if (autoStart) {
  console.log('Auto-starting WASM recording with options:', { audio: audioOption });
  startRecording({ audio: audioOption }).then(result => {
    if (!result.success) {
      console.error('Auto-start failed:', result.error);
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action);
  
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
    
    // Always use WASM recording
    await startWASMRecording(stream, options);
    
    // Send notification that recording has started
    chrome.runtime.sendMessage({ 
      action: 'recordingStarted',
      method: 'WASM'
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

async function startWASMRecording(stream, options) {
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
}

async function stopRecording() {
  console.log('Stopping recording...');
  
  try {
    if (wasmEncoder) {
      // Stop WASM encoder
      const result = await wasmEncoder.stopEncoding();
      
      // Get the final WebM file
      const finalBlob = webmWriter ? webmWriter.finalize() : result;
      
      // Convert to base64 for transfer
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // Send the recording to background for download
          chrome.runtime.sendMessage({
            action: 'saveRecording',
            data: reader.result
          });
          resolve(reader.result);
        };
        reader.readAsDataURL(finalBlob);
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
  
  // Clean up WASM encoder
  if (wasmEncoder) {
    wasmEncoder = null;
  }
  
  if (webmWriter) {
    webmWriter = null;
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
console.log('WASM offscreen document ready');