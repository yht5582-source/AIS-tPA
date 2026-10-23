// 執行：node tests.cjs —— 從 index.html 抽出 /*ENGINE-START*/…/*ENGINE-END*/ 測試決策引擎
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const code = src.slice(src.indexOf('/*ENGINE-START*/'), src.indexOf('/*ENGINE-END*/'));
const m = { exports: {} };
new Function('module', code)(m);
const AIS = m.exports;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('✗ ' + name); } }
function eq(a, b, name) { ok(a === b, `${name}: 期望 ${JSON.stringify(b)}，實際 ${JSON.stringify(a)}`); }

const base = { onsetType: 'known', tLkw: 2, tRecog: null, tSleepMid: null, age: '70', weight: '70', preMrs: '0', nihss: '12', disabling: false,
  sbp: '170', dbp: '90', glucose: '130', bpRefractory: false, anticoag: 'none', plt: '', inr: '', aptt: '', pt: '',
  ct: 'clear', aspects: '8', occl: 'm1', pcAspects: '', massEffect: false, penumbra: false, dwiFlair: false, evtLimit: false, af: false, abs: [], rel: [], nhi: [] };
const D = o => AIS.decide({ ...base, ...o });

// ---- 情境 ----
eq(D({}).scenario.key, 'a', '2h M1 NIHSS12 ASPECTS8 → Bridging');
eq(D({ occl: 'none' }).scenario.key, 'b', '無 LVO → IVT only');
eq(D({ tLkw: 8 }).scenario.key, 'c', '8h M1 → EVT only');
eq(D({ tLkw: 8, occl: 'none' }).scenario.key, 'd', '8h 無 LVO → D');
eq(D({ occl: 'pending' }).scenario.key, 'b', 'IVT 可、CTA 待 → 先給 IVT');
eq(D({ tLkw: 8, occl: 'pending' }).scenario.key, 'p', '超時且 CTA 待 → 評估中');

// ---- 原版 bug 回歸 ----
let r = D({ ct: 'ich' });
eq(r.ivt.status, 'no', 'ICH → 不給 IVT');
eq(r.evt.status, 'no', 'ICH → 不是 EVT only（原版 bug）');
eq(D({ aspects: '' }).evt.status, 'pending', 'ASPECTS 空白 → 待補，不當成符合（原版 NaN bug）');
eq(AIS.alteplase('', 0.9), null, '體重空白 → 不給劑量（原版默認 60 kg）');
eq(D({ tLkw: null }).ivt.status, 'pending', '時間無效 → 待輸入');
eq(D({ tLkw: 10, occl: 'm1' }).evt.cor, '1', '6–24h ASPECTS≥6 COR 1');

// ---- IVT ----
eq(D({}).ivt.cor, '1', '≤4.5h COR 1');
eq(D({ tLkw: 4.6, occl: 'none' }).ivt.status, 'no', '4.6h 無影像 → 超過時窗');
eq(D({ nihss: '3', disabling: false }).ivt.cor, '3: No Benefit', 'NIHSS 3 非失能 → No Benefit');
eq(D({ nihss: '3', disabling: true, occl: 'none' }).ivt.status, 'yes', 'NIHSS 3 明顯失能 → 可 IVT');
eq(D({ plt: '90' }).ivt.status, 'no', '血小板 90 → 禁忌');
eq(D({ inr: '1.8' }).ivt.status, 'no', 'INR 1.8 → 禁忌');
eq(D({ inr: '1.6' }).ivt.status, 'yes', 'INR 1.6 → 可');
eq(D({ aptt: '45' }).ivt.status, 'no', 'aPTT 45 → 禁忌');
eq(D({ pt: '16' }).ivt.status, 'no', 'PT 16 → 禁忌');
eq(D({ anticoag: 'warfarin' }).ivt.status, 'pending', 'warfarin 無 INR → 等報告');
eq(D({ anticoag: 'heparin' }).ivt.status, 'pending', 'heparin 無 aPTT → 等報告');
eq(D({ anticoag: 'doac' }).ivt.status, 'consider', 'DOAC <48h → 個別評估');
eq(D({ anticoag: 'lmwh' }).ivt.status, 'no', 'LMWH 24h → 禁忌');
eq(D({ glucose: '40' }).ivt.status, 'pending', '低血糖 → 先矯正');
eq(D({ bpRefractory: true }).ivt.status, 'no', '血壓降不下來 → 禁忌');
ok(D({ sbp: '200' }).ivt.reasons.some(x => x[0] === 'act' && /185/.test(x[1])), '血壓 200 → 先降壓提示');
eq(D({ abs: ['ie'] }).ivt.status, 'no', '心內膜炎 → 禁忌');
eq(D({ ct: 'hypodense' }).ivt.status, 'no', '大範圍低密度 → 禁忌');
eq(D({ rel: ['stroke3m'] }).ivt.status, 'consider', '3 月內中風 → 相對');
eq(D({ preMrs: '3', occl: 'none' }).ivt.status, 'consider', '病前失能 → 相對');
eq(D({ age: '15', occl: 'none' }).ivt.status, 'consider', '未滿 18 → 2b 個別');
// 延長時窗
eq(D({ tLkw: 6, occl: 'none', penumbra: true }).ivt.cor, '2a', '6h 有半影區、無 EVT → 2a');
eq(D({ tLkw: 6, occl: 'm1', penumbra: true }).ivt.status, 'no', '6h 可 EVT → 不走延長 IVT');
eq(D({ tLkw: 10, occl: 'none', penumbra: true }).ivt.status, 'no', '10h 無 LVO → no');
eq(D({ onsetType: 'wake', tLkw: 9, tRecog: 2, dwiFlair: true, occl: 'none' }).ivt.cor, '2a', 'wake-up DWI-FLAIR → 2a');
eq(D({ onsetType: 'wake', tLkw: 9, tRecog: 5, dwiFlair: true, occl: 'none' }).ivt.status, 'no', '發現 5h → DWI-FLAIR 超時');
eq(D({ onsetType: 'wake', tLkw: 11, tSleepMid: 7, penumbra: true, occl: 'none' }).ivt.cor, '2a', 'wake-up 睡眠中點 7h 半影區 → 2a');
eq(D({ onsetType: 'unknown', tLkw: 11, tSleepMid: 7, penumbra: true, occl: 'none' }).ivt.status, 'no', '非睡眠不明 → 不能用睡眠中點');
eq(D({ tLkw: 12, occl: 'm1', penumbra: true, evtLimit: true }).ivt.cor, '2b', 'LVO 12h 無法 EVT 半影區 → 2b');

