// FFmpeg.wasmを使用したWebMファイル処理

class FFmpegProcessor {
  constructor() {
    this.ffmpeg = null;
    this.isLoaded = false;
    this.loadPromise = null;
  }

  async init() {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;
    
    this.loadPromise = this._performInit();
    return this.loadPromise;
  }

  async _performInit() {
    try {
      // FFmpeg.wasmライブラリをCDNから読み込む
      // 注意: 実際の実装では、これらのファイルを拡張機能に含めることを推奨
      await this.loadScript('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js');
      
      // グローバル変数からFFmpegを取得
      const { createFFmpeg } = window.FFmpeg;
      
      this.ffmpeg = createFFmpeg({
        log: false,
        corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js',
        workerPath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/ffmpeg-core.worker.js',
      });
      
      await this.ffmpeg.load();
      this.isLoaded = true;
      console.log('FFmpeg.wasm loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg.wasm:', error);
      throw error;
    }
  }

  async loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async fixWebMTimestamps(inputBlob, progressCallback) {
    if (!this.isLoaded) {
      await this.init();
    }

    try {
      console.log('Processing WebM file...');
      
      // 進捗状況をコールバック
      if (progressCallback) {
        progressCallback('processing_started', 0);
      }
      
      // Blobをファイルとして書き込み
      const inputFileName = 'input.webm';
      const outputFileName = 'output.webm';
      
      // FFmpeg進捗ハンドラを設定
      if (progressCallback) {
        this.ffmpeg.setProgress(({ ratio }) => {
          const percentage = Math.round(ratio * 100);
          progressCallback('processing_progress', percentage);
        });
      }
      
      // FFmpeg.wasmのファイルシステムにデータを書き込み
      this.ffmpeg.FS('writeFile', inputFileName, await this.fetchFile(inputBlob));
      
      // FFmpegコマンドを実行（-c copyで再多重化のみ実行）
      await this.ffmpeg.run(
        '-i', inputFileName,
        '-c', 'copy',
        '-fflags', '+genpts',
        outputFileName
      );
      
      // 処理済みファイルを読み込み
      const data = this.ffmpeg.FS('readFile', outputFileName);
      
      // クリーンアップ
      this.ffmpeg.FS('unlink', inputFileName);
      this.ffmpeg.FS('unlink', outputFileName);
      
      // 新しいBlobを作成
      const fixedBlob = new Blob([data.buffer], { type: 'video/webm' });
      console.log('WebM processing completed');
      
      if (progressCallback) {
        progressCallback('processing_complete', 100);
      }
      
      return fixedBlob;
    } catch (error) {
      console.error('FFmpeg processing error:', error);
      if (progressCallback) {
        progressCallback('processing_error', 0);
      }
      throw error;
    }
  }

  async fetchFile(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // 進捗状況を監視するためのメソッド
  setProgressCallback(callback) {
    if (this.ffmpeg) {
      this.ffmpeg.setProgress(callback);
    }
  }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FFmpegProcessor;
}