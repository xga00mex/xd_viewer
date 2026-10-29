# 架構與擴充

## 資料流

`File → Worker → ZIP entries → AGC adapter → DesignDocument → Project → SVG / HTML / assets`

`DesignDocument` 僅描述原設計；`Project.interactions` 與 `Project.layouts` 是依節點 ID 索引的附加設定。互動編輯、響應式排版與素材去圓角均不修改設計原稿，因此可以隨時回到精準預覽。

## 座標不變條件

- `bounds` 位於圖層本身的座標空間；`transform` 是相對父圖層的 affine matrix。
- 群組 bounds 由子圖層的變形後 bounds 聯集產生。剪裁群組使用剪裁框邊界。
- 畫板在文件中的外部偏移不參與畫板內部渲染；每個畫板原點歸零。直屬子圖層優先使用 `meta.ux.localTransform`，缺少時從 transform 扣除畫板 metadata 的 x/y；巢狀子圖層維持父層座標，不重複扣除。
- `worldBounds` 遞迴乘矩陣，用於量測與選取，不能只累加 tx/ty。
- 匯出 HTML 將 bounds 的原點吸收到 wrapper 的 left/top；保留 a/b/c/d 變形及 transform-origin 0 0。
- SVG 剪裁幾何必須直接放在 clipPath 下；群組轉換需先合成，避免 `<g>` 導致剪裁內容消失。
- 文字的 AGC line.x/y 是基線，不是字框左上角。精準預覽保留 tspans；寬高缺失時明確標示估算。
- 同一 AGC 行中的樣式片段若省略 x，應接續前一片段。連續文字範圍與相同基線合併成一條定位行，透過 rangedStyles 保留字型／顏色；明確的 x/y 與實際換行各自保留。

## 邊界與防護

- `parser/design.ts` 是唯一允許動態 AGC wire shape 的區域。新增格式支援應在 adapter 正規化，不能把 raw AGC 欄位散落到 UI。
- 元件來源先索引 shared symbols（包括 `resources.meta.ux.symbols`）、狀態及複合圖形的編輯子圖層，再索引畫板。`syncSourceGuid` 以來源 ID 展開，`guid` 作為實例 ID；物件欄位遞迴繼承，陣列使用已儲存的實例內容。保留循環／深度／數量限制。複合圖形僅繪製已保存的結果路徑，編輯用 operands 不另行繪製。
- 封裝先檢查數量、大小與路徑；只讀 ZIP 內的資源，不存取 pattern.href 的外部網址或本機路徑。
- 圖片以封裝內完整資源路徑作為 ID，UID／manifest ID／檔名為別名。只在別名唯一時解析；優先 UID，失效時可改查 href 對應的封裝資源。所有來源仍限於已解壓的封裝內容。
- 工作檔透過 Zod 驗證，限定數值、列舉、顏色與內嵌點陣圖格式；禁止任意 HTML、JS、CSS 與外部 URL。
- 圖層名稱、文字與屬性均使用對應的 HTML/XML/CSS escaping；輸出類別固定加英文字首，不能讓數字開頭的圖層名變成無效 selector。
- 互動只接受預先定義的行為，沒有自訂程式碼輸入。預覽 iframe 僅允許 scripts，沒有 same-origin；父層僅接受目前 iframe 發出的已知畫板導覽訊息。
- 桌面版透過受限 IPC 將工作檔原子寫入使用者資料目錄；瀏覽器開發模式才使用 IndexedDB。50 步 undo/redo 保存設定與不可變畫板樹參照，不重複複製大型內嵌圖像。
- 可選的 `DesignDocument.fonts` 保存使用者載入的字型。FontRegistry 管理字型載入與文件切換時的釋放；內附 Noto Sans TC 100–900 WOFF2 作為離線備援，原稿字型保持第一順位。透過跨 generic 字型的字寬比較偵測缺字型，通知與相容性報告列出名稱；HTML 輸出字型只打包一次，獨立 SVG 僅嵌入其文字使用的字型。字型載入／移除是文件資源操作，不列入互動設定的 undo/redo。

元件定義索引上限為 200,000，展開場景仍限制為 50,000 圖層。`interactions/interactions.json` 與節點的 interaction GUID 對應已儲存的雙狀態 tap 切換，`component` 保存備選節點，`stateTarget` 保存觸發目標；多狀態／Hover／Auto-Animate 不猜測近似效果。工作檔 schema 驗證備選節點的深度、數量與 ID，舊工作檔無須遷移。

`fixed` 保留原稿的捲動行為，不能改變圖層順序。固定背景與固定控制項都按原稿順序繪製；HTML 匯出不為原稿 fixed 圖層強制指定 z-index。HTML 輸出僅在固定祖先之外套用 fixed，避免 nested fixed 重複定位。離線 HTML 總覽將固定圖層轉為各板內 absolute。

