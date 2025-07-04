# FFmpeg.wasm セットアップ手順

Chrome拡張機能のセキュリティポリシーにより、CDNからの直接読み込みができないため、FFmpeg.wasmファイルをローカルに配置する必要があります。

## セットアップ方法

### オプション1: 簡易版（FFmpeg処理なし）
デフォルトの状態では、FFmpeg処理は無効になっています。
ポップアップで「FFmpeg処理を有効にする」のチェックを外すことで、通常のMediaRecorder APIのみを使用します。

### オプション2: FFmpeg.wasmを手動でダウンロード（推奨）

1. 以下のファイルをダウンロード：
   - https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js
   - https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js
   - https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.wasm
   - https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.worker.js

2. ダウンロードしたファイルを拡張機能のルートディレクトリに配置

3. ffmpeg-processor.jsを更新して、ローカルファイルを参照するように変更

### オプション3: 軽量な代替実装
WebMメタデータの修正に特化した軽量なライブラリを使用することも検討できます。

## 注意事項

- FFmpeg.wasmは約30MBのサイズがあるため、拡張機能のサイズが大幅に増加します
- Chrome Web Storeの制限により、大きなファイルを含む拡張機能は審査に時間がかかる可能性があります
- FFmpeg処理を無効にしても、基本的な録画機能は問題なく動作します