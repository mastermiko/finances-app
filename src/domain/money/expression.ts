/**
 * Amount expression evaluator (Shunting-yard), exact decimal arithmetic.
 *
 * Accepted input (mirrors the spreadsheet TryParseCalc helper):
 *   12,5+3 · 6x15 · -(10+5,3) · 120+300-15/3 · =-94.56-22 · 1 234,56
 * - "," and "." are both decimal separators, spaces (incl. NBSP) are ignored.
 * - Operators: + - * x X × / ÷ and parentheses, unary + and -.
 * - A leading "=" (spreadsheet formula) is accepted and ignored.
 * Never uses eval/Function. Arithmetic uses BigInt rationals, so 0.55*3 is exactly 1.65.
 */

export type ExpressionErrorCode =
  | 'empty'
  | 'tooLong'
  | 'invalidCharacter'
  | 'invalidNumber'
  | 'unbalancedParentheses'
  | 'syntax'
  | 'divisionByZero'
  | 'outOfRange';

export interface ExpressionError {
  readonly code: ExpressionErrorCode;
  /** 0-based index in the original input, when relevant. */
  readonly position?: number;
}

export type ExpressionResult =
  | {
      readonly ok: true;
      readonly minor: number;
      readonly isExpression: boolean;
      readonly normalized: string;
    }
  | { readonly ok: false; readonly error: ExpressionError };

export const MAX_EXPRESSION_LENGTH = 200;
const MAX_ABS_MINOR = 10n ** 15n; // 10 000 000 000 000,00 — far beyond any personal amount

interface Rational {
  readonly n: bigint;
  readonly d: bigint; // always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new ExpressionFailure('divisionByZero');
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: (sign * d) / g };
}

class ExpressionFailure extends Error {
  constructor(
    readonly code: ExpressionErrorCode,
    readonly position?: number,
  ) {
    super(code);
  }
}

type Token =
  | { readonly type: 'num'; readonly value: Rational; readonly pos: number }
  | { readonly type: 'op'; readonly op: '+' | '-' | '*' | '/'; readonly pos: number }
  | { readonly type: 'neg' | 'pos'; readonly pos: number }
  | { readonly type: 'lparen' | 'rparen'; readonly pos: number };

const SPACE_RE = /[\s   ]/;
const MUL_CHARS = new Set(['*', 'x', 'X', '×', '·']);
const DIV_CHARS = new Set(['/', '÷', ':']);
const MINUS_CHARS = new Set(['-', '−', '–']);

function parseNumber(text: string, pos: number): Rational {
  const parts = text.split(/[.,]/);
  if (parts.length > 2) throw new ExpressionFailure('invalidNumber', pos);
  const intPart = parts[0] ?? '';
  const fracPart = parts[1] ?? '';
  if (intPart === '' && fracPart === '') throw new ExpressionFailure('invalidNumber', pos);
  const scale = 10n ** BigInt(fracPart.length);
  return rational(BigInt((intPart || '0') + fracPart), scale);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const prevIsOperand = (): boolean => {
    const prev = tokens[tokens.length - 1];
    return prev !== undefined && (prev.type === 'num' || prev.type === 'rparen');
  };
  while (i < input.length) {
    const ch = input.charAt(i);
    if (SPACE_RE.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.,]/.test(ch)) {
      const start = i;
      let raw = '';
      while (i < input.length) {
        const c = input.charAt(i);
        if (/[0-9.,]/.test(c)) raw += c;
        else if (!SPACE_RE.test(c)) break;
        i += 1;
      }
      if (prevIsOperand()) throw new ExpressionFailure('syntax', start);
      tokens.push({ type: 'num', value: parseNumber(raw, start), pos: start });
      continue;
    }
    if (ch === '(') {
      if (prevIsOperand()) {
        // implicit multiplication: 2(3+4)
        tokens.push({ type: 'op', op: '*', pos: i });
      }
      tokens.push({ type: 'lparen', pos: i });
    } else if (ch === ')') {
      tokens.push({ type: 'rparen', pos: i });
    } else if (ch === '+' || MINUS_CHARS.has(ch)) {
      const isMinus = ch !== '+';
      if (prevIsOperand()) tokens.push({ type: 'op', op: isMinus ? '-' : '+', pos: i });
      else tokens.push({ type: isMinus ? 'neg' : 'pos', pos: i });
    } else if (MUL_CHARS.has(ch)) {
      tokens.push({ type: 'op', op: '*', pos: i });
    } else if (DIV_CHARS.has(ch)) {
      tokens.push({ type: 'op', op: '/', pos: i });
    } else {
      throw new ExpressionFailure('invalidCharacter', i);
    }
    i += 1;
  }
  return tokens;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, pos: 3 } as const;

interface StackOp {
  readonly kind: '+' | '-' | '*' | '/' | 'neg' | 'pos' | '(';
  readonly pos: number;
}

