/** A fixed brief the eval hands every Design System, so systems compare like for like. */
export interface EvalBrief {
  /** The page count the brief asks for. */
  pages: number;
  prompt: string;
}

const NUMBER_WORDS: Record<number, string> = {
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

/** Steps a shorter guide drops first; the rest of the sequence stays whole. */
const DROPPED_FIRST = [
  'name the audience',
  'pick the launch date',
  'prepare the announcement',
];

export const LONG_BRIEF_PAGES = 15;
const MIN_LONG_BRIEF_PAGES = 12;

/**
 * The long brief (a field guide to a product launch) for a given page count.
 * Three pages of front matter, one page per step, then a checklist and a
 * closing page, so a shorter guide drops steps instead of squeezing them.
 * `buildLongBriefPrompt(15)` is the canonical ten-step prompt.
 */
export function buildLongBriefPrompt(pages: number): string {
  if (pages < MIN_LONG_BRIEF_PAGES || pages > LONG_BRIEF_PAGES) {
    throw new RangeError(
      `The long brief supports ${MIN_LONG_BRIEF_PAGES} to ${LONG_BRIEF_PAGES} pages, not ${pages}.`,
    );
  }
  const stepCount = pages - 5;
  const dropped = DROPPED_FIRST.slice(0, LAUNCH_STEPS.length - stepCount);
  const steps = LAUNCH_STEPS.filter((step) => !dropped.includes(step));
  const count = NUMBER_WORDS[stepCount];

  return [
    `A ${pages}-page LinkedIn document: "A field guide to running your first product launch".`,
    'Audience: first-time product managers at small companies.',
    'Page 1 is the cover. Page 2 explains why launches fail quietly. Page 3 is a contents page.',
    `Pages 4 to ${3 + stepCount} cover ${count} steps in order: ${steps.join(', ')}. Give each step one page with a short rule of thumb.`,
    `Page ${pages - 1} summarises the ${count} steps in a compact checklist.`,
    `Page ${pages} invites readers to share the step they found hardest.`,
    `Make it exactly ${pages} pages. One idea per page, little text.`,
  ].join(' ');
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
    pages: LONG_BRIEF_PAGES,
    prompt: buildLongBriefPrompt(LONG_BRIEF_PAGES),
  },
];

/**
 * The briefs for a Design System whose `pages.max` is `maxPages`: the long
 * brief requests `min(15, maxPages)` pages, so the eval never asks for a
 * length the system's definition would reject (#194).
 */
export function briefsForSystem(maxPages: number): EvalBrief[] {
  return EVAL_BRIEFS.map((brief) =>
    brief.pages > maxPages
      ? { pages: maxPages, prompt: buildLongBriefPrompt(maxPages) }
      : brief,
  );
}

/** What a REFINE run asks for. Both refines of the matrix use it. */
export const EVAL_REFINE_FEEDBACK =
  'Tighten the cover headline, and make the closing page ask for a reply more directly.';
