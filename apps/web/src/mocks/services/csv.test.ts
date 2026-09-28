import { expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

it('neutralises formula prefixes and quotes separators', () => {
  expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  expect(csvCell('-2+3')).toBe("'-2+3");
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell(88.75)).toBe('88.75');
  expect(toCsv(['a'], [['@SUM(A1)']])).toBe("a\r\n'@SUM(A1)\r\n");
});
