// 設定・データ: エクスポート（JSON/CSV）、インポート（JSON復元、Excel/CSV取り込み）、費目の編集。
import { useEffect, useRef, useState } from 'react';
import { Card, Modal } from '../components/ui';
import { BackupError, householdCsv, parseBackup, ticketsCsv, toBackupJson } from '../domain/backup';
import { yen } from '../domain/format';
import { newId } from '../domain/ticket';
import { EMPTY_SNAPSHOT, KEIBA_CATEGORY, type Category, type EntryKind, type Snapshot } from '../domain/types';
import { saveTextFile, stamp } from '../lib/files';
import { useStore } from '../state/store';
import { ImportWizard } from './ImportWizard';

export function Settings() {
  const { data, repo, toast, confirm, replaceAll, loadSample } = useStore();
  const [location, setLocation] = useState('');
  const [restore, setRestore] = useState<{ snap: Snapshot; fileName: string } | null>(null);
  const [wizard, setWizard] = useState(false);
  const jsonInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    repo?.location().then(setLocation).catch(() => setLocation('不明'));
  }, [repo]);

  async function exportFile(kind: 'json' | 'tickets' | 'household') {
    try {
      const s = stamp();
      const path =
        kind === 'json'
          ? await saveTextFile(`bakencho-backup-${s}.json`, toBackupJson(data, new Date().toISOString()), { name: 'JSON', extensions: ['json'] })
          : kind === 'tickets'
            ? await saveTextFile(`bakencho-tickets-${s}.csv`, ticketsCsv(data), { name: 'CSV', extensions: ['csv'] })
            : await saveTextFile(`bakencho-household-${s}.csv`, householdCsv(data), { name: 'CSV', extensions: ['csv'] });
      if (path) toast(`書き出しました: ${path}`);
    } catch (e) {
      toast(`書き出しに失敗しました: ${String(e)}`, 'error');
    }
  }

  async function onPickJson(file: File) {
    try {
      const snap = parseBackup(await file.text(), new Date().toISOString());
      setRestore({ snap, fileName: file.name });
    } catch (e) {
      toast(e instanceof BackupError ? `復元できません: ${e.message}` : `読み込みに失敗しました: ${String(e)}`, 'error');
    }
  }

  async function doRestore() {
    if (!restore) return;
    await replaceAll(restore.snap);
    setRestore(null);
    toast(`復元しました（レース${restore.snap.races.length}件・票${restore.snap.tickets.length}件）`);
  }

  async function wipe() {
    const ok = await confirm({
      title: 'すべてのデータを削除',
      message: <>レース{data.races.length}件・票{data.tickets.length}件・家計簿{data.household.length}件をすべて削除します。費目と取り込み設定は残ります。<br />先にJSONでバックアップを書き出しておくことをおすすめします。</>,
      confirmLabel: 'すべて削除する',
      danger: true,
    });
    if (ok) {
      await replaceAll({ ...EMPTY_SNAPSHOT, categories: data.categories, mappings: data.mappings });
      toast('すべてのデータを削除しました');
    }
  }

  async function sample() {
    if (data.races.length > 0 || data.household.length > 0) {
      const ok = await confirm({
        title: 'サンプルデータに置き換え',
        message: '今のレース・票・家計簿を削除して、サンプルデータに置き換えます。',
        confirmLabel: '置き換える',
        danger: true,
      });
      if (!ok) return;
    }
    await loadSample();
    toast('サンプルデータを入れました');
  }

  const pending = data.tickets.filter((t) => t.payout === null).length;

  return (
    <>
      <Card title="データの保存先">
        <dl className="dl">
          <dt>保存先</dt><dd>{location}</dd>
          <dt>件数</dt><dd>レース {data.races.length}件 ／ 票 {data.tickets.length}件（未確定 {pending}）／ 家計簿（手入力）{data.household.length}件</dd>
        </dl>
        <div className="muted small" style={{ marginTop: 8 }}>
          データはこのパソコンの中だけに保存されます。バックアップは下の「JSONを書き出す」で手動で取ってください（ファイルをクラウドドライブに置けば別のパソコンへ持ち出せます）。
        </div>
      </Card>

      <div className="two">
        <Card title="エクスポート">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <button className="btn primary" onClick={() => void exportFile('json')}>JSONを書き出す（バックアップ・復元用）</button>
            <button className="btn" onClick={() => void exportFile('tickets')}>馬券のCSVを書き出す</button>
            <button className="btn" onClick={() => void exportFile('household')}>家計簿のCSVを書き出す（競馬の自動行を含む）</button>
            <div className="muted small">CSVはExcelでそのまま開けます（UTF-8 BOM付き）。</div>
          </div>
        </Card>
        <Card title="インポート">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <button className="btn primary" onClick={() => setWizard(true)}>Excel / CSV から取り込む…</button>
            <button className="btn" onClick={() => jsonInput.current?.click()}>JSONから復元する…</button>
            <input
              ref={jsonInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void onPickJson(f);
              }}
            />
            <div className="muted small">JSON復元は今のデータを置き換えます。ブラウザ版プロトタイプのバックアップJSONも読み込めます。</div>
          </div>
        </Card>
      </div>

      <CategoryEditor />

      <Card title="サンプル・初期化">
        <div className="actions">
          <button className="btn" onClick={() => void sample()}>サンプルデータを入れる</button>
          <span className="spacer" />
          <button className="btn danger" onClick={() => void wipe()}>すべてのデータを削除…</button>
        </div>
      </Card>

      {restore && (
        <Modal
          title="JSONから復元"
          onClose={() => setRestore(null)}
          footer={<><span className="spacer" /><button className="btn" onClick={() => setRestore(null)}>キャンセル</button><button className="btn danger solid" onClick={() => void doRestore()}>置き換えて復元</button></>}
        >
          <div>「{restore.fileName}」の内容で、今のデータを<b>置き換えます</b>。</div>
          <dl className="dl">
            <dt>レース</dt><dd>{restore.snap.races.length}件（今 {data.races.length}件）</dd>
            <dt>票</dt><dd>{restore.snap.tickets.length}件（未確定 {restore.snap.tickets.filter((t) => t.payout === null).length}）（今 {data.tickets.length}件）</dd>
            <dt>投資合計</dt><dd>{yen(restore.snap.tickets.reduce((s, t) => s + t.stake, 0))}</dd>
            <dt>家計簿</dt><dd>{restore.snap.household.length}件（今 {data.household.length}件）</dd>
            <dt>費目</dt><dd>{restore.snap.categories.length}件</dd>
          </dl>
        </Modal>
      )}
      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
    </>
  );
}

