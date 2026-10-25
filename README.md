# XD Local — 本機切版工作台

使用 TypeScript 與原生 DOM 開發的輕量 Adobe XD 設計稿檢視／切版工具。繁體中文、圖層／預覽／屬性三欄介面。設計檔在瀏覽器本機解析，不需安裝 Adobe XD，不上傳雲端；匯出的網站不需要 React、Vue、jQuery、npm 或 CDN。

目前版本 **0.1.0**：可執行的第一版，並非涵蓋所有 XD 版本的完整格式相容實作。已使用 MIT 授權的真實 XD fixture 驗證；不支援的格式特性會顯示相容性提醒。

## 啟動

需求：Node.js 22.12 以上（本次開發環境為 24.19）。首次安裝開發套件需要網路，完成後工具與匯出結果均可離線使用。

```powershell
npm ci
npm run build
npm start
```

開啟 **http://127.0.0.1:4173**。建置後也可雙擊 `Start-XD-Local.cmd` 啟動；它不會自動控制瀏覽器。

開發模式：`npm run dev` → http://127.0.0.1:5173。服務僅綁定 127.0.0.1。若需要更換正式服務連接埠，設定環境變數 `XD_LOCAL_PORT`。

## 已實作功能

- **XD 匯入**：Web Worker 解析 ZIP／AGC，還原畫板、群組、矩形、四角圓角、圓形／橢圓、路徑、直線、文字、內嵌圖片、隱藏圖層、矩陣變形、漸層、基本剪裁與陰影。
- **檢視與量測**：縮放、符合視窗、拖曳平移、搜尋圖層、畫板切換、圖層樹選取、Ctrl／⌘／Shift 多選、兩個元素的水平與垂直間距，以及 Alt 懸停比較。
- **屬性與 CSS**：尺寸、座標、字型／字重／行高／字距、顏色、圓角、透明度、描邊、陰影及矩陣；一鍵複製 CSS 或色碼。
- **本機字型**：從文字屬性或相容性報告載入 WOFF2／WOFF／TTF／OTF，設定對應名稱與字重；字型隨工作檔、SVG 及網頁輸出保存，不需線上字型服務。
- **素材匯出**：單一圖層／群組／畫板、批次 ZIP、SVG 或 PNG 1×／2×／3×；可移除矩形及剪裁遮罩的圓角。所有操作不修改原始設計。
- **可視化互動**：Click（顯示切換／捲動／畫板導覽）、Hover（上浮／縮放／淡化）、Scroll 進場、Sticky、Fixed、Animation（淡入／上移／呼吸）。支援復原／重做及減少動態效果偏好。
- **網頁匯出**：每個畫板一個 HTML，獨立 CSS、原生 JS、素材與 design tokens。穩定類別名稱、可選語意標籤；Flex／Grid、間距、內距、手機單欄、左右約束及整板縮放。
- **工作檔**：IndexedDB 本機自動儲存，另存／開啟 `.xdlocal` 保存完整文件、互動與排版設定；不覆寫或寫回 `.xd`。
- **版本控制**：Git `main` 分階段提交，套件版本由 `package-lock.json` 固定。未設定遠端或推送任何服務。

## 建議操作流程

1. 拖入本機 `.xd`，或使用「開啟檔案」。上方可切換畫板，下方查看相容性提醒。
2. 在畫布或圖層樹選取元素；兩個元素同時選取即可查看間距。CSS 中的座標對應原始父圖層座標系；屬性上方尺寸為畫板座標中的外接框。
3. 在「互動」指定效果及目標，再切換「互動預覽」；手機／平板／桌面尺寸切換的是 iframe 的實際 viewport。
4. 在「排版」指定適合的群組 Flex／Grid 與子圖層約束。工具不會把重疊背景層自動猜成流式內容，請只對結構合適的群組啟用。
5. 多選素材後匯出 PNG／SVG；或匯出完整網頁 ZIP，解壓後直接開啟 `index.html`。
6. 使用「儲存工作檔」建立可攜式備份；清除瀏覽器資料、切換連接埠或無痕模式可能影響自動儲存。