// ---- EVT ----
eq(D({ aspects: '4' }).evt.cor, '1', '≤6h ASPECTS 4 → COR 1');
eq(D({ aspects: '2', age: '70' }).evt.cor, '2a', '≤6h ASPECTS 2 <80 歲 → 2a');
eq(D({ aspects: '2', age: '82' }).evt.status, 'no', 'ASPECTS 2 ≥80 歲 → 不符');
eq(D({ aspects: '2', massEffect: true }).evt.status, 'no', 'ASPECTS 2 占位效應 → 不符');
eq(D({ tLkw: 10, aspects: '4', age: '70' }).evt.cor, '1', '6–24h ASPECTS 4 <80 → COR 1');
eq(D({ tLkw: 10, aspects: '4', age: '85' }).evt.status, 'no', '6–24h ASPECTS 4 ≥80 → 不符');
eq(D({ tLkw: 10, aspects: '2' }).evt.status, 'no', '6–24h ASPECTS 2 → 不符');
eq(D({ preMrs: '2' }).evt.cor, '2a', 'mRS 2 ≤6h → 2a');
eq(D({ preMrs: '3' }).evt.cor, '2b', 'mRS 3 ≤6h → 2b');
eq(D({ preMrs: '2', tLkw: 10 }).evt.status, 'no', 'mRS 2 6–24h → 證據不足');
eq(D({ preMrs: '2', aspects: '5' }).evt.status, 'no', 'mRS 2 ASPECTS 5 → 證據不足');
eq(D({ nihss: '5', disabling: true }).evt.status, 'no', 'NIHSS 5 → EVT 證據不足');
eq(D({ tLkw: 25 }).evt.status, 'no', '>24h → no');
eq(D({ occl: 'm2dom' }).evt.cor, '2a', 'M2 優勢 ≤6h → 2a');
eq(D({ occl: 'm2dom', tLkw: 8 }).evt.status, 'no', 'M2 優勢 8h → no');
eq(D({ occl: 'm2nondom' }).evt.cor, '3: No Benefit', 'M2 非優勢 → No Benefit');
eq(D({ occl: 'distal' }).evt.cor, '3: No Benefit', '遠端 → No Benefit');
eq(D({ occl: 'basilar', pcAspects: '8', nihss: '12' }).evt.cor, '1', 'basilar NIHSS 12 → COR 1');
eq(D({ occl: 'basilar', pcAspects: '8', nihss: '8' }).evt.cor, '2b', 'basilar NIHSS 8 → 2b');
eq(D({ occl: 'basilar', pcAspects: '5', nihss: '12' }).evt.status, 'no', 'basilar PC-ASPECTS 5 → no');
eq(D({ occl: 'basilar', pcAspects: '' }).evt.status, 'pending', 'basilar 缺 PC-ASPECTS → 待補');
eq(D({ occl: 'ica', tLkw: 20 }).evt.status, 'yes', 'ICA 20h ASPECTS 8 → yes');

