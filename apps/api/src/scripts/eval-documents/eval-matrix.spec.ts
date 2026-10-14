import { briefsForSystem, buildLongBriefPrompt, EVAL_BRIEFS } from './briefs';
import { buildEvalMatrix, switchTarget } from './eval-matrix';

const SYSTEMS = [
  'margin',
  'afterglow',
  'broadside',
  'colophon',
  'overprint',
  'schematic',
];

const SYSTEMS_WITH_BOUNDS = [
  { id: 'margin', pages: { min: 2, max: 15 } },
  { id: 'afterglow', pages: { min: 3, max: 12 } },
  { id: 'broadside', pages: { min: 3, max: 12 } },
  { id: 'colophon', pages: { min: 3, max: 12 } },
  { id: 'overprint', pages: { min: 3, max: 12 } },
  { id: 'schematic', pages: { min: 3, max: 15 } },
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

  it('should cap the long brief at pages.max (12 for capped systems, 15 for uncapped)', () => {
    const { initial } = buildEvalMatrix(SYSTEMS_WITH_BOUNDS);

    expect(initial).toHaveLength(18);

    const margin = initial.filter((e) => e.designSystemId === 'margin');
    expect(margin.map((e) => e.requestedPages)).toEqual([4, 8, 15]);
    expect(margin.find((e) => e.key === 'margin/15p')?.prompt).toContain(
      'exactly 15 pages',
    );

    const afterglow = initial.filter((e) => e.designSystemId === 'afterglow');
    expect(afterglow.map((e) => e.requestedPages)).toEqual([4, 8, 12]);
    expect(afterglow.find((e) => e.key === 'afterglow/15p')?.prompt).toContain(
      'exactly 12 pages',
    );
  });

  it('should read bounds from definition.page.pages when present', () => {
    const systems = [
      {
        id: 'afterglow',
        definition: { page: { pages: { min: 3, max: 12 } } },
      },
      {
        id: 'margin',
        definition: { page: { pages: { min: 2, max: 15 } } },
      },
    ];
    const { initial } = buildEvalMatrix(systems);

    expect(
      initial
        .filter((e) => e.designSystemId === 'afterglow')
        .map((e) => e.requestedPages),
    ).toEqual([4, 8, 12]);
    expect(
      initial
        .filter((e) => e.designSystemId === 'margin')
        .map((e) => e.requestedPages),
    ).toEqual([4, 8, 15]);
  });

  it('should clamp a brief that falls below pages.min', () => {
    const systems = [{ id: 'high-min', pages: { min: 5, max: 12 } }];
    const { initial } = buildEvalMatrix(systems);

    expect(initial.map((e) => e.requestedPages)).toEqual([5, 8, 12]);
    expect(initial[0].prompt).toContain('exactly 5 pages');
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

describe('briefsForSystem', () => {
  it('should return unchanged briefs when within limits', () => {
    const briefs = briefsForSystem({ min: 2, max: 15 });
    expect(briefs.map((b) => b.pages)).toEqual([4, 8, 15]);
  });

  it('should cap long brief to pages.max', () => {
    const briefs = briefsForSystem({ min: 3, max: 12 });
    expect(briefs.map((b) => b.pages)).toEqual([4, 8, 12]);
    expect(briefs[2].prompt).toContain('exactly 12 pages');
    expect(briefs[2].prompt).toContain('A 12-page LinkedIn document');
  });

  it('should clamp brief below pages.min', () => {
    const briefs = briefsForSystem({ min: 6, max: 12 });
    expect(briefs.map((b) => b.pages)).toEqual([6, 8, 12]);
    expect(briefs[0].prompt).toContain('exactly 6 pages');
  });
});

describe('buildLongBriefPrompt', () => {
  it('should build 15-page canonical prompt matching EVAL_BRIEFS[2]', () => {
    expect(buildLongBriefPrompt(15)).toBe(EVAL_BRIEFS[2].prompt);
  });

  it('should scale step count and page numbers for 12 pages', () => {
    const prompt = buildLongBriefPrompt(12);
    expect(prompt).toContain('A 12-page LinkedIn document');
    expect(prompt).toContain('cover seven steps in order');
    expect(prompt).toContain('Page 11 summarises the seven steps');
    expect(prompt).toContain('Page 12 invites readers');
    expect(prompt).toContain('Make it exactly 12 pages');
  });
});
