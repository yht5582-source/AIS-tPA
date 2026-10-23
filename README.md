# 急性缺血性腦中風 (AIS) 雙軌決策與風險評估系統

線上版：https://yht5582-source.github.io/AIS-tPA/

## 📝 專案簡介
單頁式工具，協助神經內科與急診團隊在急性缺血性腦中風 (AIS) 時同步評估「IV 血栓溶解 (IVT：alteplase / tenecteplase)」與「動脈取栓 (EVT)」，並附台灣健保 rt-PA 給付條件檢核。邏輯依 **2026 AHA/ASA 急性缺血性腦中風早期處置指引**。

## ✨ 功能
* **即時雙軌決策**：輸入即更新，IVT 與 EVT 各自顯示「建議 / 個別評估 / 不建議 / 待完成」與指引建議等級 (COR)，並歸納為情境 A–D（Bridging、IVT only、EVT only、皆不適用）。
* **時窗**：發作明確 / 醒來中風 / 時間不明；4.5 小時標準時窗、DWI-FLAIR mismatch（症狀被發現 4.5 小時內）、灌流影像半影區（4.5–9 小時或睡眠中點 9 小時內）、LVO 無法取栓時 4.5–24 小時 (2b)。
* **EVT 條件**：ICA/M1 0–6 小時 ASPECTS 3–10、0–2（<80 歲、無占位效應）；6–24 小時 ASPECTS ≥6 或 3–5（<80 歲、無占位效應）；發病前 mRS 2 (2a)、3–4 (2b)；M2 優勢分支 (2a)、非優勢 M2/遠端/ACA/PCA (No Benefit)；基底動脈 NIHSS ≥10 (1)、6–9 (2b)。
* **禁忌症**：AHA 2026 Table 8 絕對 / 相對禁忌；血小板、INR、aPTT、PT、血壓、血糖、輕微非失能中風 (NIHSS 0–5) 自動判讀；warfarin / heparin 未出報告時提示等待，其餘不需等檢驗。
* **劑量**：Alteplase 0.9 mg/kg（上限 90 mg，含 mL、輸注速率與抽棄量）、Tenecteplase 0.25 mg/kg 體重級距（上限 25 mg）、Alteplase 0.6 mg/kg（ENCHANTED/日本仿單，標示非指引建議）。
* **NIHSS 計算機**：完整 15 項、左右肢分開計分（滿分 42）。
* **台灣健保 rt-PA 排除條件**：時間、NIHSS <4 或 >25、血糖 <50/>400、INR >1.3、使用 DOAC 等自動標示，另附其餘排除條件勾選。
* **後續處置**：IVT/EVT 後血壓目標、監測頻率、DAPT（NIHSS ≤3 / ≤5）、AF 早期抗凝。CHA₂DS₂-VASc 與 HAS-BLED（本次中風與年齡自動計分）。
* **複製評估摘要**：一鍵複製純文字，可貼入病歷。

## 🧪 測試
```bash
node tests.cjs
```
從 `index.html` 的 `/*ENGINE-START*/…/*ENGINE-END*/` 抽出決策引擎，執行 98 項測試（情境、IVT/EVT 條件、劑量、NIHSS、健保條件）。

## 📚 依據
* Prabhakaran S, et al. 2026 Guideline for the Early Management of Patients With Acute Ischemic Stroke. *Stroke*. 2026. doi:10.1161/STR.0000000000000513
* 健保 rt-PA 收案 3 項 / 排除 28 項（112.10.1 放寬至 4.5 小時）、機械取栓 112.11.1 放寬至 24 小時 — 實際以健保署最新給付規定與院內 SOP 為準。

## ⚠️ 免責聲明
1. 僅供醫療專業人員教育與決策輔助，不可取代臨床判斷。
2. 給藥前請依院內 SOP 雙人核對體重、劑量與禁忌症。Tenecteplase 之台灣核准適應症與健保給付請依院內規定確認。

## 更新紀錄
* **v2.0（2026-10-23）**：除錯與改版 — 修正顱內出血仍判定「EVT only」、ASPECTS 空白被當成符合、體重空白預設 60 kg 給藥、NIHSS 只算單側肢體（滿分 34）且未用於決策、時間倒置仍判定可施打、輕微非失能中風仍建議 tPA、CHA₂DS₂-VASc 兩個年齡項可同時勾選等問題；依 2026 AHA/ASA 指引重寫 IVT/EVT 條件，新增 tenecteplase、延長時窗、健保條件、後續處置與摘要複製。
