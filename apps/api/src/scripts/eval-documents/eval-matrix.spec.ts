import { EVAL_BRIEFS } from './briefs';
import { buildEvalMatrix, switchTarget } from './eval-matrix';

const SYSTEMS = [
  'margin',
  'afterglow',
  'broadside',
  'colophon',
  'overprint',
  'schematic',
];

describe('buildEvalMatrix', () => {
  it('should build 18 initial runs, one per system and brief', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    expect(initial).toHaveLength(18);
    for (const designSystemId of SYSTEMS) {
      expect(
        initial
          .filter((entry) => entry.designSystemId === designSystemId)
          .map((entry) => entry.pages),
      ).toEqual([4, 8, 15]);
    }
  });

  it('should key every initial run by system and page count', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    expect(initial[0].key).toBe('margin/4p');
    expect(new Set(initial.map((entry) => entry.key)).size).toBe(18);
  });

  it('should hand each run the brief for its page count', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    for (const entry of initial) {
      expect(entry.prompt).toBe(
        EVAL_BRIEFS.find((brief) => brief.pages === entry.pages)?.prompt,
      );
    }
  });

  it('should keep systems in the order given', () => {
    const { initial } = buildEvalMatrix(['b', 'a']);

    expect(initial.map((entry) => entry.designSystemId)).toEqual([
      'b',
      'b',
      'b',
      'a',
      'a',
      'a',
    ]);
  });

  it('should add one refine that carries the pin and one that switches system', () => {
    const { refine } = buildEvalMatrix(SYSTEMS);

    expect(refine.map((entry) => entry.mode)).toEqual(['carry', 'switch']);
    expect(refine.every((entry) => entry.feedback.length > 0)).toBe(true);
  });

  it('should total 20 runs', () => {
    const { initial, refine } = buildEvalMatrix(SYSTEMS);

    expect(initial.length + refine.length).toBe(20);
  });
});

describe('switchTarget', () => {
  it('should pick the first system that is not the source', () => {
    expect(switchTarget(SYSTEMS, 'afterglow')).toBe('margin');
    expect(switchTarget(SYSTEMS, 'margin')).toBe('afterglow');
  });

  it('should return undefined when there is no other system', () => {
    expect(switchTarget(['margin'], 'margin')).toBeUndefined();
  });
});

describe('EVAL_BRIEFS', () => {
  it('should cover 4, 8 and 15 pages and fit the create DTO', () => {
    expect(EVAL_BRIEFS.map((brief) => brief.pages)).toEqual([4, 8, 15]);
    for (const brief of EVAL_BRIEFS) {
      expect(brief.prompt.length).toBeLessThanOrEqual(2000);
      expect(brief.prompt).toContain(`exactly ${brief.pages} pages`);
    }
  });
});
