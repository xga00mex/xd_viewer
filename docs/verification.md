# v0.1 驗證紀錄

日期：2026-10-25。環境：Windows、Node.js 24.19.0、TypeScript 7.0.2、Vite 8.3.5。

## 結果

- `npm run check`：TypeScript 檢查通過；7 個 Vitest 測試檔，共 31 項測試通過。
- `npm run smoke`：正式壓縮 bundle 成功啟動；驗證範例 SVG、屬性／互動面板、預覽檔案生成，以及序列化後的獨立點擊 runtime。
- `npm run smoke:http`：HTML、CSS、JS、Worker 靜態檔可讀取；HEAD 正確，拒絕 POST、非本機 Host 與越界路徑。
- `npm run format:check` 與 `git diff --check`：格式與空白檢查。
- `npm audit --omit=dev`：正式相依套件未報告已知弱點。

## 實際檔案與圖像驗證

`tests/fixtures/xd2svg/single.xd`（附 MIT 授權及來源紀錄）解析為：

| 項目     |             數量 |
| -------- | ---------------: |
| 畫板     | 1（1920 × 6163） |
| 群組     |               41 |
| 形狀     |              178 |
| 文字     |               91 |
| 內嵌圖片 |               12 |

Sharp 可完整渲染真實 XD 與原創示範文件的 SVG。已目視檢查生成的 PNG，並對照 XD 內嵌 preview。測試另以 alpha 像素驗證圓角／去圓角及剪裁圖形，檢查群組內陰影的輸出邊界；不將缺字型造成的差異宣稱為像素完全一致。

測試也涵蓋：共享漸層／遮罩引用、文字基線、矩陣合成、間距、損毀／惡意封裝、工作檔 schema、重複 ID、HTML／CSS 逸出、同名素材批次 ZIP、Click／Scroll／鍵盤導覽、減少動態效果、Undo／Redo、本機字型打包、搜尋／選取與互動排版表單。

## 驗證邊界

遵守全域偏好，沒有啟動或控制任何實際瀏覽器、Windows 應用程式或 UI 自動化工具。Happy DOM 是記憶體內模型，Sharp 是 SVG rasterizer；尚未進行實際瀏覽器視覺驗收、Canvas PNG 下載驗收或大量新版 XD 檔案相容性測試。

已知限制與使用方式列於 README；格式研究與後續擴充點列於 `design-format-research.md` 和 `architecture.md`。