// ---- 劑量 ----
let d = AIS.alteplase(70, 0.9);
eq(d.total, 63, '70 kg alteplase 63 mg');
eq(d.bolus, 6.3, 'bolus 6.3');
eq(d.infusion, 56.7, 'infusion 56.7');
eq(d.discard, 37, '2 瓶丟棄 37 mg');
d = AIS.alteplase(110, 0.9);
eq(d.total, 90, '110 kg 上限 90');
ok(d.capped, '標示已達上限');
eq(d.discard, 10, '90 mg 丟 10');
d = AIS.alteplase(50, 0.9);
eq(d.total, 45, '50 kg 45 mg'); eq(d.vials, 1, '一瓶'); eq(d.discard, 5, '丟 5');
d = AIS.alteplase(55.5, 0.9);
eq(AIS.r1(d.bolus + d.infusion), d.total, 'bolus + infusion = total');
d = AIS.alteplase(70, 0.6);
eq(d.total, 42, '0.6 mg/kg 42 mg'); eq(d.bolus, 6.3, '0.6 bolus 15%');
eq(AIS.alteplase(120, 0.6).total, 60, '0.6 上限 60');
eq(AIS.alteplase(10, 0.9), null, '10 kg 不合理');
eq(AIS.tenecteplase(59.9).dose, 15, 'TNK <60 → 15');
eq(AIS.tenecteplase(60).dose, 17.5, 'TNK 60 → 17.5');
eq(AIS.tenecteplase(79).dose, 20, 'TNK 79 → 20');
eq(AIS.tenecteplase(85).ml, 4.5, 'TNK 85 → 4.5 mL');
eq(AIS.tenecteplase(130).dose, 25, 'TNK 上限 25');
eq(AIS.tenecteplase(45).exact, 11.3, 'TNK 45 kg 1-kg 級距 11.3');

// ---- NIHSS ----
const all = {}; AIS.NIHSS.forEach(([id, , opts]) => all[id] = Math.max(...opts.map(o => o[0]).filter(x => x !== 'UN')));
eq(AIS.nihssTotal(all), 42, 'NIHSS 滿分 42（原版 34）');
eq(AIS.NIHSS.length, 15, 'NIHSS 15 項');
eq(AIS.nihssTotal({ '5a': '', '5b': '3' }), 3, 'UN 不計分');

// ---- 健保 ----
ok(D({ tLkw: 5 }).nhi.some(x => /4\.5/.test(x)), '健保 >4.5h');
ok(D({ nihss: '27' }).nhi.some(x => />25/.test(x)), '健保 NIHSS >25');
ok(D({ anticoag: 'warfarin', inr: '1.5' }).nhi.some(x => /1\.3/.test(x)), '健保 INR >1.3');
ok(D({ anticoag: 'doac' }).nhi.some(x => /DOAC/.test(x)), '健保 DOAC');
ok(D({ glucose: '420' }).nhi.some(x => /400/.test(x)), '健保 血糖 >400');
ok(D({ onsetType: 'wake' }).nhi.some(x => /不明/.test(x)), '健保 時間不明');
ok(D({ nhi: ['seizure'] }).nhi.some(x => /癲癇/.test(x)), '健保 癲癇');
eq(D({}).nhi.length, 0, '標準病例無健保排除');
ok(D({ agent: 'tnk' }).nhi.some(x => /Tenecteplase/.test(x)), '健保 TNK 不給付');
ok(D({ anticoag: 'warfarin' }).nhi.some(x => /INR ≤1\.3/.test(x)), '健保 warfarin 未驗 INR');
ok(D({ nhi: ['ivBp'] }).nhi.some(x => /靜脈降壓/.test(x)), '健保 需靜脈降壓');
ok(D({ bpRefractory: true }).nhi.some(x => /未被控制/.test(x)), '健保 未控制高血壓');
eq(AIS.NHI_EXTRA.length, 14, '健保補充勾選 14 項');

// ---- 後續 ----
ok(D({ tLkw: 30, occl: 'none', nihss: '2' }).after.some(x => /clopidogrel/.test(x)), '輕症未 IVT → DAPT');
ok(!D({ tLkw: 30, occl: 'none', nihss: '2', af: true }).after.some(x => /clopidogrel/.test(x)), 'AF → 不建議 DAPT');
ok(D({}).after.some(x => /180\/105/.test(x)), 'IVT 後血壓目標');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
