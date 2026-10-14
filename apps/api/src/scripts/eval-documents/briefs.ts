/** A fixed brief the eval hands every Design System, so systems compare like for like. */
export interface EvalBrief {
  /** The page count the brief asks for. */
  pages: number;
  prompt: string;
}

const NUMBER_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
};

const LAUNCH_STEPS = [
  'define the one outcome',
  'name the audience',
  'write the one-sentence pitch',
  'pick the launch date',
  'brief sales and support',
  'prepare the announcement',
  'run a dry rehearsal',
  'launch',
  'watch the first 48 hours',
  'hold a retrospective',
];

/**
 * Builds the prompt for the long brief (field guide to product launch).
 * When pages is 15, produces the exact canonical prompt text.
 * When pages is capped (e.g. 12), scales the covered steps and target page count.
 */
export function buildLongBriefPrompt(pages: number): string {
  const stepCount = Math.max(1, Math.min(LAUNCH_STEPS.length, pages - 5));
  const stepEndPage = 3 + stepCount;
  const countWord = NUMBER_WORDS[stepCount] ?? String(stepCount);
  const stepsText = LAUNCH_STEPS.slice(0, stepCount).join(', ');

  return [
    `A ${pages}-page LinkedIn document: "A field guide to running your first product launch".`,
    'Audience: first-time product managers at small companies.',
    'Page 1 is the cover. Page 2 explains why launches fail quietly. Page 3 is a contents page.',
    `Pages 4 to ${stepEndPage} cover ${countWord} steps in order: ${stepsText}. Give each step one page with a short rule of thumb.`,
    `Page ${pages - 1} summarises the ${countWord} steps in a compact checklist.`,
    `Page ${pages} invites readers to share the step they found hardest.`,
    `Make it exactly ${pages} pages. One idea per page, little text.`,
  ].join(' ');
}

export function buildBriefPrompt(
  targetPages: number,
  actualPages: number,
  basePrompt: string,
): string {
  if (actualPages === targetPages) return basePrompt;
  return basePrompt
    .replace(new RegExp(`A ${targetPages}-page`, 'g'), `A ${actualPages}-page`)
    .replace(
      new RegExp(`exactly ${targetPages} pages`, 'g'),
      `exactly ${actualPages} pages`,
    );
}

/**
 * The three briefs of the pre-rollout eval (spec §11.3): a short, a mid-length
 * and a long LinkedIn document, each on a different topic. They are fixtures:
 * changing one changes what past eval results mean, so a run is only comparable
 * with another run of the same briefs.
 */
export const EVAL_BRIEFS: readonly EvalBrief[] = [
  {
    pages: 4,
    prompt: [
      'A 4-page LinkedIn document: "Four questions to ask before you hire your first engineer".',
      'Audience: non-technical founders at seed-stage startups.',
      'Page 1 is the cover with the title. Pages 2 and 3 each take two of the questions, with a one-line reason for each.',
      'Page 4 closes with a single takeaway and an invitation to comment with the question founders skip most often.',
      'Make it exactly 4 pages. Keep the tone direct and practical.',
    ].join(' '),
  },
  {
    pages: 8,
    prompt: [
      'An 8-page LinkedIn document: "How a weekly review saved our support team 12 hours a week".',
      'Audience: customer support leads at B2B software companies.',
      'Page 1 is the cover. Page 2 states the problem: tickets reopened, no shared picture of why.',
      "Pages 3 to 6 walk through the four parts of the review: tag the top five ticket causes, replay two bad conversations, pick one fix, check last week's fix.",
      'Page 7 gives the result: 12 hours a week saved and reopened tickets down by a third.',
      'Page 8 asks readers how their team reviews support quality.',
      'Make it exactly 8 pages. One idea per page, little text.',
    ].join(' '),
  },
  {
    pages: 15,
    prompt: buildLongBriefPrompt(15),
  },
];

/**
 * Adapts briefs to a Design System's page bounds: clamps the long brief to
 * min(15, pages.max), and clamps any brief below pages.min or above pages.max.
 */
export function briefsForSystem(pageLimits?: {
  min: number;
  max: number;
}): EvalBrief[] {
  const min = pageLimits?.min ?? 1;
  const max = pageLimits?.max ?? 15;
  return EVAL_BRIEFS.map((brief) => {
    const clampedPages = Math.max(min, Math.min(brief.pages, max));
    if (clampedPages === brief.pages) {
      return brief;
    }
    if (brief.pages === 15) {
      return {
        pages: clampedPages,
        prompt: buildLongBriefPrompt(clampedPages),
      };
    }
    return {
      pages: clampedPages,
      prompt: buildBriefPrompt(brief.pages, clampedPages, brief.prompt),
    };
  });
}

/** What a REFINE run asks for. Both refines of the matrix use it. */
export const EVAL_REFINE_FEEDBACK =
  'Tighten the cover headline, and make the closing page ask for a reply more directly.';
