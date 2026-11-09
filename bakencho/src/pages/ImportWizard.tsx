// Excel/CSV取り込み: ファイル選択 → 列のプレビューと列→フィールドの対応づけ → 件数確認 → 取り込み。
// マッピングは名前を付けて保存し、次回は見出し名で自動的に当て直す。
import { useMemo, useRef, useState } from 'react';
import { Modal } from '../components/ui';
import { yen } from '../domain/format';
import {
  buildPlan, cellText, DEFAULT_MAPPING, guessMapping, IMPORT_FIELDS, rebindMapping, type Cell, type ColumnRef, type FieldKey, type Mapping,
} from '../domain/importer';
import { newId } from '../domain/ticket';
import { BET_TYPES, type BetType } from '../domain/types';
import { readTableFile, type SheetTable } from '../lib/files';
import { useStore } from '../state/store';

const colLetter = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const { data, bulkInsert, saveMapping, deleteMapping, toast, setPage } = useStore();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetTable[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [skipDup, setSkipDup] = useState(true);
  const [mapName, setMapName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const table: Cell[][] = sheets[sheetIdx]?.rows ?? [];
  const width = table.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = useMemo(
    () => Array.from({ length: width }, (_, i) => (mapping.hasHeader ? cellText(table[0]?.[i]) : '') || `${colLetter(i)}列`),
    [table, width, mapping.hasHeader],
  );

  const plan = useMemo(
    () => (table.length ? buildPlan(table, mapping, data, { skipDuplicates: skipDup, nowIso: new Date().toISOString() }) : null),
    [table, mapping, data, skipDup],
  );

  function applyAuto(t: Cell[][], hasHeader: boolean) {
    const hs = Array.from({ length: t.reduce((w, r) => Math.max(w, r.length), 0) }, (_, i) => cellText(t[0]?.[i]));
    // 見出しが一致する保存済みマッピングがあれば使う
    for (const saved of [...data.mappings].reverse()) {
      try {
        const m = JSON.parse(saved.mapping_json) as Mapping;
        const re = rebindMapping({ ...DEFAULT_MAPPING, ...m }, hs);
        const hit = Object.values(m.columns ?? {}).filter((c) => c && hs.includes(c.header)).length;
        if (hit >= 3) {
          setMapping(re);
          setMapName(saved.name);
          toast(`保存したマッピング「${saved.name}」を当てはめました`);
          return;
        }
      } catch { /* 壊れたマッピングは無視 */ }
    }
    setMapping({ ...DEFAULT_MAPPING, hasHeader, columns: hasHeader ? guessMapping(hs) : {} });
  }

  async function onFile(f: File) {
    try {
      const ss = (await readTableFile(f)).filter((s) => s.rows.length > 0);
      if (ss.length === 0) throw new Error('データのあるシートがありません');
      setFileName(f.name);
      setSheets(ss);
      setSheetIdx(0);
      applyAuto(ss[0].rows, true);
    } catch (e) {
      toast(`読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  const setCol = (key: FieldKey, idx: string) =>
    setMapping((m) => {
      const columns = { ...m.columns };
      if (idx === '') delete columns[key];
      else columns[key] = { index: Number(idx), header: mapping.hasHeader ? cellText(table[0]?.[Number(idx)]) : '' } as ColumnRef;
      return { ...m, columns };
    });

  async function onSaveMapping() {
    const name = mapName.trim() || fileName || '取り込み設定';
    const existing = data.mappings.find((m) => m.name === name);
    await saveMapping({ id: existing?.id ?? newId(), name, mapping_json: JSON.stringify(mapping), created_at: new Date().toISOString() });
    toast(`マッピング「${name}」を保存しました`);
  }

  async function onImport() {
    if (!plan || plan.tickets.length === 0) return;
    setBusy(true);
    try {
      await bulkInsert(plan.newRaces, plan.tickets);
      toast(`取り込みました: レース${plan.summary.races}件・票${plan.summary.tickets}件`);
      onClose();
      setPage('races');
    } catch {
      setBusy(false);
    }
  }

  const required: FieldKey[] = ['date', 'stake'];
  const mapped = new Set(Object.values(mapping.columns).map((c) => c!.index));
  const missing = required.filter((k) => !(k === 'stake' && mapping.columns.unit_price) && !mapping.columns[k]);
  const hasRaceNo = !!(mapping.columns.race_no || mapping.columns.race_label);

  return (
    <Modal
      title="Excel / CSV から取り込む"
      wide
      onClose={onClose}
      footer={
        <>
          {plan && (
            <span className="small">
              レース <b className="num">{plan.summary.races}</b>件、票 <b className="num">{plan.summary.tickets}</b>件、未確定 <b className="num">{plan.summary.pending}</b>件、金額合計 <b className="num">{yen(plan.summary.stake)}</b>
            </span>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn primary" disabled={!plan || plan.tickets.length === 0 || busy || missing.length > 0} onClick={() => void onImport()}>
            この内容で取り込む
          </button>
        </>
      }
    >
      {/* 1. ファイル */}
      <div className="actions">
        <button className="btn" data-autofocus onClick={() => fileRef.current?.click()}>{fileName ? 'ファイルを選び直す…' : 'ファイルを選ぶ…（.xlsx / .csv）'}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
        {fileName && <span className="num">{fileName}</span>}
        {sheets.length > 1 && (
          <select style={{ width: 200 }} value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); applyAuto(sheets[i].rows, mapping.hasHeader); }} aria-label="シート">
            {sheets.map((s, i) => <option key={i} value={i}>{s.name}（{s.rows.length}行）</option>)}
          </select>
        )}
        <span className="spacer" />
        {data.mappings.length > 0 && table.length > 0 && (
          <select
            style={{ width: 220 }}
            value=""
            aria-label="保存したマッピングを使う"
            onChange={(e) => {
              const saved = data.mappings.find((m) => m.id === e.target.value);
              if (!saved) return;
              const m = JSON.parse(saved.mapping_json) as Mapping;
              setMapping(rebindMapping({ ...DEFAULT_MAPPING, ...m }, Array.from({ length: width }, (_, i) => cellText(table[0]?.[i]))));
              setMapName(saved.name);
            }}
          >
            <option value="">保存したマッピングを使う…</option>
            {data.mappings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {!table.length && (
        <div className="notice">
          知人のExcelのように「1行＝1票」の表を想定しています。開催日・競馬場・レース番号（または「東京11R」のような1列）・券種・買い目・購入額・払戻（またはオッズ）の列を対応づけます。
        </div>
      )}

      {table.length > 0 && (
        <>
          {/* 2. プレビュー */}
          <div>
            <div className="section-title">プレビュー（先頭8行）</div>
            <div className="preview-table">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="r">行</th>
                    {headers.map((h, i) => <th key={i} className={mapped.has(i) ? 'mapped' : ''}>{colLetter(i)}: {h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {table.slice(mapping.hasHeader ? 1 : 0, (mapping.hasHeader ? 1 : 0) + 8).map((r, ri) => (
                    <tr key={ri}>
                      <td className="r faint">{ri + (mapping.hasHeader ? 2 : 1)}</td>
                      {Array.from({ length: width }, (_, i) => <td key={i}>{cellText(r[i])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. マッピング */}
          <div>
            <div className="actions" style={{ marginBottom: 6 }}>
              <div className="section-title" style={{ margin: 0 }}>列 → 項目の対応</div>
              <label className="check">
                <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => { setMapping((m) => ({ ...m, hasHeader: e.target.checked })); }} />
                1行目は見出し
              </label>
              <span className="spacer" />
              <input style={{ width: 200 }} placeholder="マッピング名（例：知人の収支表）" value={mapName} onChange={(e) => setMapName(e.target.value)} />
              <button className="btn sm" onClick={() => void onSaveMapping()}>マッピングを保存</button>
              {data.mappings.some((m) => m.name === mapName) && (
                <button className="btn ghost sm" onClick={() => { const m = data.mappings.find((x) => x.name === mapName); if (m) void deleteMapping(m.id); }}>削除</button>
              )}
            </div>
            <div className="map-grid">
              {IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="f" title={f.hint}>
                  <span>
                    {f.label}
                    {(f.key === 'date' || f.key === 'stake') && <span className="neg"> *</span>}
                    <span className="faint" style={{ fontWeight: 400 }}>　{f.hint}</span>
                  </span>
                  <select value={mapping.columns[f.key]?.index ?? ''} onChange={(e) => setCol(f.key, e.target.value)}>
                    <option value="">（使わない）</option>
                    {headers.map((h, i) => <option key={i} value={i}>{colLetter(i)}: {h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="map-grid" style={{ marginTop: 10 }}>
              <label className="f"><span>競馬場の列がないときの競馬場</span><input value={mapping.defaultCourse} onChange={(e) => setMapping((m) => ({ ...m, defaultCourse: e.target.value }))} placeholder="例：東京" /></label>
              <label className="f">
                <span>券種の列がないときの券種</span>
                <select value={mapping.defaultBetType} onChange={(e) => setMapping((m) => ({ ...m, defaultBetType: e.target.value as BetType }))}>
                  {BET_TYPES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
              <label className="f">
                <span>払戻（オッズ）が空欄の行</span>
                <select value={mapping.blankMeans} onChange={(e) => setMapping((m) => ({ ...m, blankMeans: e.target.value as Mapping['blankMeans'] }))}>
                  <option value="pending">未確定として取り込む</option>
                  <option value="miss">不的中（0円）として取り込む</option>
                </select>
              </label>
              <label className="f"><span>未確定を表す記号（カンマ区切り）</span><input value={mapping.pendingMarks} onChange={(e) => setMapping((m) => ({ ...m, pendingMarks: e.target.value }))} /></label>
              <label className="f"><span>不的中を表す記号（カンマ区切り）</span><input value={mapping.missMarks} onChange={(e) => setMapping((m) => ({ ...m, missMarks: e.target.value }))} /></label>
            </div>
          </div>

          {/* 4. 確認 */}
          {missing.length > 0 && <div className="notice err">必須の項目が未設定です: {missing.map((k) => IMPORT_FIELDS.find((f) => f.key === k)!.label).join('、')}</div>}
          {!hasRaceNo && <div className="notice err">「レース番号」か「レース（まとめ）」の列を指定してください。</div>}
          {plan && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="section-title">重複候補 {plan.duplicates.length}件</div>
                {plan.duplicates.length === 0 ? (
                  <div className="muted small">同じ開催日・競馬場・レース番号・券種・買い目の票はありません。</div>
                ) : (
                  <>
                    <div className="notice">同じ開催日・競馬場・レース番号・券種・買い目の票があります。</div>
                    <label className="check" style={{ margin: '6px 0' }}>
                      <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />重複候補は取り込まない
                    </label>
                    <ul className="small num" style={{ maxHeight: 120, overflow: 'auto', margin: 0, paddingLeft: 18 }}>
                      {plan.duplicates.slice(0, 50).map((d) => <li key={d.row}>{d.row}行目: {d.label}（{d.against === 'existing' ? '登録済み' : 'ファイル内'}）</li>)}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <div className="section-title">読めなかった行 {plan.errors.length}件</div>
                {plan.errors.length === 0 ? (
                  <div className="muted small">すべての行を読めました。</div>
                ) : (
                  <ul className="small" style={{ maxHeight: 150, overflow: 'auto', margin: 0, paddingLeft: 18 }}>
                    {plan.errors.slice(0, 100).map((e) => <li key={e.row}><span className="num">{e.row}</span>行目: {e.message}</li>)}
                  </ul>
                )}
                <div className="muted small" style={{ marginTop: 4 }}>読めなかった行は取り込みません。</div>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
