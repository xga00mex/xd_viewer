# XD 本機解析研究與技術選型

研究日期：2026-10-25。以下區分 Adobe 官方 API 文件、開源解析器原始碼，以及本專案對公開測試檔的直接檢查；AGC 不是本專案宣稱完整支援的公開標準。

## 選型

採用 **TypeScript 自有 AGC adapter + fflate ZIP 解壓縮 + SVG 場景渲染**。先保留 XD 的階層、矩陣、原始幾何、文字分行與資源引用，再轉成獨立中介模型；HTML/CSS 匯出是另一個模組。這樣能分開處理「忠實預覽」與「可維護的網頁排版」，也能逐步加入格式版本處理。

| 方案                              | 查證結果                                                                                          | 決策                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Adobe XD Plugin API               | 可取得 scenegraph，但 API 是 XD 內的 plugin 執行環境；沒有提供這個本機獨立工具所需的 `.xd` 解壓器 | 不作執行依賴                                               |
| Adobe Cloud Content API           | 以已發佈文件連結、API key、必要時 OAuth 取得雲端資料                                              | 不符合完全本機需求                                         |
| `L2jLiga/xd2svg`                  | MIT、TypeScript、ZIP/AGC 到 SVG；repo 2020-10-02 封存，使用 Node 檔案系統；作者列有 blur 精度問題 | 研究格式與使用其 MIT 測試資料，不直接把舊 converter 當核心 |
| `umar-ahmed/xdtools`              | MIT、Python、README 明確標 WIP；原始碼提供 shape/style/artboard 讀取                              | 交叉核對欄位；不增加 Python 執行環境                       |
| `dilitirio/xd-scenegraph-toolkit` | MIT、Python extractor 與社群格式筆記                                                              | 輔助找新版欄位；筆記與真實樣本不同時，以可驗證樣本為準     |
| `fflate`                          | MIT、純 JS、TypeScript 型別、browser/Node、ZIP 壓縮與解壓                                         | 僅使用需要的 ZIP 功能，本機打包，不用 CDN                  |

