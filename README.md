# XD Local — 本機切版工作台

Windows EXE 桌面版的 Adobe XD 設計稿檢視／切版工具。使用 TypeScript、Electron 與原生 DOM，提供繁體中文三欄介面。雙擊 EXE 就能工作，不需要瀏覽器、localhost 服務、Node.js 或 Adobe XD；檔案在本機解析，不上傳雲端。只有匯出的 HTML 檢視器需要用瀏覽器開啟；匯出結果不依賴 React、Vue、jQuery、npm 或 CDN。

目前版本 **0.2.3 Desktop**。修正加入購物車／價格缺字與互動預覽資源載入，新增全畫板單頁預覽、全部畫板匯出、固定圖層及雙狀態 Toggle；內附離線 Noto Sans TC 並提示缺少的原稿字型。已用 17 畫板／96 張圖片及先前 22 畫板／55 張圖片的實際文件驗證。並非涵蓋所有 XD 版本，不支援的格式特性會顯示相容性提醒。

## 啟動

下載 [0.2.3 Release](https://github.com/xga00mex/xd_viewer/releases/tag/v0.2.3)，在 Assets 選擇 `XD-Local-0.2.3-Windows-x64.exe`；同頁提供 SHA-256 校驗碼與離線 HTML 檢視範例。

直接執行 `release/XD-Local-0.2.3-Windows-x64.exe`，或雙擊 `Start-XD-Local.cmd`。這是 Windows 10／11 x64 的可攜式程式，內含 Chromium 與 Node 執行環境，約 105 MiB；不另安裝執行環境。EXE 尚未使用發行者憑證簽章。

原始碼開發才需要 Node.js 22.12 以上（本次為 24.19）。首次下載開發與封裝套件需要網路，建置完成後可離線運作。

```powershell
npm ci
npm start         # 建置並開啟桌面 GUI
npm run dist:win  # 產生 Windows EXE
```

`npm run dev` 與 `npm run start:web` 僅保留作 renderer 開發診斷，並非使用者啟動方式。正式桌面程式讀取 EXE 內的資源，不開啟任何本機 HTTP 服務。

## 已實作功能

- **XD 匯入**：Web Worker 解析 ZIP／AGC，還原畫板、群組、矩形、四角圓角、圓形／橢圓、路徑、直線、文字、內嵌圖片、隱藏圖層、矩陣變形、漸層、基本剪裁與陰影。
- **檢視與量測**：縮放、符合視窗、左鍵直接拖曳捲動（單擊仍可選取）、搜尋圖層、畫板切換、圖層樹選取、Ctrl／⌘／Shift 多選、兩個元素的水平與垂直間距，以及 Alt 懸停比較。
- **屬性與 CSS**：尺寸、座標、字型／字重／行高／字距、顏色、圓角、透明度、描邊、陰影及矩陣；一鍵複製 CSS 或色碼。
- **本機字型**：從文字屬性或相容性報告載入 WOFF2／WOFF／TTF／OTF，設定對應名稱與字重；字型隨工作檔、SVG 及網頁輸出保存，不需線上字型服務。
- **素材匯出**：單一圖層／群組／畫板、批次 ZIP，或多選合併成單一 SVG／PNG，保留原稿相對位置、旋轉、透明度與遮罩；PNG 支援 1×／2×／3×；可移除矩形及剪裁遮罩的圓角。所有操作不修改原始設計。
- **可視化互動**：Click（顯示切換／捲動／畫板導覽）、Hover（上浮／縮放／淡化）、Scroll 進場、Sticky、Fixed、Animation（淡入／上移／呼吸）。支援復原／重做及減少動態效果偏好。
- **HTML 檢視匯出**：預設產生單一 HTML，內含所有畫板、素材、已載入字型及支援的互動；模擬 XD 網頁檢視的畫板導覽、返回、縮放、全螢幕、熱區提示與重新播放。保留原稿座標及實際捲動視窗，不套用響應式重排。
- **程式碼匯出**：可另選 HTML／CSS／JS 原始碼 ZIP，每個畫板一頁，獨立 CSS、原生 JS、素材與 design tokens。穩定類別名稱、可選語意標籤；Flex／Grid、間距、內距、手機單欄、左右約束及整板縮放。
- **工作檔**：原生開啟／儲存對話框；自動保存於 `%APPDATA%/XD Local/workspace.json`，關閉視窗前完成最後一次寫入。另存／開啟 `.xdlocal` 保存完整文件、互動與排版設定；不覆寫或寫回 `.xd`。
- **版本控制**：Git `main` 分階段提交，套件版本由 `package-lock.json` 固定；原始碼與可下載版本發布於 [GitHub](https://github.com/xga00mex/xd_viewer)。

## 建議操作流程

1. 拖入本機 `.xd`，或使用「開啟檔案」。上方可切換畫板，下方查看相容性提醒。
2. 在畫布或圖層樹選取元素；兩個元素同時選取即可查看間距。CSS 中的座標對應原始父圖層座標系；屬性上方尺寸為畫板座標中的外接框。
3. 點「全畫板」可在同一頁查看所有完整畫板；匯出用途選「全畫板單頁 HTML」可離線交付。在「互動」指定效果及目標，再切換「互動預覽」；手機／平板／桌面尺寸切換的是 iframe 的實際 viewport。
4. 在「排版」指定適合的群組 Flex／Grid 與子圖層約束。工具不會把重疊背景層自動猜成流式內容，請只對結構合適的群組啟用。
5. 匯出「設計素材」時可選「全部畫板」，逐板產生 SVG／PNG 並打包 ZIP；長畫板超過 PNG 上限時請選 SVG。Ctrl／⌘ 或 Shift 多選素材後匯出 PNG／SVG；勾選「合併成單一素材」可合成一個檔案，未勾選則個別打包 ZIP。交付設計稿時選「HTML 檢視」，接收者只要開啟該 HTML。需要修改程式碼時改選「HTML / CSS / JS 原始碼 ZIP」。
6. 使用「儲存工作檔」建立可攜式備份；自動工作階段是 Windows 使用者帳戶的資料，不會跟著 EXE 移動到另一台電腦。

快捷鍵：`Ctrl/⌘+O` 開啟、`Ctrl/⌘+S` 儲存、`Ctrl/⌘+Z` 復原、`Ctrl/⌘+Shift+Z` 重做、`+/-` 縮放、`0` 100%、`F` 符合視窗、左鍵按住拖曳捲動畫板（亦支援空白鍵／中鍵拖曳）、`Esc` 取消選取。

## 精度與目前限制

- AGC 並非有完整公開規格的交換標準。目前真實 fixture 為 AGC 1.5.0；新版元件狀態／覆寫、複雜布林圖形、背景／物件模糊與部分特殊效果仍需擴充與更多樣本驗證。
- XD 通常不內嵌字型。請載入本機字型檔，或在系統安裝原稿字型；保留 XD 指定字型，缺少時在相容性報告與通知提醒，並以內附 Noto Sans TC 替代，字寬可能不同。定位式文字框的寬高仍是估算值；SVG 的原始分行與基線保留。文字測距因此可能有誤差。獨立 SVG 的內嵌字型支援依開啟它的軟體而異。
- 已匯入 XD 的固定圖層與已儲存的雙狀態點擊 Toggle，預覽與 HTML 輸出保留狀態內容。多狀態、Hover 狀態、Auto-Animate 補間與其他原型連線仍需使用本工具互動面板設定。已支援 `resources.meta.ux.symbols`／`resources.symbols` 與 `syncSourceGuid` 的儲存實例覆寫；其他元件狀態仍有相容性限制，舊式 `ref` 展開仍提示相容性限制。
- 含自訂縮放／偏移的圖片裁切目前以置中填滿近似呈現，會列出可定位圖層的提醒。
- 精準定位的文字以可編輯 SVG `text/tspan` 輸出；流式群組中的文字使用 HTML 與文字區段。已支援的剪裁群組使用 SVG clipPath 與 HTML 子節點，保留子圖層互動；未支援的節點才退回 SVG，並列出提醒。
- 響應式需要指定版面語意。絕對定位維持原稿；整板縮放適合設計展示；Flex／Grid 適合後續維護。Sticky 需要可捲動且足夠高的父容器；帶 transform 的祖先會影響 Fixed 的定位基準。
- 去圓角可移除向量矩形與剪裁框圓角，不能補回已烘焙在 PNG/JPEG 中的缺失像素，也不會把任意圓形改為矩形。
- 匯入上限 128 MB、解壓後 384 MB、最多 50,000 個展開圖層／200,000 個儲存定義／100 層巢狀；PNG 限單邊 16,384 px 或 64 百萬像素。超大畫板可改用 SVG。
- 未加入完整繪圖、畫筆、路徑編輯或 XD 檔案寫回功能。

## 開發與驗證

```powershell
npm run check          # 桌面／前端 TypeScript + Vitest
npm run smoke          # 正式 bundle、原生橋接與單檔 HTML 的記憶體 DOM 驗證
npm run dist:win       # 封裝 EXE
npm run smoke:desktop  # 執行封裝 EXE 的無視窗診斷模式
npm run format      # 格式化原始碼
npm run format:check
```

可選擇用自己的 XD 檔執行完整匯入、圖片解碼、畫板渲染、工作檔往返及素材連結檢查，原稿不加入版控：

```powershell
$env:XD_TEST_FILE='E:\design\example.xd'
$env:VISUAL_QA='1'
npx vitest run tests/xd-file.test.ts
```

報告及各畫板檢查圖位於 `.cache/xd-verification/`。升級後請重新開啟原始 `.xd`；先前 `.xdlocal` 或自動工作階段保存的是舊版解析結果，不會自動重建。

測試涵蓋真實 `.xd`（1 畫板、41 群組、178 形狀、91 文字、12 圖片）、合成格式案例、矩陣／間距、損毀或惡意封裝、工作檔驗證、SVG 經 Sharp 的像素檢查、批次素材、HTML 資源連結、互動 runtime 與 Happy DOM 介面事件。

遵守本專案的全域偏好，**未使用瀏覽器／Windows UI 自動化**。Happy DOM 是記憶體內的 DOM 測試，Sharp 是命令列圖像渲染；EXE 的 `--self-test` 僅以 Electron API 驗證執行環境與資源，不建立視窗。這些驗證不等同實際 GUI／瀏覽器視覺驗收或 Canvas PNG 下載驗收。

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
src/platform/   桌面橋接介面
src/demo.ts     原創示範文件
desktop/       Electron 主程式、preload、本機檔案存取與安全邊界
scripts/       正式版驗證、封裝圖示與開發診斷
tests/         格式、像素、匯出與 DOM 整合測試
```

技術選型與第一方來源見 [XD 格式研究](docs/xd-format-research.md)，架構與擴充規則見 [架構說明](docs/architecture.md)，本次修正與驗證見 [v0.2.3 紀錄](docs/releases/v0.2.3.md)。測試 XD 檔的來源與授權保留於 [fixture 說明](tests/fixtures/xd2svg/README.md)。
