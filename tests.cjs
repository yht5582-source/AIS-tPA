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

// ---- 示範病例：全部由引擎算出，expect 與變化題都要吻合 ----
const block = (name, ret) => new Function(src.slice(src.indexOf(`/*${name}-START*/`), src.indexOf(`/*${name}-END*/`)) + `;return ${ret};`)();
const { CASE_BASE, AIS_CASES } = block('CASES', '{ CASE_BASE, AIS_CASES }');
const AIS_QUIZ = block('QUIZ', 'AIS_QUIZ');
const AIS_MAP = block('MAP', 'AIS_MAP');
function checkCase(name, p, x) {
  const r = AIS.decide(p);
  eq(r.scenario.key, x.scenario, name + ' 情境');
  eq(r.ivt.status, x.ivt, name + ' IVT');
  eq(r.evt.status, x.evt, name + ' EVT');
  if (x.ivtCor) eq(r.ivt.cor, x.ivtCor, name + ' IVT COR');
  if (x.evtCor) eq(r.evt.cor, x.evtCor, name + ' EVT COR');
  if (x.nhi) ok(r.nhi.some(t => x.nhi.test(t)), name + ' 健保 ' + x.nhi);
  if (x.after) ok(r.after.some(t => x.after.test(t)), name + ' 後續 ' + x.after);
  const a = AIS.alteplase(p.weight, 0.9);
  if (x.total) eq(a.total, x.total, name + ' alteplase 總量');
  if (x.bolus) eq(a.bolus, x.bolus, name + ' bolus');
  if (x.infusion) eq(a.infusion, x.infusion, name + ' 輸注');
  if (x.tnk) eq(AIS.tenecteplase(p.weight).dose, x.tnk, name + ' TNK');
}
eq(AIS_CASES.length, 11, '示範病例 11 例');
for (const c of AIS_CASES) {
  const p = { ...CASE_BASE, ...c.p };
  checkCase(c.id, p, c.expect);
  checkCase(c.id + ' 變化題', { ...p, ...c.twist.p }, c.twist.expect);
  ok(c.points.some(x => x[0] === 'tw'), c.id + ' 有台灣規範重點');
  ok(c.points.some(x => x[0] === 'intl'), c.id + ' 有國際指引重點');
  const nums = c.points.map(x => x[1]).join('');
  if (c.expect.total && /alteplase \d/.test(nums)) ok(nums.includes(`alteplase ${c.expect.total} mg`), c.id + ' 重點劑量與引擎一致');
}

// ---- 考題：結構與答案分布 ----
eq(AIS_QUIZ.length, 24, '考題 24 題');
eq(AIS_QUIZ.filter(q => q.level === 'basic').length, 10, '基礎 10 題');
eq(AIS_QUIZ.filter(q => q.level === 'adv').length, 14, '高階 14 題');
eq(new Set(AIS_QUIZ.map(q => q.id)).size, 24, '題號不重複');
[0, 1, 2, 3].forEach(i => eq(AIS_QUIZ.filter(q => q.ans === i).length, 6, '答案 ' + 'ABCD'[i] + ' 6 題'));
for (const q of AIS_QUIZ) {
  eq(q.opts.length, 4, q.id + ' 四個選項');
  eq(new Set(q.opts).size, 4, q.id + ' 選項不重複');
  ok(q.ans >= 0 && q.ans < 4 && q.why && q.src, q.id + ' 有答案、解析、出處');
}
const longest = AIS_QUIZ.filter(q => q.opts[q.ans].length === Math.max(...q.opts.map(o => o.length))).length;
ok(longest <= 7, `正解為最長選項不應過多（目前 ${longest}）`);

// ---- 考題：答案與引擎核對 ----
const Q = id => AIS_QUIZ.find(q => q.id === id), A = id => Q(id).opts[Q(id).ans];
const a80 = AIS.alteplase(80, 0.9);
ok(A('b2').includes(`總量 ${a80.total} mg`) && A('b2').includes(`bolus ${a80.bolus} mg`) && A('b2').includes(`輸注 ${a80.infusion} mg`), 'b2 alteplase 80 kg');
const t75 = AIS.tenecteplase(75);
ok(A('b3').includes(`${t75.dose} mg（${t75.ml} mL）`), 'b3 TNK 75 kg');
eq(D({ tLkw: 1.5, glucose: '110', occl: 'none' }).ivt.status, 'yes', 'b5 血糖矯正後可 IVT');
eq(D({ nihss: '2', occl: 'none' }).ivt.cor, '3: No Benefit', 'b6 非失能輕症');
ok(D({ nihss: '2', occl: 'none', tLkw: 2 }).after.some(x => /clopidogrel/.test(x)), 'b6 DAPT');
eq(D({}).scenario.key, 'a', 'b7 Bridging');
ok(D({ agent: 'tnk' }).nhi.some(x => /僅給付 rt-PA/.test(x)), 'b10 健保僅 rt-PA');
const m14 = o => D({ tLkw: 14, nihss: '18', occl: 'm1', ...o }).evt;
eq(m14({ age: '75', aspects: '4' }).cor, '1', 'a1 正解 COR 1');
eq(m14({ age: '84', aspects: '4' }).status, 'no', 'a1 84 歲不符');
eq(m14({ age: '70', aspects: '2' }).status, 'no', 'a1 ASPECTS 2 不符');
eq(m14({ age: '70', aspects: '4', massEffect: true }).status, 'no', 'a1 占位效應不符');
eq(D({ tLkw: 3, nihss: '20', aspects: '1' }).evt.cor, '2a', 'a2 ASPECTS 1');
eq(D({ tLkw: 4, nihss: '14', aspects: '7', preMrs: '3' }).evt.cor, '2b', 'a3 4 小時 mRS 3');
eq(D({ tLkw: 8, nihss: '14', aspects: '7', preMrs: '3' }).evt.status, 'no', 'a3 8 小時 mRS 3');
const ba = n => D({ tLkw: 10, occl: 'basilar', pcAspects: '8', nihss: n }).evt.cor;
eq(ba('12'), '1', 'a4 基底 NIHSS 12'); eq(ba('8'), '2b', 'a4 基底 NIHSS 8');
const a5 = D({ tLkw: 7, nihss: '15', aspects: '7', penumbra: true });
eq(a5.scenario.key, 'c', 'a5 直接 EVT'); eq(a5.evt.cor, '1', 'a5 EVT COR 1'); eq(a5.ivt.status, 'no', 'a5 不走延長 IVT');
const a6 = D({ tLkw: 3, anticoag: 'warfarin', inr: '1.5', occl: 'none' });
eq(a6.ivt.cor, '1', 'a6 指引可給'); ok(a6.nhi.some(x => />1\.3/.test(x)), 'a6 健保排除');
ok(D({ tLkw: 2 }).after.some(x => /<140/.test(x)), 'a9 不壓到 <140');
ok(D({ tLkw: 30, occl: 'none', nihss: '4' }).after.some(x => /24–72/.test(x)), 'a10 NIHSS 4 延伸 DAPT');

