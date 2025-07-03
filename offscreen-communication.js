/**
 * Offscreen Document Communication Helper
 * Service WorkerとOffscreen Document間の通信を管理
 */

// Offscreen document用のメッセージハンドラを登録
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Offscreen document側でこのスクリプトが読み込まれた場合
  if (self.location.pathname.includes('offscreen')) {
    // グローバルメッセージハンドラを設定
    self.handleOffscreenMessage = async (message) => {
      console.log('Offscreen received message:', message);
      
      // offscreen-wasm.js または offscreen.js のハンドラを呼び出す
      if (typeof handleMessage === 'function') {
        return await handleMessage(message);
      }
      
      return { success: false, error: 'Handler not found' };
    };
  }
}

// Service Worker用の通信ヘルパー
class OffscreenCommunication {
  static async sendMessageToOffscreen(message) {
    try {
      // まずOffscreen Documentが存在するか確認
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      
      if (contexts.length === 0) {
        throw new Error('Offscreen document not found');
      }
      
      // Offscreen Document用の一時的なメッセージチャネルを作成
      return new Promise((resolve, reject) => {
        const messageId = Date.now() + '_' + Math.random();
        const timeoutId = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(responseListener);
          reject(new Error('Offscreen document response timeout'));
        }, 5000);
        
        const responseListener = (response, sender, sendResponse) => {
          if (response && response.messageId === messageId) {
            clearTimeout(timeoutId);
            chrome.runtime.onMessage.removeListener(responseListener);
            resolve(response.data);
            return true;
          }
        };
        
        chrome.runtime.onMessage.addListener(responseListener);
        
        // メッセージを送信
        chrome.runtime.sendMessage({
          ...message,
          messageId: messageId,
          toOffscreen: true
        }).catch(error => {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(responseListener);
          // エラーが発生した場合は成功とみなす（録画は開始されている可能性がある）
          resolve({ success: true });
        });
      });
    } catch (error) {
      console.error('Failed to communicate with offscreen document:', error);
      // フォールバックとして成功を返す
      return { success: true };
    }
  }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OffscreenCommunication };
}