function apply(op: StackOp['kind'], values: Rational[], pos: number): void {
  if (op === 'neg' || op === 'pos') {
    const a = values.pop();
    if (!a) throw new ExpressionFailure('syntax', pos);
    values.push(op === 'neg' ? { n: -a.n, d: a.d } : a);
    return;
  }
  const b = values.pop();
  const a = values.pop();
  if (!a || !b) throw new ExpressionFailure('syntax', pos);
  switch (op) {
    case '+':
      values.push(rational(a.n * b.d + b.n * a.d, a.d * b.d));
      return;
    case '-':
      values.push(rational(a.n * b.d - b.n * a.d, a.d * b.d));
      return;
    case '*':
      values.push(rational(a.n * b.n, a.d * b.d));
      return;
    case '/':
      if (b.n === 0n) throw new ExpressionFailure('divisionByZero', pos);
      values.push(rational(a.n * b.d, a.d * b.n));
      return;
    default:
      throw new ExpressionFailure('syntax', pos);
  }
}

function evaluate(tokens: readonly Token[]): Rational {
  const values: Rational[] = [];
  const ops: StackOp[] = [];
  let expectOperand = true;
  for (const token of tokens) {
    switch (token.type) {
      case 'num':
        if (!expectOperand) throw new ExpressionFailure('syntax', token.pos);
        values.push(token.value);
        expectOperand = false;
        break;
      case 'neg':
      case 'pos':
        if (!expectOperand) throw new ExpressionFailure('syntax', token.pos);
        ops.push({ kind: token.type, pos: token.pos });
        break;
      case 'lparen':
        if (!expectOperand) throw new ExpressionFailure('syntax', token.pos);
        ops.push({ kind: '(', pos: token.pos });
        break;
      case 'rparen': {
        if (expectOperand) throw new ExpressionFailure('syntax', token.pos);
        let top = ops.pop();
        while (top && top.kind !== '(') {
          apply(top.kind, values, top.pos);
          top = ops.pop();
        }
        if (!top) throw new ExpressionFailure('unbalancedParentheses', token.pos);
        break;
      }
      case 'op': {
        if (expectOperand) throw new ExpressionFailure('syntax', token.pos);
        const prec = PRECEDENCE[token.op];
        let top = ops[ops.length - 1];
        while (top && top.kind !== '(' && PRECEDENCE[top.kind] >= prec) {
          ops.pop();
          apply(top.kind, values, top.pos);
          top = ops[ops.length - 1];
        }
        ops.push({ kind: token.op, pos: token.pos });
        expectOperand = true;
        break;
      }
    }
  }
  if (expectOperand) {
    const last = tokens[tokens.length - 1];
    throw new ExpressionFailure('syntax', last ? last.pos : 0);
  }
  while (ops.length > 0) {
    const top = ops.pop();
    if (!top) break;
    if (top.kind === '(') throw new ExpressionFailure('unbalancedParentheses', top.pos);
    apply(top.kind, values, top.pos);
  }
  const result = values.pop();
  if (!result || values.length > 0) throw new ExpressionFailure('syntax');
  return result;
}

/** Rounds a rational to minor units, half away from zero (spreadsheet ROUND semantics). */
function toMinor(value: Rational, exponent: number): number {
  const scaled = value.n * 10n ** BigInt(exponent);
  const negative = scaled < 0n;
  const absN = negative ? -scaled : scaled;
  let q = absN / value.d;
  const r = absN % value.d;
  if (r * 2n >= value.d) q += 1n;
  if (q > MAX_ABS_MINOR) throw new ExpressionFailure('outOfRange');
  const out = Number(negative ? -q : q);
  return out === 0 ? 0 : out;
}

/**
 * Evaluates an amount expression and returns its value in minor units.
 * @param exponent number of minor digits of the currency (2 for EUR)
 */
export function evaluateAmountExpression(input: string, exponent = 2): ExpressionResult {
  const trimmed = input.trim().replace(/^=/, '').trim();
  if (trimmed.length === 0) return { ok: false, error: { code: 'empty' } };
  if (input.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: { code: 'tooLong' } };
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return { ok: false, error: { code: 'empty' } };
    const value = evaluate(tokens);
    const minor = toMinor(value, exponent);
    const isExpression = tokens.some(
      (t) => t.type === 'op' || t.type === 'lparen' || (t.type === 'neg' && tokens.length > 2),
    );
    return { ok: true, minor, isExpression, normalized: trimmed.replace(/[\s   ]+/g, '') };
  } catch (error) {
    if (error instanceof ExpressionFailure) {
      return {
        ok: false,
        error:
          error.position === undefined
            ? { code: error.code }
            : { code: error.code, position: error.position },
      };
    }
    throw error;
  }
}
