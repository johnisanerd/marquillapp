import { parseEvalArgs } from './eval-options';

describe('parseEvalArgs', () => {
  it('should default to two runs at once and a two-hour budget', () => {
    expect(parseEvalArgs([])).toEqual({
      concurrency: 2,
      timeoutMs: 120 * 60 * 1000,
      pollMs: 10_000,
      jsonPath: undefined,
      cleanup: false,
    });
  });

  it('should read flags given as separate values', () => {
    expect(
      parseEvalArgs([
        '--concurrency',
        '4',
        '--timeout-min',
        '30',
        '--json',
        'out.json',
      ]),
    ).toMatchObject({
      concurrency: 4,
      timeoutMs: 30 * 60 * 1000,
      jsonPath: 'out.json',
    });
  });

  it('should read flags given with an equals sign', () => {
    expect(
      parseEvalArgs(['--concurrency=3', '--json=/tmp/a=b.json']),
    ).toMatchObject({ concurrency: 3, jsonPath: '/tmp/a=b.json' });
  });

  it('should ignore a bare -- separator', () => {
    expect(parseEvalArgs(['--', '--concurrency', '3']).concurrency).toBe(3);
  });

  it('should accept a fractional timeout', () => {
    expect(parseEvalArgs(['--timeout-min=0.5']).timeoutMs).toBe(30_000);
  });

  it.each([['0'], ['-1'], ['1.5'], ['two']])(
    'should reject concurrency %s',
    (value) => {
      expect(() => parseEvalArgs(['--concurrency', value])).toThrow(
        /--concurrency/,
      );
    },
  );

  it.each([['0'], ['-5'], ['soon']])('should reject timeout %s', (value) => {
    expect(() => parseEvalArgs(['--timeout-min', value])).toThrow(
      /--timeout-min/,
    );
  });

  it('should reject an unknown flag and print the usage', () => {
    expect(() => parseEvalArgs(['--fast'])).toThrow(/Unknown argument: --fast/);
    expect(() => parseEvalArgs(['--fast'])).toThrow(/Usage:/);
  });

  it('should reject a flag with no value', () => {
    expect(() => parseEvalArgs(['--json'])).toThrow(/--json needs a value/);
  });

  describe('--cleanup', () => {
    it('should select cleanup mode', () => {
      expect(parseEvalArgs(['--cleanup']).cleanup).toBe(true);
    });

    it.each([
      [['--cleanup', '--concurrency', '3']],
      [['--timeout-min=10', '--cleanup']],
      [['--cleanup', '--json', 'out.json']],
    ])('should reject --cleanup combined with matrix flags %j', (argv) => {
      expect(() => parseEvalArgs(argv)).toThrow(/--cleanup cannot be combined/);
    });

    it('should not take a value', () => {
      expect(() => parseEvalArgs(['--cleanup=yes'])).toThrow(/--cleanup/);
    });
  });
});
