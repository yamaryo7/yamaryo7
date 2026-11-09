// ファイルの書き出し・読み込み。Tauri上では保存ダイアログ、ブラウザではダウンロード。
import { isTauri } from '../db/repo';
import { parseCsv } from '../domain/csv';
import type { Cell } from '../domain/importer';

export async function saveTextFile(defaultName: string, content: string, filter: { name: string; extensions: string[] }): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: defaultName, filters: [filter] });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  }
  const blob = new Blob([content], { type: filter.extensions[0] === 'json' ? 'application/json' : 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

export interface SheetTable {
  name: string;
  rows: Cell[][];
}

/** .xlsx（全シート）または .csv（Shift_JIS/UTF-8を自動判定）を表にする。 */
export async function readTableFile(file: File): Promise<SheetTable[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown as Cell[][] }));
  }
  if (lower.endsWith('.xls')) {
    throw new Error('古い形式（.xls）は読めません。Excelで「名前を付けて保存」→「Excelブック（.xlsx）」にしてから選んでください。');
  }
  const buf = await file.arrayBuffer();
  return [{ name: file.name, rows: parseCsv(decodeText(buf)) }];
}

/** UTF-8として不正ならShift_JIS（Excelの既定のCSV）として読む */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
