# v0.2 桌面版驗證紀錄

日期：2026-10-25。Windows x64、Electron 45.0.0、electron-builder 26.18.0。

- TypeScript：前端及 Electron 主程式／preload 檢查通過。
- Vitest：10 個檔案、41 項測試通過，包含原有真實 XD、幾何、像素、素材、互動、字型、UI 測試，以及桌面路徑隔離、IPC 來源、原生儲存取消、單檔 HTML 導覽、圖片／字型內嵌與資料逸出。
- 正式 bundle：在 Happy DOM 啟動 GUI 模組，操作屬性、原生儲存橋接，驗證關閉前保存 debounce 中的設定；直接執行匯出的壓縮 runtime、檢視器與 iframe 訊息橋接，確保沒有遺漏封裝依賴。
- EXE 診斷：執行 `--self-test`，使用 Electron `net.fetch` 驗證 app 專用 protocol、主頁、CSS／JS 與 preload 存在。報告要求 `packaged: true`，證明檢查的是封裝後的執行檔。
- 產物：`release/XD-Local-0.2.0-Windows-x64.exe`、`release/Demo-Review.html`、`release/desktop-verification.json` 與 SHA-256 紀錄。

依使用者偏好沒有採用任何 Windows／瀏覽器 UI 自動化。EXE 診斷不建立 BrowserWindow；DOM 驗證不啟動瀏覽器。未宣稱完成實際 GUI 視覺驗收、作業系統檔案對話框互動驗收或完整 XD 相容性驗收。

HTML 檢視保留目前已支援的圖層外觀與本工具設定的 Click、Hover、Scroll、Sticky、Fixed、Animation。原始 XD prototype 連線、Auto-Animate 與其他未解析特性仍屬限制，介面及 README 已明示。
