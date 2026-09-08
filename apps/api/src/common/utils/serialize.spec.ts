import { Decimal } from '@prisma/client/runtime/library';

import { serialize, toBigInt } from './serialize';

describe('serialize', () => {
  it('converts BigInt to a plain number, which JSON.stringify cannot do itself', () => {
    expect(() => JSON.stringify({ id: 1n })).toThrow();
    expect(serialize({ id: 1n })).toEqual({ id: 1 });
    expect(JSON.stringify(serialize({ id: 42n }))).toBe('{"id":42}');
  });

  it('converts Prisma Decimal to a number rather than leaking its internals', () => {
    const result = serialize({ gross: new Decimal('73412.50') }) as unknown as { gross: number };
    expect(result.gross).toBe(73412.5);
    expect(typeof result.gross).toBe('number');
  });

  it('walks nested objects and arrays', () => {
    const input = {
      employee: { id: 7n, salary: new Decimal('1000') },
      payslips: [{ id: 1n, net: new Decimal('900.25') }],
    };
    expect(serialize(input)).toEqual({
      employee: { id: 7, salary: 1000 },
      payslips: [{ id: 1, net: 900.25 }],
    });
  });

  it('renders Date as an ISO string', () => {
    const date = new Date('2026-09-08T06:00:00.000Z');
    expect(serialize({ at: date })).toEqual({ at: '2026-09-08T06:00:00.000Z' });
  });

  it('preserves null and undefined rather than coercing them', () => {
    expect(serialize({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });

  it('leaves ordinary scalars alone', () => {
    expect(serialize({ n: 1, s: 'x', b: true })).toEqual({ n: 1, s: 'x', b: true });
  });
});

describe('toBigInt', () => {
  it('accepts a numeric string', () => {
    expect(toBigInt('123')).toBe(123n);
  });

  /*
   * The reference system fired live requests to /undefined and /null
   * because it built URLs from unvalidated client state. These are the
   * exact inputs that must not get through.
   */
  it.each(['undefined', 'null', '', 'NaN', '1e5', '-1', '1.5', ' 1 ; DROP TABLE employee'])(
    'rejects %p',
    (value) => {
      expect(() => toBigInt(value)).toThrow(/Invalid id/);
    },
  );

  it('passes a BigInt straight through', () => {
    expect(toBigInt(9n)).toBe(9n);
  });
});
