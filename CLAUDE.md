# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

これはシンプルな画面録画用Chrome拡張機能です。PC画面、特定のウィンドウ、またはブラウザタブをWeb MediaDevices APIを使用して録画できます。

## アーキテクチャ

拡張機能の構成:

- `manifest.json`: Chrome拡張機能マニフェスト (v3) - 拡張機能のメタデータと権限を定義
- `popup.html`: 録画コントロール付きの拡張機能ポップアップUI（改善されたUI/UX）
- `popup.js`: アプリケーションのエントリーポイント、モジュールを初期化
- `recorder.js`: ScreenRecorderクラス - 録画ロジックのコア部分（MediaRecorder API）
- `ui-controller.js`: UIControllerクラス - UI状態管理とユーザーインタラクション処理
- `styles.css`: モダンなスタイリング（ダークモード対応）
- `icon.png`: 拡張機能アイコン
- `background.js`: サービスワーカー - 録画状態の永続化と通知管理
- `content-script.js`: 録画中インジケーター表示（黄色い枠）
- `settings.js`: 設定管理（chrome.storage.local使用）
- `download-manager.js`: 自動ダウンロード機能の管理
- `audio-feedback.js`: 音声フィードバック（録画開始/停止音）
- `offscreen.html` & `offscreen.js`: Offscreen APIを使用したバックグラウンド録画（ブラウザ最小化時も動作）

## 実装の詳細

### 画面録画のフロー

1. ユーザーがpopup.htmlの「録画開始」ボタンをクリック
2. UIController.handleStart()がScreenRecorder.startRecording()を呼び出す
3. バックグラウンドサービスがOffscreen documentを作成
4. Offscreen document内で`getDisplayMedia()`を呼び出し、画面/ウィンドウ/タブの選択を促す
5. MediaRecorderがビデオ/オーディオストリームをキャプチャ（ブラウザ最小化時も継続）
6. ユーザーが「録画停止」ボタンをクリックすると録画停止
7. 録画されたビデオはWebM形式で自動ダウンロードされる

### 重要なコードパターン

- クラスベースの設計でコードを構造化（ScreenRecorder、UIController）
- 包括的なエラーハンドリングとユーザーフィードバック
- 状態管理の改善（recording、ready、starting、stopping）
- 録画設定のカスタマイズ機能（画質、音声）
- リソースリークを防ぐ自動クリーンアップ機能
- ダークモード対応のモダンなUI
- バックグラウンドサービスワーカーによる状態永続化
- chrome.storage.localを使用した設定保存
- Offscreen APIを使用したブラウザ最小化時の録画継続

### 主な機能

- 画面全体、ウィンドウ、またはタブの録画
- 音声録音のON/OFF切り替え
- 画質選択（高/中/低）
- WebM形式での保存
- 自動ダウンロード機能
- ダウンロード先フォルダの指定（サブフォルダ）
- デスクトップ通知（録画中も最小化時に確認可能）
- 拡張機能アイコンバッジ（REC表示）
- 音声フィードバック（録画開始/停止音）
- 録画中インジケーター（ブラウザタブ録画時のみ赤い枠を表示）
  - 画面全体録画時：ボーダー表示なし（技術的制限）
  - ウィンドウ録画時：ボーダー表示なし（技術的制限）
  - ブラウザタブ録画時：対象タブに赤い枠を表示
- ブラウザ最小化時でも録画継続（Offscreen API使用）
- 自動ダウンロード（必須機能）

### ビルドコマンド

特にビルドは必要ありません。Chrome拡張機能として直接読み込むことができます。

## 開発コマンド

この拡張機能はビルドプロセスがないシンプルな構成です。テスト方法:

1. Chromeを開き `chrome://extensions/` にアクセス
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このディレクトリを選択
4. ツールバーにアイコン付きで拡張機能が表示される

## テスト

自動テストは設定されていません。手動テスト手順:

1. 拡張機能をアンパックで読み込む
2. 拡張機能アイコンをクリックしてポップアップを開く
3. 異なるキャプチャソースで録画機能をテスト
4. ブラウザ最小化時の通知確認
5. 自動ダウンロード機能のテスト
6. 設定の永続化確認

## 既知の制限事項

- Chrome拡張機能の制約により、ファイルエクスプローラーでフォルダを選択することはできません
- MP4への自動変換はブラウザ環境では利用できません（WebMのみサポート）
- 録画中にポップアップを閉じても録画は継続されます（バックグラウンド処理）
- Offscreen APIはChrome 109以降で利用可能

## Journaling workflow

You (the AI agent) have to report what you did in this project at each end of the task in my Inkdrop note.  
This must be done without fail.

### Note Management Priority (IMPORTANT)

**Always prioritize updating existing notes over creating new ones.**

1. **FIRST - Always search for existing logs**:

   - Use `inkdrop:search-notes` with query `book:Journal title:"Log:"`
   - Look for logs related to the current task/project
   - If found, UPDATE the existing note by appending new content

2. **Only create a new note when**:

   - No existing related log is found after searching
   - The task is completely unrelated to any existing logs
   - Technical issues prevent updating (after retry attempts)

3. **Update strategy**:

   - Append new log entries to the existing note
   - Add a timestamp separator between entries: `---\n### Update: <current timestamp (JST)>\n---`
   - When acquiring the date and time, please use the now command.
   - Keep all previous entries intact

4. **Do not change the status.**

5. **Include file operations summary**:

   - Add at the end of each log entry:

### Log Format

Update the note at each end of the task with the following format:

---

## Log: <task title>

- **Project**: <プロジェクト名>
- **Prompt**: <受け取った指示>
- **Issue**: <課題の内容>

### What I did / 実施内容:

<やったことの要約>

### How I did it / 実施方法:

<どのように対応・解決したか>

### Challenges / 課題・難しかった点:

<難しかった点や注意点>

### Failed attempts (if any) / 失敗した試み:

- <試行したがうまくいかなかった内容や、やらないと判断した理由など>

### Key code changes (if applicable) / 主要なコード変更:

```typescript
// Example of significant change
// Before: [brief description]
// After: [what was changed and why]
```

### Future work (optional) / 今後の課題:

- <次回改善・継続課題>

### List of files operated on / 操作したファイル:

- **Created**:
  - `path/to/file1.ts` - [brief description]
  - `path/to/file2.go` - [brief description]
- **Modified**:
  - `path/to/file3.tsx` - [what was changed]
  - `path/to/file4.go` - [what was changed]
- **Deleted**:
  - `path/to/old-file.js` - [reason for deletion]

### Related notes / 関連ノート（あればリンクを作成）:

（関連するノートがある場合のみ記載）

- [関連ノートタイトル](Note URL)
- 前回ログ: [ログタイトル](Note URL)

**例**:

- [API設計仕様書](inkdrop://note/abc123)
- [Log: ユーザー認証機能](inkdrop://note/def456)

---

### ⚠️ Error Handling (Only when update fails)

1. **Retry on error**:

   - Wait 2 seconds and retry the update
   - If still failing after 3 attempts, only then create a new note

2. **Version conflicts**:

   - Always fetch the latest version before updating
   - Merge your changes with the existing content
   - Never overwrite existing entries

3. **New note naming (last resort)**:
   - Format: `Log: <Job title> - Continued <timestamp>`
   - Include reference to the original log in the first line

### Remember: UPDATE FIRST, CREATE ONLY IF NECESSARY
