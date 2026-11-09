import { describe, expect, it } from 'vitest';
import { calcPoints, normalizeSelection, selectionPlaceholder } from './points';

describe('点数の自動計算', () => {
  it('通常は1点', () => {
    expect(calcPoints('馬連', '通常', '3-7')).toBe(1);
    expect(calcPoints('馬単', '通常', '3→7')).toBe(1);
    expect(calcPoints('三連単', '通常', '3→7→12')).toBe(1);
    expect(calcPoints('単勝', '通常', '5')).toBe(1);
  });

  it('空欄は決められない（手入力を使う）', () => {
    expect(calcPoints('馬連', 'ボックス', '')).toBeNull();
  });

  it('ボックス', () => {
    expect(calcPoints('馬連', 'ボックス', '3,7,12')).toBe(3);
    expect(calcPoints('ワイド', 'ボックス', '1 2 3 4')).toBe(6);
    expect(calcPoints('馬単', 'ボックス', '3,7,12')).toBe(6);
    expect(calcPoints('三連複', 'ボックス', '3,7,12,14')).toBe(4);
    expect(calcPoints('三連複', 'ボックス', '1,2,3,4,5')).toBe(10);
    expect(calcPoints('三連単', 'ボックス', '1,2,3,4')).toBe(24);
    expect(calcPoints('三連単', 'ボックス', '1,2')).toBeNull(); // 頭数不足
    expect(calcPoints('複勝', 'ボックス', '3,5,7')).toBe(3);
  });

  it('全角・読点・中黒でも数える', () => {
    expect(normalizeSelection('３－７→１２')).toBe('3-7>12');
    expect(calcPoints('三連複', 'ボックス', '３、７、１２・１４')).toBe(4);
  });

  it('流し（1頭軸・2頭軸）', () => {
    expect(calcPoints('馬連', '流し', '3>1,5,8')).toBe(3);
    expect(calcPoints('ワイド', '流し', '3-1,5,8,12')).toBe(4);
    expect(calcPoints('馬単', '流し', '3→1,5,8')).toBe(3);
    expect(calcPoints('三連複', '流し', '3>1,5,8,12')).toBe(6); // C(4,2)
    expect(calcPoints('三連複', '流し', '3,7>1,5,8')).toBe(3);
    expect(calcPoints('三連単', '流し', '3>1,5,8')).toBe(6); // P(3,2)
    expect(calcPoints('三連単', '流し', '3,7>1,5,8')).toBe(3);
    expect(calcPoints('三連単', '流し', '3>7>1,2,5')).toBe(3); // 1着・2着固定
    expect(calcPoints('馬連', '流し', '3>3,5')).toBe(1); // 軸は相手から除く
  });

  it('フォーメーション', () => {
    expect(calcPoints('三連単', 'フォーメーション', '1,2/1,2,5/1,2,5,8')).toBe(8); // 1→2→5,8 / 1→5→2,8 / 2→1→5,8 / 2→5→1,8
    expect(calcPoints('三連複', 'フォーメーション', '1/2,3/2,3,4')).toBe(3); // 1-2-3,1-2-4,1-3-4
    expect(calcPoints('馬単', 'フォーメーション', '3,7/1,3,7')).toBe(4);
    expect(calcPoints('馬連', 'フォーメーション', '3,7/1,3,7')).toBe(3); // 3-7,1-3,1-7
    expect(calcPoints('三連単', 'フォーメーション', '1,2/1,2')).toBeNull(); // 段数不足
  });

  it('WIN5は各レースの頭数の積', () => {
    expect(calcPoints('WIN5', '通常', '1,2/5/3,8/11/4,6')).toBe(8);
    expect(calcPoints('WIN5', '通常', '1/2/3')).toBeNull();
  });

  it('プレースホルダは券種で変わる', () => {
    expect(selectionPlaceholder('馬連', '通常')).toBe('3-7');
    expect(selectionPlaceholder('馬単', '通常')).toBe('3→7');
    expect(selectionPlaceholder('三連複', '通常')).toBe('3-7-12');
  });
});