快捷鍵：`Ctrl/⌘+O` 開啟、`Ctrl/⌘+S` 儲存、`Ctrl/⌘+Z` 復原、`Ctrl/⌘+Shift+Z` 重做、`+/-` 縮放、`0` 100%、`F` 符合視窗、空白鍵拖曳平移、`Esc` 取消選取。

## 精度與目前限制

- AGC 並非有完整公開規格的交換標準。目前真實 fixture 為 AGC 1.5.0；新版元件狀態／覆寫、複雜布林圖形、背景／物件模糊與部分特殊效果仍需擴充與更多樣本驗證。
- XD 通常不內嵌字型。請載入本機字型檔，或在系統安裝原稿字型；缺字型以 Arial／sans-serif 替代，字寬可能不同。定位式文字框的寬高仍是估算值；SVG 的原始分行與基線保留。文字測距因此可能有誤差。獨立 SVG 的內嵌字型支援依開啟它的軟體而異。
- 原始 XD 原型連線未匯入；使用本工具的互動面板重新設定。`syncRef` 目前僅基本主元件展開，會明確警告實例覆寫限制。
- 精準定位的文字以可編輯 SVG `text/tspan` 輸出；流式群組中的文字使用 HTML 與文字區段。複雜剪裁群組輸出為 SVG 素材，群組內部的個別互動不輸出，匯出 README 會列出提醒。
- 響應式需要指定版面語意。絕對定位維持原稿；整板縮放適合設計展示；Flex／Grid 適合後續維護。Sticky 需要可捲動且足夠高的父容器；帶 transform 的祖先會影響 Fixed 的定位基準。
- 去圓角可移除向量矩形與剪裁框圓角，不能補回已烘焙在 PNG/JPEG 中的缺失像素，也不會把任意圓形改為矩形。
- 匯入上限 128 MB、解壓後 384 MB、最多 50,000 圖層／100 層巢狀；PNG 限單邊 16,384 px 或 64 百萬像素。超大畫板可改用 SVG。
- 未加入完整繪圖、畫筆、路徑編輯或 XD 檔案寫回功能。

## 開發與驗證

```powershell
npm run check       # TypeScript + Vitest
npm run build       # 正式建置
npm run smoke       # 正式 bundle 的記憶體 DOM 啟動及互動驗證
npm run smoke:http  # 已啟動 npm start 時，驗證本機服務與靜態資源
npm run format      # 格式化原始碼
npm run format:check
```

測試涵蓋真實 `.xd`（1 畫板、41 群組、178 形狀、91 文字、12 圖片）、合成格式案例、矩陣／間距、損毀或惡意封裝、工作檔驗證、SVG 經 Sharp 的像素檢查、批次素材、HTML 資源連結、互動 runtime 與 Happy DOM 介面事件。

遵守本專案的全域偏好，**未使用瀏覽器／Windows UI 自動化**。Happy DOM 是記憶體內的 DOM 單元測試，Sharp 是命令列圖像渲染；這些驗證不等同實際瀏覽器的完整視覺驗收或 Canvas PNG 下載驗收。

需要重建檢查圖時：

```powershell
$env:VISUAL_QA='1'
npm test
```

輸出 `.cache/visual/`，不納入版控。

## 模組與文件

```text
src/core/       正規化文件模型、矩陣、工作檔驗證、歷史紀錄
src/parser/     ZIP 防護、AGC adapter、Worker 匯入
src/render/     共用 SVG renderer
src/export/     CSS、素材、HTML/CSS/JS、互動 runtime
src/ui/         原生 DOM 工作台、圖示
src/demo.ts     原創示範文件
scripts/       無第三方依賴的本機靜態服務
tests/         格式、像素、匯出與 DOM 整合測試
```

技術選型與第一方來源見 [XD 格式研究](docs/xd-format-research.md)，架構與擴充規則見 [架構說明](docs/architecture.md)。測試 XD 檔的來源與授權保留於 [fixture 說明](tests/fixtures/xd2svg/README.md)。
