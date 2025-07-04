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
      // FFmpeg.wasmはセキュリティ制限により外部CDNから読み込めません
      // 以下のいずれかの方法で対応してください：
      // 1. FFmpeg処理を無効にする（UIのチェックボックスで制御可能）
      // 2. FFmpeg.wasmファイルをローカルにダウンロードして配置
      // 詳細はREADME_FFMPEG_SETUP.mdを参照
      
      console.warn('FFmpeg.wasm is not loaded. Please see README_FFMPEG_SETUP.md for setup instructions.');
      throw new Error('FFmpeg.wasm not available. Please disable FFmpeg processing or set up local files.');
      
      // ローカルファイルを使用する場合の例：
      // await this.loadScript(chrome.runtime.getURL('ffmpeg.min.js'));
      // const { createFFmpeg } = window.FFmpeg;
      // this.ffmpeg = createFFmpeg({
      //   log: false,
      //   corePath: chrome.runtime.getURL('ffmpeg-core.js'),
      //   workerPath: chrome.runtime.getURL('ffmpeg-core.worker.js'),
      // });
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