/**
 * WebMファイルのduration（再生時間）を修正する軽量ライブラリ
 * FFmpegを使わずに、WebMのメタデータを直接操作します
 */

class WebMDurationFix {
  constructor() {
    this.clusters = [];
    this.CLUSTER_ID = [0x1F, 0x43, 0xB6, 0x75];
    this.TIMECODE_ID = [0xE7];
    this.DURATION_ID = [0x44, 0x89];
  }

  /**
   * WebMファイルのdurationを修正
   * @param {Blob} blob - 元のWebMファイル
   * @param {number} duration - 録画時間（ミリ秒）
   * @returns {Promise<Blob>} - 修正されたWebMファイル
   */
  async fixDuration(blob, duration) {
    try {
      const buffer = await blob.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      // EBMLヘッダーとSegmentを探す
      let offset = 0;
      const segmentOffset = this.findSegment(data);
      if (segmentOffset === -1) {
        console.warn('Segment not found, returning original file');
        return blob;
      }

      // Segment Info内のDurationフィールドを探して更新
      const infoOffset = this.findSegmentInfo(data, segmentOffset);
      if (infoOffset === -1) {
        // Segment Infoがない場合は挿入
        return this.insertDuration(data, segmentOffset, duration);
      }

      // 既存のDurationを更新
      return this.updateDuration(data, infoOffset, duration);
    } catch (error) {
      console.error('Failed to fix WebM duration:', error);
      return blob; // エラー時は元のファイルを返す
    }
  }

  /**
   * Segmentを探す
   */
  findSegment(data) {
    const SEGMENT_ID = [0x18, 0x53, 0x80, 0x67];
    for (let i = 0; i < data.length - 4; i++) {
      if (this.compareBytes(data, i, SEGMENT_ID)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Segment Infoを探す
   */
  findSegmentInfo(data, startOffset) {
    const INFO_ID = [0x15, 0x49, 0xA9, 0x66];
    for (let i = startOffset; i < Math.min(startOffset + 5000, data.length - 4); i++) {
      if (this.compareBytes(data, i, INFO_ID)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Durationフィールドを更新
   */
  updateDuration(data, infoOffset, duration) {
    // Durationフィールドを探す
    let offset = infoOffset + 4;
    const infoSize = this.readVarInt(data, offset);
    offset += infoSize.bytesRead;
    
    const endOffset = offset + infoSize.value;
    
    while (offset < endOffset) {
      if (this.compareBytes(data, offset, this.DURATION_ID)) {
        // Duration見つかった
        offset += this.DURATION_ID.length;
        
        // 8バイトのfloat64として書き込む
        const durationBytes = new ArrayBuffer(8);
        const view = new DataView(durationBytes);
        view.setFloat64(0, duration, false); // big-endian
        
        const newData = new Uint8Array(data.length);
        newData.set(data.slice(0, offset + 1), 0);
        newData.set(new Uint8Array(durationBytes), offset + 1);
        newData.set(data.slice(offset + 9), offset + 9);
        
        return new Blob([newData], { type: 'video/webm' });
      }
      
      // 次の要素へ
      const elementSize = this.readVarInt(data, offset + 2);
      offset += 2 + elementSize.bytesRead + elementSize.value;
    }
    
    // Durationが見つからなかった場合は挿入
    return this.insertDurationInInfo(data, infoOffset, duration);
  }

  /**
   * Durationフィールドを挿入
   */
  insertDurationInInfo(data, infoOffset, duration) {
    // Duration要素を作成（ID + サイズ + 値）
    const durationElement = new Uint8Array(11);
    durationElement.set(this.DURATION_ID, 0);
    durationElement[2] = 0x88; // サイズ: 8バイト
    
    const durationBytes = new ArrayBuffer(8);
    const view = new DataView(durationBytes);
    view.setFloat64(0, duration, false);
    durationElement.set(new Uint8Array(durationBytes), 3);
    
    // Infoセクションのサイズを更新
    let offset = infoOffset + 4;
    const infoSize = this.readVarInt(data, offset);
    const newInfoSize = infoSize.value + durationElement.length;
    
    // 新しいデータを作成
    const newData = new Uint8Array(data.length + durationElement.length);
    newData.set(data.slice(0, offset), 0);
    
    // 新しいサイズを書き込む
    const newSizeBytes = this.encodeVarInt(newInfoSize);
    newData.set(newSizeBytes, offset);
    
    // 既存のInfoデータ
    const infoDataStart = offset + infoSize.bytesRead;
    newData.set(data.slice(infoDataStart, infoDataStart + 16), offset + newSizeBytes.length);
    
    // Duration要素を挿入
    newData.set(durationElement, offset + newSizeBytes.length + 16);
    
    // 残りのデータ
    newData.set(data.slice(infoDataStart + 16), offset + newSizeBytes.length + 16 + durationElement.length);
    
    return new Blob([newData], { type: 'video/webm' });
  }

  /**
   * バイト配列の比較
   */
  compareBytes(data, offset, pattern) {
    for (let i = 0; i < pattern.length; i++) {
      if (data[offset + i] !== pattern[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * 可変長整数を読み込む
   */
  readVarInt(data, offset) {
    let value = 0;
    let bytesRead = 0;
    
    const firstByte = data[offset];
    let mask = 0x80;
    let idLength = 1;
    
    while ((firstByte & mask) === 0) {
      mask >>= 1;
      idLength++;
    }
    
    value = firstByte & ~mask;
    for (let i = 1; i < idLength; i++) {
      value = (value << 8) | data[offset + i];
    }
    
    return { value, bytesRead: idLength };
  }

  /**
   * 可変長整数をエンコード
   */
  encodeVarInt(value) {
    if (value < 0x7F) {
      return new Uint8Array([value | 0x80]);
    } else if (value < 0x3FFF) {
      return new Uint8Array([
        (value >> 8) | 0x40,
        value & 0xFF
      ]);
    } else if (value < 0x1FFFFF) {
      return new Uint8Array([
        (value >> 16) | 0x20,
        (value >> 8) & 0xFF,
        value & 0xFF
      ]);
    } else {
      return new Uint8Array([
        (value >> 24) | 0x10,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF
      ]);
    }
  }

  /**
   * 簡易的な修正方法：録画時間をファイル名に含める
   */
  static addDurationToFileName(fileName, durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const timeStr = hours > 0 
      ? `${hours}h${minutes % 60}m${seconds % 60}s`
      : minutes > 0
      ? `${minutes}m${seconds % 60}s`
      : `${seconds}s`;
    
    // ファイル名に時間を追加
    const baseName = fileName.replace(/\.webm$/, '');
    return `${baseName}_${timeStr}.webm`;
  }
}