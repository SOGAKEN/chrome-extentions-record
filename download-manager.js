class DownloadManager {
  constructor(settings) {
    this.settings = settings;
  }
  
  async downloadVideo(blob, filename, options = {}) {
    const {
      downloadPath = this.settings.get('downloadPath'),
      format = blob.type.includes('mp4') ? 'mp4' : 'webm'
    } = options;
    
    try {
      // ファイル名を生成
      const finalFilename = this.generateFilename(filename, format);
      
      // Blob URLを作成
      const url = URL.createObjectURL(blob);
      
      // ダウンロードオプション
      const downloadOptions = {
        url: url,
        filename: downloadPath ? `${downloadPath}/${finalFilename}` : finalFilename,
        saveAs: false, // 自動ダウンロードの場合は保存ダイアログを表示しない
        conflictAction: 'uniquify' // 同名ファイルがある場合は番号を付ける
      };
      
      // Chrome Downloads APIを使用してダウンロード
      return new Promise((resolve) => {
        chrome.downloads.download(downloadOptions, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('ダウンロードエラー:', chrome.runtime.lastError);
            resolve({ 
              success: false, 
              error: chrome.runtime.lastError.message 
            });
            return;
          }
          
          // ダウンロードの進行状況を監視
          this.monitorDownload(downloadId, url).then(result => {
            resolve(result);
          });
        });
      });
    } catch (error) {
      console.error('ダウンロード処理エラー:', error);
      return { success: false, error: error.message };
    }
  }
  
  async monitorDownload(downloadId, blobUrl) {
    return new Promise((resolve) => {
      const checkDownload = () => {
        chrome.downloads.search({ id: downloadId }, (results) => {
          if (results.length === 0) {
            resolve({ success: false, error: 'ダウンロードが見つかりません' });
            return;
          }
          
          const download = results[0];
          
          if (download.state === 'complete') {
            // Blob URLをクリーンアップ
            URL.revokeObjectURL(blobUrl);
            
            resolve({ 
              success: true, 
              filename: download.filename,
              fileSize: download.fileSize,
              path: download.filename
            });
          } else if (download.state === 'interrupted') {
            URL.revokeObjectURL(blobUrl);
            resolve({ 
              success: false, 
              error: download.error || 'ダウンロードが中断されました' 
            });
          } else {
            // まだダウンロード中の場合は再チェック
            setTimeout(checkDownload, 100);
          }
        });
      };
      
      checkDownload();
    });
  }
  
  generateFilename(baseFilename, format) {
    // 拡張子を確認して必要に応じて追加
    const extension = `.${format}`;
    if (!baseFilename.endsWith(extension)) {
      // 既存の拡張子を置き換え
      return baseFilename.replace(/\.[^/.]+$/, '') + extension;
    }
    return baseFilename;
  }
  
  async openDownloadFolder() {
    try {
      // 最新のダウンロードを取得
      chrome.downloads.search({ 
        limit: 1, 
        orderBy: ['-startTime'] 
      }, (results) => {
        if (results.length > 0) {
          // ダウンロードフォルダを開く
          chrome.downloads.show(results[0].id);
        } else {
          // ダウンロード履歴がない場合は、ダウンロードページを開く
          chrome.tabs.create({ url: 'chrome://downloads/' });
        }
      });
    } catch (error) {
      console.error('ダウンロードフォルダを開けません:', error);
      // エラーの場合もダウンロードページを開く
      chrome.tabs.create({ url: 'chrome://downloads/' });
    }
  }
  
  async setDownloadPath(path) {
    // Chrome拡張機能では直接ダウンロードパスを変更できないため、
    // サブフォルダとして保存する
    await this.settings.save({ downloadPath: path });
  }
}

export default DownloadManager;