function CategoryEditor() {
  const { data, setCategories, confirm, toast } = useStore();
  const [newName, setNewName] = useState<Record<EntryKind, string>>({ expense: '', income: '' });
  const sorted = [...data.categories].sort((a, b) => a.sort_order - b.sort_order);

  const persist = (list: Category[]) => setCategories(list.map((c, i) => ({ ...c, sort_order: i })));

  function validName(name: string, kind: EntryKind, selfId?: string): string | null {
    const n = name.trim();
    if (!n) return '費目名を入力してください';
    if (n === KEIBA_CATEGORY) return '「競馬」は予約名のため使えません';
    if (data.categories.some((c) => c.kind === kind && c.name === n && c.id !== selfId)) return '同じ名前の費目があります';
    return null;
  }

  async function add(kind: EntryKind) {
    const err = validName(newName[kind], kind);
    if (err) return toast(err, 'error');
    await persist([...sorted, { id: newId(), name: newName[kind].trim(), kind, sort_order: sorted.length }]);
    setNewName((s) => ({ ...s, [kind]: '' }));
  }

  async function rename(c: Category, name: string) {
    if (name.trim() === c.name) return;
    const err = validName(name, c.kind, c.id);
    if (err) return toast(err, 'error');
    await persist(sorted.map((x) => (x.id === c.id ? { ...x, name: name.trim() } : x)));
    const used = data.household.filter((h) => h.kind === c.kind && h.category === c.name).length;
    if (used) toast(`費目名を変更しました（既存の明細${used}件は「${c.name}」のままです）`);
  }

  async function move(c: Category, dir: -1 | 1) {
    const same = sorted.filter((x) => x.kind === c.kind);
    const i = same.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    const a = sorted.indexOf(same[i]), b = sorted.indexOf(same[j]);
    const next = [...sorted];
    [next[a], next[b]] = [next[b], next[a]];
    await persist(next);
  }

  async function remove(c: Category) {
    const used = data.household.filter((h) => h.kind === c.kind && h.category === c.name).length;
    const ok = await confirm({
      title: '費目を削除',
      message: <>費目「{c.name}」を削除します。{used > 0 && <>この費目の明細{used}件は残り、費目名もそのまま表示されます。</>}</>,
      confirmLabel: '削除する',
      danger: true,
    });
    if (ok) await persist(sorted.filter((x) => x.id !== c.id));
  }

  return (
    <Card title="費目の編集">
      <div className="two">
        {(['expense', 'income'] as EntryKind[]).map((kind) => {
          const list = sorted.filter((c) => c.kind === kind);
          return (
            <div key={kind}>
              <div className="section-title">{kind === 'expense' ? '支出の費目' : '収入の費目'}</div>
              <table className="grid">
                <tbody>
                  <tr className="auto"><td>競馬 <span className="badge auto">自動・予約名</span></td><td></td></tr>
                  {list.map((c, i) => (
                    <tr key={c.id}>
                      <td><input defaultValue={c.name} aria-label="費目名" onBlur={(e) => void rename(c, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ border: 0, background: 'transparent', padding: 0 }} /></td>
                      <td className="r nowrap" style={{ width: 110 }}>
                        <button className="btn ghost sm" disabled={i === 0} onClick={() => void move(c, -1)} aria-label="上へ">↑</button>
                        <button className="btn ghost sm" disabled={i === list.length - 1} onClick={() => void move(c, 1)} aria-label="下へ">↓</button>
                        <button className="btn ghost sm" onClick={() => void remove(c)} aria-label="削除">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 6 }}>
                <input placeholder="新しい費目" value={newName[kind]} onChange={(e) => setNewName((s) => ({ ...s, [kind]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && void add(kind)} />
                <button className="btn" style={{ flex: 'none' }} onClick={() => void add(kind)}>追加</button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
