// 词牌：库里没有这一列，从题目 / 副题里认（见 src/lib/cipai.ts）
import { cipaiOf, cipaiOfTw, countCipai, isCiKind } from '@/lib/cipai';

const p = (title: string, subtitle = '', titleTw = '', subtitleTw = '') => ({
  title,
  subtitle,
  title_tw: titleTw,
  subtitle_tw: subtitleTw,
});

describe('认词牌', () => {
  it('全宋词：词牌就是题目', () => {
    expect(cipaiOf(p('水调歌头'))).toBe('水调歌头');
    expect(cipaiOf(p('念奴娇·赤壁怀古'))).toBe('念奴娇');
  });

  it('全宋词的「别名・正名」取后段（・ 是 U+30FB，跟 · 不是一件事）', () => {
    // 语料里是『酹江月・念奴娇』：前段别名、后段才是词牌
    expect(cipaiOf(p('酹江月・念奴娇'))).toBe('念奴娇');
    expect(cipaiOf(p('凤栖梧・蝶恋花'))).toBe('蝶恋花');
    expect(cipaiOf(p('木兰花・玉楼春'))).toBe('玉楼春');
    // 别名再多段也只认最后一段
    expect(cipaiOf(p('大江东去・念奴娇'))).toBe('念奴娇');
  });

  it('花间集：副题「卷N·词牌」里带卷次，得剥掉', () => {
    // 词牌与题目一致时副题只有卷次 → 退回题目
    expect(cipaiOf(p('浣溪沙', '卷1'))).toBe('浣溪沙');
    // 两者不一致时副题里才是词牌
    expect(cipaiOf(p('菩萨蛮', '卷1·重叠金'))).toBe('重叠金');
    expect(cipaiOf(p('南乡子', '卷10 南乡子'))).toBe('南乡子');
  });

  it('南唐词：副题就是 rhythmic', () => {
    expect(cipaiOf(p('虞美人', '虞美人'))).toBe('虞美人');
  });

  it('题目为空时退回副题，都没有就是空串', () => {
    expect(cipaiOf(p('', '浣溪沙'))).toBe('浣溪沙');
    expect(cipaiOf(p('', ''))).toBe('');
    expect(cipaiOf(p('   ', '  '))).toBe('');
  });

  it('繁體词牌走同一套规则，只是优先繁体列', () => {
    expect(cipaiOfTw(p('浣溪沙', '', '浣溪沙', ''))).toBe('浣溪沙');
    expect(cipaiOfTw(p('念奴娇·赤壁怀古', '', '念奴嬌·赤壁懷古', ''))).toBe('念奴嬌');
    expect(cipaiOfTw(p('菩萨蛮', '卷1·重叠金', '菩薩蠻', '卷1·重疊金'))).toBe('重疊金');
  });

  it('只有 kind 是「词」的集子才有词牌', () => {
    expect(isCiKind('词')).toBe(true);
    expect(isCiKind(' 词 ')).toBe(true);
    expect(isCiKind('诗')).toBe(false);
    expect(isCiKind('曲')).toBe(false);
    expect(isCiKind('文')).toBe(false);
  });
});

describe('词牌统计', () => {
  const poems = [
    p('水调歌头', '', '水調歌頭', ''),
    p('念奴娇', '', '念奴嬌', ''),
    p('浣溪沙', '', '浣溪沙', ''),
    p('浣溪沙', '', '浣溪沙', ''),
    p('浣溪沙', '', '浣溪沙', ''),
    p('念奴娇', '', '念奴嬌', ''),
    p(''), // 没词牌的空行不参与统计
    p('', ''),
  ];

  it('按作品数降序，同数按词牌名；繁體名与简体不同才存', () => {
    expect(countCipai(poems)).toEqual([
      { name: '浣溪沙', nameTw: undefined, count: 3 },
      { name: '念奴娇', nameTw: '念奴嬌', count: 2 },
      { name: '水调歌头', nameTw: '水調歌頭', count: 1 },
    ]);
  });

  it('繁体列缺失时 nameTw 留空（由页面回退简体）', () => {
    expect(countCipai([p('水调歌头')])).toEqual([{ name: '水调歌头', nameTw: undefined, count: 1 }]);
  });

  it('产物的形状能直接喂给 groupAuthors（作者 / 词牌共用一套分组）', () => {
    const stats = countCipai(poems);
    expect(Object.keys(stats[0]).sort()).toEqual(['count', 'name', 'nameTw']);
  });

  it('空集就是空表', () => {
    expect(countCipai([])).toEqual([]);
  });
});
