/** A fixed brief the eval hands every Design System, so systems compare like for like. */
export interface EvalBrief {
  /** The page count the brief asks for. */
  pages: number;
  prompt: string;
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
    prompt: [
      'A 15-page LinkedIn document: "A field guide to running your first product launch".',
      'Audience: first-time product managers at small companies.',
      'Page 1 is the cover. Page 2 explains why launches fail quietly. Page 3 is a contents page.',
      'Pages 4 to 13 cover ten steps in order: define the one outcome, name the audience, write the one-sentence pitch, pick the launch date, brief sales and support, prepare the announcement, run a dry rehearsal, launch, watch the first 48 hours, hold a retrospective. Give each step one page with a short rule of thumb.',
      'Page 14 summarises the ten steps in a compact checklist.',
      'Page 15 invites readers to share the step they found hardest.',
      'Make it exactly 15 pages. One idea per page, little text.',
    ].join(' '),
  },
];

/** What a REFINE run asks for. Both refines of the matrix use it. */
export const EVAL_REFINE_FEEDBACK =
  'Tighten the cover headline, and make the closing page ask for a reply more directly.';
