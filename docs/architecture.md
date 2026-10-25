# 架構與擴充

## 資料流

`File → Worker → ZIP entries → AGC adapter → DesignDocument → Project → SVG / HTML / assets`

`DesignDocument` 僅描述原設計；`Project.interactions` 與 `Project.layouts` 是依節點 ID 索引的附加設定。互動編輯、響應式排版與素材去圓角均不修改設計原稿，因此可以隨時回到精準預覽。

## 座標不變條件

- `bounds` 位於圖層本身的座標空間；`transform` 是相對父圖層的 affine matrix。
- 群組 bounds 由子圖層的變形後 bounds 聯集產生。剪裁群組使用剪裁框邊界。
- 畫板在文件中的外部偏移不參與畫板內部渲染；每個畫板原點歸零。
- `worldBounds` 遞迴乘矩陣，用於量測與選取，不能只累加 tx/ty。
- 匯出 HTML 將 bounds 的原點吸收到 wrapper 的 left/top；保留 a/b/c/d 變形及 transform-origin 0 0。
- SVG 剪裁幾何必須直接放在 clipPath 下；群組轉換需先合成，避免 `<g>` 導致剪裁內容消失。
- 文字的 AGC line.x/y 是基線，不是字框左上角。精準預覽保留 tspans；寬高缺失時明確標示估算。

## 邊界與防護

- `parser/xd.ts` 是唯一允許動態 AGC wire shape 的區域。新增格式支援應在 adapter 正規化，不能把 raw AGC 欄位散落到 UI。
- 封裝先檢查數量、大小與路徑；只讀 ZIP 內的資源，不存取 pattern.href 的外部網址或本機路徑。
- 工作檔透過 Zod 驗證，限定數值、列舉、顏色與內嵌點陣圖格式；禁止任意 HTML、JS、CSS 與外部 URL。
- 圖層名稱、文字與屬性均使用對應的 HTML/XML/CSS escaping；輸出類別固定加英文字首，不能讓數字開頭的圖層名變成無效 selector。
- 互動只接受預先定義的行為，沒有自訂程式碼輸入。預覽 iframe 僅允許 scripts，沒有 same-origin；父層僅接受目前 iframe 發出的已知畫板導覽訊息。
- IndexedDB 保存工作檔；50 步 undo/redo 僅保存設定，不重複複製大型內嵌圖像。

## 渲染與輸出

`render/svg.ts` 共用於設計稿、SVG 素材、Canvas PNG 與 HTML 的向量部分。圖層位置／畫板位置、描邊對齊及透明度不能在各輸出端重複套用。

HTML 匯出以原生節點、獨立 stylesheet 與資源目錄為主。矩形保留 CSS、向量與定位文字保留 SVG、流式文字使用 HTML。剪裁複雜群組目前整組 SVG 化；之後可用 CSS clip-path adapter 擴充，但不得默默丟掉子元素互動。

預覽使用 `exportWeb` 的同一組輸出並轉換成 Blob URL。每次更新或離開預覽都回收 URL。`interactionRuntime` 必須保持獨立函式，所有依賴都放在函式內，因為它會序列化為匯出的獨立 JS。

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