工作台的全畫板模式直接在主文件建立等尺寸、可點選的畫板縮圖卡片及共用 SVG，使用全域 FontRegistry，不使用 iframe、srcdoc 或互動頁面腳本。IntersectionObserver 以總覽捲動容器為 root，提前 400px 載入 SVG，離開模式或銷毀工作台時釋放 observer 與 DOM；缺少該 API 時直接顯示所有畫板。

## 渲染與輸出

`render/svg.ts` 共用於設計稿、SVG 素材、Canvas PNG 與 HTML 的向量部分。圖層位置／畫板位置、描邊對齊及透明度不能在各輸出端重複套用。

合併素材從同一畫板的場景樹保留選取分支，維持繪製順序及祖先矩陣、群組透明度與剪裁；未選取畫板時不輸出畫板背景。選取群組已包含的後代只繪製一次，輸出範圍依保留內容的可見邊界計算。個別 ZIP 與合併 SVG／PNG 共用原本的素材編碼路徑。

HTML 匯出以原生節點、獨立 stylesheet 與資源目錄為主。矩形保留 CSS、向量與定位文字保留 SVG、流式文字使用 HTML。剪裁群組用零尺寸 SVG 定義 clipPath，再套到 HTML 容器，保留子元素的互動與語意。

預覽使用 `exportWeb` 的同一組輸出，將圖片、字型與 CSS 內嵌為 Blob HTML，再讓 iframe 導覽至該文件；互動腳本由 Vite 的獨立 preview-entry 產物透過 app URL 載入，不在 opaque-origin 沙箱中讀取 Blob 子資源；切換前釋放舊 URL，且移除 srcdoc 屬性，避免空 srcdoc 覆蓋 src。預覽 runtime 以識別碼回報就緒，父頁只接受目前 iframe 與目前預覽的訊息。只允許 scripts，維持父層 DOM 與 IPC 隔離。`interactionRuntime` 必須保持獨立函式，所有依賴都放在函式內，因為它會序列化為匯出的獨立 JS。

## Windows 桌面與 HTML 檢視

Electron 主程式載入封裝內的 `xv://app/index.html`，不提供 localhost HTTP 服務。renderer 採 `sandbox`、`contextIsolation`，停用 Node 整合；preload 只公開開啟選檔、儲存檔案、工作階段讀寫及選單事件。每次 IPC 驗證來源必須是主視窗的主 frame 及固定 app URL，沙箱預覽不能存取桌面檔案。網路 HTTP(S)／WebSocket、外部導覽與新視窗預設拒絕。

工作階段由主程式序列寫入暫存檔後原子更名。關閉視窗時先要求 renderer 提交尚未完成的變更，成功才結束；存檔失敗留在視窗並顯示錯誤。

`exportViewer` 重用 `exportWeb`，強制保留原始座標，把圖片、SVG、字型、CSS 及原生互動程式全部內嵌為單一 HTML。外層提供 XD 類似的導覽與縮放；內層沙箱 iframe 使用畫板 viewportHeight，保留真實捲動／sticky／fixed 語意。畫板連結由受限 postMessage 切換內嵌頁面，不離開檢視器。`viewerRuntime`、`viewerPageBridge` 都必須是沒有外部依賴的獨立函式，正式壓縮 bundle 測試會驗證這個限制。

Electron 的選擇讓 EXE 內含固定版本的渲染環境，且能沿用 TypeScript 解析／輸出模組；代價是檔案約 105 MiB。程式的 renderer 使用 HTML/CSS 是內部實作，使用者的操作入口仍是 Windows GUI。原始 XD 原型連線、Auto-Animate、覆寫等未知格式並未因桌面包裝自動取得支援；仍須依合法樣本逐項補齊。

桌面安全邊界依據 [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)、[context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 與 [protocol API](https://www.electronjs.org/docs/latest/api/protocol)；Windows 可攜式封裝依據 [electron-builder portable](https://www.electron.build/nsis#portable)。

## 加入新格式支援的流程

1. 保存合法且可追溯的小型 fixture，記錄來源與授權。
2. 在研究文件記錄實際欄位與可驗證範圍。
3. 擴充 `core/model.ts` 與工作檔 schema，必要時提升工作檔版本並加入 migration。
4. 在 AGC adapter 正規化；不支援情況產生可定位圖層的 diagnostic。
5. 同時驗證 SVG 預覽、素材輸出與 HTML 輸出。
6. 幾何、遮罩、陰影等改動應加入像素或幾何測試，而非只檢查輸出字串是否存在。

## 後續重點

- 使用更多新舊 XD 真實樣本覆蓋元件／覆寫、repeat grid、布林圖形與模糊效果。
- 在提供字型的情況下以文字量測改善 positioned text 的外接框。
- 增加響應式約束種類與可編輯語意結構，維持原稿精準預覽不變。
- 在使用者允許的環境執行實際瀏覽器視覺驗收與 Canvas 匯出測試。
