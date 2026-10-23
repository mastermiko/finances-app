import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  assertMinor,
  currencyExponent,
  isMinorAmount,
  minorFromNumber,
  minorToDecimalString,
  minorToNumber,
  money,
  negate,
  percentagesLargestRemainder,
  roundDecimalStringToMinor,
  subtract,
  sumMinor,
} from './money';

describe('Money', () => {
  it('adds, subtracts and negates in minor units', () => {
    expect(add(money(150), money(-50))).toEqual(money(100));
    expect(subtract(money(150), money(50))).toEqual(money(100));
    expect(negate(money(0)).amountMinor).toBe(0);
    expect(Object.is(negate(money(0)).amountMinor, -0)).toBe(false);
    expect(negate(money(12)).amountMinor).toBe(-12);
  });

  it('refuses mixed currencies and non-integers', () => {
    expect(() => add(money(1, 'EUR'), money(1, 'USD'))).toThrow(TypeError);
    expect(() => money(1.5)).toThrow(RangeError);
    expect(() => assertMinor(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(isMinorAmount(12)).toBe(true);
    expect(isMinorAmount('12')).toBe(false);
    expect(sumMinor([1, 2, 3])).toBe(6);
  });

  it('knows currency exponents', () => {
    expect(currencyExponent('EUR')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });

  it.each([
    [-3.789999999999992, -379],
    [-1.6500000000000001, -165],
    [243.96999999999989, 24397],
    [-135.59000000000006, -13559],
    [0.005, 1],
    [-0.005, -1],
    [1e21, 100000000000000000000000],
    [1.005, 101],
    [0, 0],
  ])('minorFromNumber(%d) = %d', (value, expected) => {
    if (Math.abs(expected) > Number.MAX_SAFE_INTEGER) {
      expect(() => minorFromNumber(value)).toThrow(RangeError);
    } else {
      expect(minorFromNumber(value)).toBe(expected);
    }
  });

  it('rounds decimal strings half away from zero', () => {
    expect(roundDecimalStringToMinor('12.345', 2)).toBe(1235);
    expect(roundDecimalStringToMinor('-12.345', 2)).toBe(-1235);
    expect(roundDecimalStringToMinor('1.5e-2', 2)).toBe(2);
    expect(roundDecimalStringToMinor('3e2', 2)).toBe(30000);
    expect(() => roundDecimalStringToMinor('abc', 2)).toThrow(RangeError);
    expect(() => roundDecimalStringToMinor('.', 2)).toThrow(RangeError);
  });

  it('formats minor units as machine decimals', () => {
    expect(minorToDecimalString(-1250)).toBe('-12.50');
    expect(minorToDecimalString(5)).toBe('0.05');
    expect(minorToDecimalString(123, 'JPY')).toBe('123');
    expect(minorToNumber(-1250)).toBe(-12.5);
  });

  it('round-trips cents through decimal strings (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (cents) => {
        expect(roundDecimalStringToMinor(minorToDecimalString(cents), 2)).toBe(cents);
        expect(minorFromNumber(minorToNumber(cents))).toBe(cents);
      }),
    );
  });

  it('largest remainder percentages always add up to 100', () => {
    expect(percentagesLargestRemainder([1, 1, 1])).toEqual([33.4, 33.3, 33.3]);
    expect(percentagesLargestRemainder([0, 0])).toEqual([0, 0]);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 12 }),
        (parts) => {
          const result = percentagesLargestRemainder(parts);
          expect(Math.round(result.reduce((a, b) => a + b, 0) * 10)).toBe(1000);
        },
      ),
    );
  });
});
