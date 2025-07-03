/**
 * WebM writer using WASM for efficient streaming
 * Implements EBML structure for WebM container format
 */

class WebMWriter {
  constructor() {
    this.chunks = [];
    this.videoTrackNumber = 1;
    this.audioTrackNumber = 2;
    this.timecodeScale = 1000000; // 1ms in nanoseconds
    this.duration = 0;
    this.videoCodecId = 'V_VP9';
    this.audioCodecId = 'A_OPUS';
  }

  // EBML element construction helpers
  writeEBMLId(id) {
    const bytes = [];
    for (let i = id.length - 1; i >= 0; i--) {
      bytes.unshift(id.charCodeAt(i));
    }
    return new Uint8Array(bytes);
  }

  writeEBMLSize(size) {
    // Variable length integer encoding
    if (size < 127) {
      return new Uint8Array([size | 0x80]);
    }
    
    const bytes = [];
    let temp = size;
    while (temp > 0) {
      bytes.unshift(temp & 0xff);
      temp >>= 8;
    }
    
    const lengthByte = (0x80 >> (bytes.length - 1)) | bytes[0];
    bytes[0] = lengthByte;
    
    return new Uint8Array(bytes);
  }

  writeEBMLElement(id, data) {
    const idBytes = this.writeEBMLId(id);
    const sizeBytes = this.writeEBMLSize(data.length);
    
    const element = new Uint8Array(idBytes.length + sizeBytes.length + data.length);
    element.set(idBytes, 0);
    element.set(sizeBytes, idBytes.length);
    element.set(data, idBytes.length + sizeBytes.length);
    
    return element;
  }

  generateHeader(videoConfig, audioConfig) {
    // EBML Header
    const ebmlHeader = this.createEBMLHeader();
    
    // Segment
    const segmentInfo = this.createSegmentInfo();
    
    // Tracks
    const tracks = this.createTracks(videoConfig, audioConfig);
    
    // Combine all headers
    return this.combineArrays([ebmlHeader, segmentInfo, tracks]);
  }

  createEBMLHeader() {
    const docType = new TextEncoder().encode('webm');
    const docTypeVersion = new Uint8Array([1]);
    const docTypeReadVersion = new Uint8Array([1]);
    
    const header = this.combineArrays([
      this.writeEBMLElement('\x42\x86', docType),
      this.writeEBMLElement('\x42\xF7', docTypeVersion),
      this.writeEBMLElement('\x42\xF2', docTypeReadVersion)
    ]);
    
    return this.writeEBMLElement('\x1A\x45\xDF\xA3', header);
  }

  createSegmentInfo() {
    const timecodeScaleBytes = new Uint8Array(8);
    new DataView(timecodeScaleBytes.buffer).setBigUint64(0, BigInt(this.timecodeScale));
    
    const muxingApp = new TextEncoder().encode('Chrome Extension WASM Recorder');
    const writingApp = new TextEncoder().encode('WebM Writer 1.0');
    
    const info = this.combineArrays([
      this.writeEBMLElement('\x2A\xD7\xB1', timecodeScaleBytes),
      this.writeEBMLElement('\x4D\x80', muxingApp),
      this.writeEBMLElement('\x57\x41', writingApp)
    ]);
    
    return this.writeEBMLElement('\x15\x49\xA9\x66', info);
  }

  createTracks(videoConfig, audioConfig) {
    const tracks = [];
    
    // Video track
    if (videoConfig) {
      const videoTrack = this.createVideoTrack(videoConfig);
      tracks.push(this.writeEBMLElement('\xAE', videoTrack));
    }
    
    // Audio track
    if (audioConfig) {
      const audioTrack = this.createAudioTrack(audioConfig);
      tracks.push(this.writeEBMLElement('\xAE', audioTrack));
    }
    
    return this.writeEBMLElement('\x16\x54\xAE\x6B', this.combineArrays(tracks));
  }