來源：[Adobe scenegraph](https://developer.adobe.com/xd/uxp/develop/reference/scenegraph/)、[Adobe Cloud API quick start](https://github.com/AdobeXD/cloud-content-api-docs/blob/master/tutorials/quick-start.md)、[xd2svg](https://github.com/L2jLiga/xd2svg)、[xdtools](https://github.com/umar-ahmed/xdtools)、[scenegraph toolkit](https://github.com/dilitirio/xd-scenegraph-toolkit)、[fflate](https://github.com/101arrowz/fflate)。

## 實際封裝結構

已直接讀取本專案 `tests/fixtures/xd2svg/single.xd` 的 ZIP entries。這個來源檔有下列內容：

```text
mimetype
manifest
META-INF/metadata.xml
artwork/artboard-<uuid>/graphics/graphicContent.agc
artwork/pasteboard/graphics/graphicContent.agc
resources/graphics/graphicContent.agc
resources/<image-uid>
interactions/interactions.json
preview.png
thumbnail.png
```

`mimetype` 的值是 `application/vnd.adobe.sparkler.project+dcxucf`。`manifest.children` 中 `name/path = artwork` 的 children 包含畫板及 pasteboard。畫板的 `path` 指向實際子目錄，`name` 是名稱，`uxdesign#bounds` 是 x/y/width/height，`uxdesign#viewport.height` 可小於畫板高度。

圖片不是一定帶副檔名；manifest 的 resources.components 提供 `path` 與 MIME `type`。應以 archive entry 對應資源，**不能依賴 pattern.href**：實際樣本的 href 是原設計師電腦的絕對路徑。

依據：[來源 fixture](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/test/input/single.xd)、[manifest parser](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/manifest-parser.ts)。

## 畫板、圖層與座標

一般 AGC 根物件有 `version` 與 `children`，以及 `resources` / `artboards` 資料或 href。實測版本是 `1.5.0`。

- 畫板節點是 `type: "artboard"`，子圖層在 `node.artboard.children`，不是只讀 `node.children`。
- 畫板 metadata 在 shared AGC 的 `artboards[node.artboard.ref]`；**ref 與 node.id 不相同**。manifest bounds 可作另一個來源。
- group 子圖層在 `node.group.children`。保留陣列順序即保留繪製順序。
- `transform: {a,b,c,d,tx,ty}` 是完整 affine matrix，應遞迴相乘；不可只加 tx/ty，否則旋轉、縮放、鏡射會錯誤。
- `visible: false` 與 `style.opacity` 需在群組層保留。群組透明度不可簡單分別乘到每個子元素，重疊區域會產生不同結果。

欄位依據：[artboard model](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/models/artboard.ts)、[resources parser](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/resources-parser.ts)、上述 fixture。矩陣與透明度處理是本專案的實作推論。

## 幾何、樣式及文字

| 類別             | 已確認的欄位與處理                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Rectangle        | `shape.type = rect`；`x/y/width/height`；可選 `r` 四角半徑陣列                                                    |
| Circle / ellipse | `cx/cy/r` 或 `cx/cy/rx/ry`；中心不可誤當左上角                                                                    |
| Line             | `x1/y1/x2/y2`                                                                                                     |
| Path / compound  | `shape.path` 是 SVG path data；compound 也可能帶 children 與 operation                                            |
| Fill             | `style.fill.type = solid/none/gradient/pattern`；solid 的 `color.value` 是 `{r,g,b}`，`alpha` 可選                |
| Gradient         | `fill.gradient.ref` 指向 resources.gradients；實例上帶方向或中心座標，資源提供 type/stops                         |
| Image fill       | `fill.pattern.width/height` 是圖源尺寸；`pattern.meta.ux.uid` 指資源，`scaleBehavior` 有 cover/fill               |
| Stroke           | type/color/width/align；inside、outside、center 需要分開處理，SVG 預設中心描邊不能一概代替                        |
| Clip             | `style.clipPath.ref` 對應 resources.clipPaths；剪裁資源本身可包含圖層                                             |
| Shadow           | `style.filters[]` 的 `type = dropShadow`，參數在 `params.dropShadows[]`，包含 dx/dy/r/color                       |
| Blur             | `uxdesign#blur` 的 params 包含 blurAmount/backgroundEffect 等；背景模糊與物件模糊不同                             |
| Text             | `text.rawText`；`text.paragraphs[].lines[][]` 存 from/to/x/y；應尊重原分行，x/y 是 baseline 座標                  |
| Font             | `style.font.family/postscriptName/style/size`；另有 `style.textAttributes.paragraphAlign/letterSpacing`           |
| Rich text        | 實測 `meta.ux.rangedStyles[]` 有 length/fontFamily/fontStyle/fontSize/charSpacing/fill；fill.value 可為 ARGB 整數 |

依據：[shape model](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/models/shape.ts)、[fill converter](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/styles/fill.ts)、[filter converter](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/styles/filters.ts)、[text converter](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/src/converter/core/converters/text.ts)、[xdtools parser](https://github.com/umar-ahmed/xdtools/blob/master/xdtools/utils/parser.py)、上述 fixture。

注意：xd2svg 在 shadow converter 直接將 r 用作 SVG stdDeviation；這是該實作的選擇，不足以證明 XD blur 與 CSS blur 完全同義。文字 visualBounds 可能包含效果，且與 local transform 原點不同，不應直接當 local box。

進一步以記憶體讀取同 repo 的 [multi.xd](https://github.com/L2jLiga/xd2svg/blob/937365e71fe735751053e918b3ba02cfa546ce7a/test/input/multi.xd)，未額外保留下載檔，確認：

```text
fill.gradient = { x1, y1, x2, y2, units: "objectBoundingBox", ref }
resources.gradients[ref] = { type: "linear", stops: [{ offset, color }, ...] }
style.clipPath = { ref }
resources.clipPaths[ref] = { type: "clipPath", children: [shape, ...] }
text.frame = { type: "area", width: 268, height: 38 }
```

該檔 gradient 座標有 `y2 = 1.342736...`，不應強制裁到 0–1。clip child 保留自己的 transform。area text 實例的 transform.ty 是 481，兩行 baseline y 為 10、23；因此 area 的框頂與 positioned 的文字 baseline 要分別處理。

## 元件與互動的邊界

社群 toolkit 記錄 `syncRef`、master symbols、states、tap/hover 與 artboard/state transition。舊樣本的 symbols 位於 `resources.meta.ux.symbols`，toolkit 說明另列 `resources.symbols`；reader 需容忍兩種位置。不能只根據某份筆記就宣稱支援所有新版 component overrides。依據：[toolkit 格式筆記](https://github.com/dilitirio/xd-scenegraph-toolkit/blob/main/README.md) 與 fixture。

`clowerweb/xd-to-code` 的 [node-normalizer.js](https://github.com/clowerweb/xd-to-code/blob/main/src/normalizer/node-normalizer.js) 另有一種 resolver：以 syncRef.guid 尋找父 group.children 的索引，再從 parent.meta.ux.states 的 state.group.children 同索引取得節點。這個實作與「ref 查 master」不同；本研究尚未找到可驗證兩者完整語意的真實新版元件 fixture。Toolkit [示意資料](https://github.com/dilitirio/xd-scenegraph-toolkit/blob/main/examples/graphic_content_example.json) 的 version 是 `0.0.0`，不應當成 Adobe 生成檔的證據。未解出的元件應警告，不能靜默消失。

本專案自行設定的 Scroll / Click / Hover / Sticky / Fixed / Animation，可儲存在獨立 sidecar/project 設定並輸出標準 CSS/JS。它與自動讀懂 XD 所有原生 prototype transitions 是兩件不同的功能，UI/文件應清楚區分。這是產品設計決策。

## 驗證資料與已知限制

測試資料保存在 `tests/fixtures/xd2svg/`，來源 commit、SHA-256 與授權見該資料夾 README / LICENSE。直接統計：1 畫板、41 groups、178 shapes、91 text、12 圖片資源；畫板 1920 × 6163、viewport 1080。它能驗證真實舊版檔案階層、path、圖片、文字、陰影與隱藏群組，但不能證明新版 component、mask、repeat-grid、影片或 Lottie 支援。

Adobe 官方 scenegraph 類別包含 SymbolInstance、RepeatGrid、ScrollableGroup、Video、Lottie 等，並提醒遍歷時應處理未知類別。匯入器因此應輸出可檢視的警告，保留可用圖層，避免安靜地把未知內容當完整還原。[Adobe scenegraph class hierarchy](https://developer.adobe.com/xd/uxp/develop/reference/scenegraph/)

本機未安裝的字型可能造成字型替代；自動推導 flex/grid 或 breakpoint 也無法從任意絕對座標唯一決定。預覽應優先保留幾何，網頁匯出提供明確的版型/響應式設定，而不是宣稱無條件輸出等效響應式程式碼。SVG/PNG 匯出去圓角應在輸出的副本取消矩形半徑與相應圓角剪裁，不改來源場景，也不移除其他任意形狀的 mask。這些是本專案的工程取捨。