// ---- 心智圖：數字與引擎門檻一致 ----
const mapText = JSON.stringify(AIS_MAP);
eq(AIS_MAP.dx.length + AIS_MAP.tx.length, 15, '心智圖 15 分支');
ok(AIS_MAP.tx.find(b => b.t === '台灣健保').l.every(x => x.tw), '健保分支全部標台灣');
ok([...AIS_MAP.dx, ...AIS_MAP.tx].filter(b => b.t !== '台灣健保').every(b => b.l.every(x => !x.tw)), '其餘分支不標台灣');
AIS.TNK_BANDS.forEach(([, mg]) => ok(mapText.includes(String(mg)), 'TNK 級距 ' + mg));
for (const k of ['INR >1.7', 'aPTT >40', 'PT >15', '血小板 <100k', 'INR >1.3', '<4 或 >25', '<185/110', '<180/105', '上限 90 mg', '上限 25 mg']) ok(mapText.includes(k), '心智圖含 ' + k);
// a11–a14：高難度題答案與引擎核對
const a11 = D({ onsetType: 'wake', tLkw: 10, tRecog: 2, tSleepMid: 6, nihss: '8', occl: 'm2nondom', penumbra: true });
eq(a11.ivt.cor, '2a', 'a11 灌流路徑 2a'); eq(a11.evt.cor, '3: No Benefit', 'a11 M2 共優勢 EVT 無益');
eq(D({ onsetType: 'wake', tLkw: 10, tRecog: 2, tSleepMid: 10, nihss: '8', occl: 'm2nondom', penumbra: true }).ivt.status, 'no', 'a11 睡眠中點 >9 小時不符');
const a12 = D({ anticoag: 'doac', nihss: '14', occl: 'm1' });
eq(a12.ivt.status, 'consider', 'a12 DOAC IVT 個別評估'); eq(a12.evt.cor, '1', 'a12 EVT COR 1');
const a13 = D({ tLkw: 1, anticoag: 'heparin', aptt: '52', nihss: '17', aspects: '9', rel: ['stemi3m'] });
eq(a13.scenario.key, 'c', 'a13 直接 EVT'); eq(a13.ivt.status, 'no', 'a13 aPTT >40');
const a14 = D({ tLkw: 3, nihss: '26', aspects: '6', occl: 'ica', sbp: '178', dbp: '100', nhi: ['ivBp'] });
eq(a14.scenario.key, 'a', 'a14 Bridging'); eq(AIS.alteplase(110, 0.9).total, 90, 'a14 上限 90 mg');
ok(A('a14').includes(`Alteplase ${AIS.alteplase(110, 0.9).total} mg`), 'a14 選項劑量與引擎一致');
ok(a14.nhi.some(x => /NIHSS >25/.test(x)) && a14.nhi.some(x => /靜脈降壓/.test(x)), 'a14 健保排除');
const a110 = AIS.alteplase(110, 0.9);
ok(mapText.includes(`alteplase ${a110.total} mg（bolus ${a110.bolus}、輸注 ${a110.infusion} mg）`) && AIS.tenecteplase(110).dose === 25, '心智圖 大體重封頂與引擎一致');
eq(D({ nihss: '26' }).ivt.status, 'yes', '心智圖 NIHSS >25 非指引禁忌');
eq(D({ tLkw: 1, anticoag: 'heparin', aptt: '52' }).evt.status, 'yes', '心智圖 取栓不看凝血');
eq(D({ tLkw: 7, occl: 'm1', penumbra: true }).ivt.status, 'no', '心智圖 能取栓就不走灌流 IVT');
eq(D({ plt: '99' }).ivt.status, 'no', '心智圖 血小板 <100');
eq(D({ inr: '1.71' }).ivt.status, 'no', '心智圖 INR >1.7');
eq(D({ inr: '1.7' }).ivt.status, 'yes', '心智圖 INR 1.7 可');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
