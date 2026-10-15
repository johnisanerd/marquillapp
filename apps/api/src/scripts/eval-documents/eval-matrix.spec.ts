import { briefsForSystem, buildLongBriefPrompt, EVAL_BRIEFS } from './briefs';
import { buildEvalMatrix, switchTarget } from './eval-matrix';

const SYSTEMS = [
  { id: 'margin', maxPages: 15 },
  { id: 'afterglow', maxPages: 12 },
  { id: 'broadside', maxPages: 12 },
  { id: 'colophon', maxPages: 12 },
  { id: 'overprint', maxPages: 12 },
  { id: 'schematic', maxPages: 15 },
];
const SYSTEM_IDS = SYSTEMS.map(({ id }) => id);

describe('buildEvalMatrix', () => {
  it('should build 18 initial runs, one per system and brief', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    expect(initial).toHaveLength(18);
    for (const designSystemId of SYSTEM_IDS) {
      expect(
        initial.filter((entry) => entry.designSystemId === designSystemId),
      ).toHaveLength(3);
    }
  });

  it('should request min(15, pages.max) pages for the long brief and key the run by that count', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    const pagesOf = (id: string) =>
      initial.filter((e) => e.designSystemId === id).map((e) => e.pages);
    expect(pagesOf('margin')).toEqual([4, 8, 15]);
    expect(pagesOf('schematic')).toEqual([4, 8, 15]);
    expect(pagesOf('afterglow')).toEqual([4, 8, 12]);
    expect(initial.map((e) => e.key)).toContain('afterglow/12p');
    expect(initial.map((e) => e.key)).not.toContain('afterglow/15p');
    expect(initial.find((e) => e.key === 'afterglow/12p')?.prompt).toContain(
      'exactly 12 pages',
    );
    expect(initial.find((e) => e.key === 'margin/15p')?.prompt).toContain(
      'exactly 15 pages',
    );
  });

  it('should key every initial run by system and page count', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    expect(initial[0].key).toBe('margin/4p');
    expect(new Set(initial.map((entry) => entry.key)).size).toBe(18);
  });

  it('should hand each run a brief that asks for exactly its page count', () => {
    const { initial } = buildEvalMatrix(SYSTEMS);

    for (const entry of initial) {
      expect(entry.prompt).toContain(`exactly ${entry.pages} pages`);
    }
  });

  it('should keep systems in the order given', () => {
    const { initial } = buildEvalMatrix([
      { id: 'b', maxPages: 15 },
      { id: 'a', maxPages: 15 },
    ]);

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
    expect(switchTarget(SYSTEM_IDS, 'afterglow')).toBe('margin');
    expect(switchTarget(SYSTEM_IDS, 'margin')).toBe('afterglow');
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

describe('briefsForSystem', () => {
  it('should leave the briefs alone for a system that allows 15 pages', () => {
    expect(briefsForSystem(15)).toEqual(EVAL_BRIEFS);
  });

  it('should cap only the long brief at pages.max', () => {
    const briefs = briefsForSystem(12);

    expect(briefs.map((brief) => brief.pages)).toEqual([4, 8, 12]);
    expect(briefs.slice(0, 2)).toEqual(EVAL_BRIEFS.slice(0, 2));
    expect(briefs[2].prompt).toContain('A 12-page LinkedIn document');
  });
});

describe('buildLongBriefPrompt', () => {
  const steps = (prompt: string) =>
    /in order: (.*?)\. Give each step/.exec(prompt)?.[1].split(', ') ?? [];

  it('should be the ten-step brief at 15 pages', () => {
    const prompt = buildLongBriefPrompt(15);

    expect(prompt).toBe(EVAL_BRIEFS[2].prompt);
    expect(prompt).toContain('Pages 4 to 13 cover ten steps');
    expect(steps(prompt)).toHaveLength(10);
  });

  it.each([12, 13, 14, 15])(
    'should add up to %i pages with one page per step',
    (pages) => {
      const prompt = buildLongBriefPrompt(pages);
      const stepCount = steps(prompt).length;

      expect(prompt).toContain(`A ${pages}-page`);
      expect(prompt).toContain(`exactly ${pages} pages`);
      expect(prompt).toContain(`Pages 4 to ${3 + stepCount} cover`);
      expect(prompt).toContain(`Page ${pages - 1} summarises`);
      expect(prompt).toContain(`Page ${pages} invites`);
      expect(3 + stepCount + 2).toBe(pages);
    },
  );

  it('should keep the launch and the retrospective in the 12-page guide and never mention 15', () => {
    const prompt = buildLongBriefPrompt(12);

    expect(prompt).toContain('cover seven steps');
    expect(prompt).toContain('summarises the seven steps');
    expect(steps(prompt)).toEqual([
      'define the one outcome',
      'write the one-sentence pitch',
      'brief sales and support',
      'run a dry rehearsal',
      'launch',
      'watch the first 48 hours',
      'hold a retrospective',
    ]);
    expect(prompt).not.toMatch(/15|\bten\b/);
  });

  it('should refuse a page count the guide cannot be built for', () => {
    expect(() => buildLongBriefPrompt(11)).toThrow(RangeError);
    expect(() => buildLongBriefPrompt(16)).toThrow(RangeError);
  });
});
