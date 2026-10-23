import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateAmountExpression } from './expression';

const ok = (input: string): number => {
  const r = evaluateAmountExpression(input);
  if (!r.ok) throw new Error(`${input}: ${r.error.code}`);
  return r.minor;
};

describe('evaluateAmountExpression', () => {
  it.each([
    ['12,5+3', 1550],
    ['6x15', 9000],
    ['6X15', 9000],
    ['6×15', 9000],
    ['-(10+5,3)', -1530],
    ['120+300-15/3', 41500],
    ['=-94.56-22', -11656],
    ['=-(250-80-25)', -14500],
    ['=-(10+5.3+8.5)', -2380],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['0.55*3', 165],
    ['-(0.45+0.55+1.7*2)', -440],
    ['=-(217.22-213.43)', -379],
    ['10/3', 333],
    ['20/3', 667],
    ['-20/3', -667],
    ['0,005', 1],
    ['-0,005', -1],
    ['2(3+4)', 1400],
    ['+5', 500],
    ['--5', 500],
    ['12.', 1200],
    [',5', 50],
    ['3 ÷ 2', 150],
  ])('%s = %d', (input, expected) => {
    expect(ok(input)).toBe(expected);
  });

  it('flags plain numbers versus expressions', () => {
    const plain = evaluateAmountExpression('12,50');
    const expr = evaluateAmountExpression('12+0,5');
    expect(plain.ok && plain.isExpression).toBe(false);
    expect(expr.ok && expr.isExpression).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['=', 'empty'],
    ['12a', 'invalidCharacter'],
    ['1,2,3', 'invalidNumber'],
    ['(1+2', 'unbalancedParentheses'],
    ['1+2)', 'unbalancedParentheses'],
    ['1+', 'syntax'],
    ['*2', 'syntax'],
    ['5/0', 'divisionByZero'],
    ['5/(2-2)', 'divisionByZero'],
    ['1'.repeat(201), 'tooLong'],
    ['99999999999999999999', 'outOfRange'],
  ])('rejects %j with %s', (input, code) => {
    const r = evaluateAmountExpression(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  });

  it('reports the position of an invalid character', () => {
    const r = evaluateAmountExpression('12+b');
    expect(r).toEqual({ ok: false, error: { code: 'invalidCharacter', position: 3 } });
  });

  it('never uses floating point: sums of cents are exact (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: 1, maxLength: 12 }),
        (cents) => {
          const expr = cents
            .map((c, i) => {
              const abs = Math.abs(c);
              const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
              if (i === 0) return c < 0 ? `-${text}` : text;
              return c < 0 ? `-${text}` : `+${text}`;
            })
            .join('');
          expect(ok(expr)).toBe(cents.reduce((a, b) => a + b, 0));
        },
      ),
    );
  });

  it('multiplication by an integer is exact (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 50 }),
        (cents, n) => {
          const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
          expect(ok(`${text}x${n}`)).toBe(cents * n);
          expect(ok(`${n}*${text}`)).toBe(cents * n);
        },
      ),
    );
  });
});