  createVideoTrack(config) {
    const trackNumber = new Uint8Array([this.videoTrackNumber]);
    const trackUID = new Uint8Array([this.videoTrackNumber]);
    const trackType = new Uint8Array([1]); // Video
    const codecID = new TextEncoder().encode(this.videoCodecId);
    
    // Video specific
    const pixelWidth = new Uint8Array(2);
    new DataView(pixelWidth.buffer).setUint16(0, config.width);
    
    const pixelHeight = new Uint8Array(2);
    new DataView(pixelHeight.buffer).setUint16(0, config.height);
    
    const video = this.combineArrays([
      this.writeEBMLElement('\xB0', pixelWidth),
      this.writeEBMLElement('\xBA', pixelHeight)
    ]);
    
    return this.combineArrays([
      this.writeEBMLElement('\xD7', trackNumber),
      this.writeEBMLElement('\x73\xC5', trackUID),
      this.writeEBMLElement('\x83', trackType),
      this.writeEBMLElement('\x86', codecID),
      this.writeEBMLElement('\xE0', video)
    ]);
  }

  createAudioTrack(config) {
    const trackNumber = new Uint8Array([this.audioTrackNumber]);
    const trackUID = new Uint8Array([this.audioTrackNumber]);
    const trackType = new Uint8Array([2]); // Audio
    const codecID = new TextEncoder().encode(this.audioCodecId);
    
    // Audio specific
    const samplingFrequency = new Uint8Array(4);
    new DataView(samplingFrequency.buffer).setFloat32(0, config.sampleRate);
    
    const channels = new Uint8Array([config.numberOfChannels]);
    
    const audio = this.combineArrays([
      this.writeEBMLElement('\xB5', samplingFrequency),
      this.writeEBMLElement('\x9F', channels)
    ]);
    
    return this.combineArrays([
      this.writeEBMLElement('\xD7', trackNumber),
      this.writeEBMLElement('\x73\xC5', trackUID),
      this.writeEBMLElement('\x83', trackType),
      this.writeEBMLElement('\x86', codecID),
      this.writeEBMLElement('\xE1', audio)
    ]);
  }

  addVideoFrame(chunk, timestamp) {
    const cluster = this.createCluster(timestamp);
    const simpleBlock = this.createSimpleBlock(
      this.videoTrackNumber,
      timestamp,
      chunk,
      chunk.type === 'key'
    );
    
    this.chunks.push(this.combineArrays([cluster, simpleBlock]));
  }

  addAudioFrame(chunk, timestamp) {
    const simpleBlock = this.createSimpleBlock(
      this.audioTrackNumber,
      timestamp,
      chunk,
      true
    );
    
    this.chunks.push(simpleBlock);
  }

  createCluster(timestamp) {
    const timecode = new Uint8Array(8);
    new DataView(timecode.buffer).setBigUint64(0, BigInt(Math.floor(timestamp)));
    
    return this.writeEBMLElement('\x1F\x43\xB6\x75', 
      this.writeEBMLElement('\xE7', timecode)
    );
  }

  createSimpleBlock(trackNumber, timestamp, data, keyframe) {
    const flags = keyframe ? 0x80 : 0x00;
    
    const blockHeader = new Uint8Array(4);
    blockHeader[0] = 0x80 | trackNumber;
    new DataView(blockHeader.buffer).setInt16(1, Math.floor(timestamp), false);
    blockHeader[3] = flags;
    
    const blockData = new Uint8Array(blockHeader.length + data.byteLength);
    blockData.set(blockHeader);
    blockData.set(new Uint8Array(data), blockHeader.length);
    
    return this.writeEBMLElement('\xA3', blockData);
  }

  combineArrays(arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return result;
  }

  finalize() {
    // Combine all chunks into final WebM file
    const allChunks = this.combineArrays(this.chunks);
    return new Blob([allChunks], { type: 'video/webm' });
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebMWriter };
}