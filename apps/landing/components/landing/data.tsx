import type { ReactNode } from 'react';

export function Icon({ paths, size = 20 }: { paths: string[]; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** Tall blinking accent caret used in "talk to Mark" copy. */
export function MarkCursor() {
  return (
    <span
      className="animate-mq-blink ml-[3px] inline-block rounded-[1px] bg-accent"
      style={{ width: '0.5em', height: '1.05em', verticalAlign: '-0.18em' }}
      aria-hidden="true"
    />
  );
}

/** Small monospace "_ section" eyebrow used across sections. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="ff-mono text-[12px] text-ink-400">{children}</span>;
}

/* ------------------------------------------------------------
   Status language, used everywhere the page talks about the beta:
   - live:    solid accent dot inside a soft accent halo
   - next:    dashed hollow ring in the ink scale
   - shipped: small solid accent square (changelog entries)
   ------------------------------------------------------------ */
export type Status = 'live' | 'next' | 'shipped';

export function StatusMark({ status }: { status: Status }) {
  if (status === 'next') {
    return (
      <span
        className="inline-block h-[9px] w-[9px] flex-none rounded-full border-[1.5px] border-dashed border-ink-400"
        aria-hidden="true"
      />
    );
  }
  if (status === 'shipped') {
    return <span className="inline-block h-[7px] w-[7px] flex-none rounded-[2px] bg-accent" aria-hidden="true" />;
  }
  return (
    <span className="relative inline-flex h-[9px] w-[9px] flex-none" aria-hidden="true">
      <span className="animate-mq-pulse absolute inset-0 rounded-full bg-accent/40" />
      <span className="relative h-[9px] w-[9px] rounded-full bg-accent" />
    </span>
  );
}

/** The "Public beta" pill. Same accent treatment wherever it appears. */
export function BetaBadge({ children = 'Public beta' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft py-1 pl-1 pr-3 text-[12.5px] font-medium text-ink-900">
      <span className="ff-mono rounded-full bg-accent px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-accent">
        Beta
      </span>
      {children}
    </span>
  );
}

/** The "mq" tile Mark signs his work with. */
export function MarkTile({ size = 30 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex flex-none items-end justify-end rounded-[8px] bg-ink-900 p-[2px_3px]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="ff-mono text-[8px] font-medium leading-none text-surface">mq</span>
    </span>
  );
}

/* ------------------------------------------------------------
   Status board: what is in the app today, and what is not yet.
   ------------------------------------------------------------ */
export type BoardItem = { title: string; body: string };

export const liveNow: BoardItem[] = [
  { title: 'Posts', body: 'LinkedIn text posts, drafted from your prompt.' },
  { title: 'Polls', body: 'A question and two to four options.' },
  { title: 'Documents', body: 'One-pagers and multi-slide carousels, exported as PDF.' },
  { title: 'Six Design Systems', body: 'Afterglow, Broadside, Colophon, Margin, Overprint, Schematic.' },
  { title: 'Research', body: 'Web search plus the top YouTube videos and Reddit threads on your topic.' },
  { title: 'Scheduling', body: 'Type “next Tuesday 9am”, then check the calendar.' },
  { title: 'Company pages', body: 'Publish to your profile or to a company page you admin.' },
];

export const shippingNext: BoardItem[] = [
  { title: 'Analytics', body: 'Post performance inside Marquill. It stays switched off until the numbers are right.' },
];

/* ------------------------------------------------------------
   Changelog: recent shipments, newest first.
   ------------------------------------------------------------ */
export type Shipment = { date: string; title: string; body: string };

export const changelog: Shipment[] = [
  { date: 'Oct 2026', title: 'Swatch menu with hover preview', body: 'Hover over a Design System to preview it before you pick.' },
  { date: 'Oct 2026', title: 'Refine a document from its source', body: 'Mark edits the document he already made, so the parts you liked stay put.' },
  { date: 'Oct 2026', title: 'Design Systems for documents', body: 'Six designed systems for one-pagers and carousels, chosen per document.' },
  { date: 'Jul 2026', title: 'Live progress', body: 'Watch each step as Mark researches, writes, and renders.' },
  { date: 'Apr 2026', title: 'Company pages', body: 'Connect a LinkedIn company page and publish to it on a schedule.' },
];

/* ------------------------------------------------------------
   Design Systems. Names and descriptions match the app's six
   app-owned Design Systems.
   ------------------------------------------------------------ */
export type DesignSystemId = 'afterglow' | 'broadside' | 'colophon' | 'margin' | 'overprint' | 'schematic';

export type DesignSystem = { id: DesignSystemId; name: string; mood: string; body: string };

export const designSystems: DesignSystem[] = [
  { id: 'afterglow', name: 'Afterglow', mood: 'Night-mode tech', body: 'A violet-to-tangerine glow on near-black, with glass panels.' },
  { id: 'broadside', name: 'Broadside', mood: 'Swiss poster', body: 'Condensed capitals, a cobalt slab, and red rules on newsprint.' },
  { id: 'colophon', name: 'Colophon', mood: 'Magazine feature', body: 'Hairline Didone serifs and a giant oxblood numeral on bone paper.' },
  { id: 'margin', name: 'Margin', mood: 'Quiet minimalism', body: 'One sans-serif and a page that is mostly empty.' },
  { id: 'overprint', name: 'Overprint', mood: 'Risograph zine', body: 'Fluoro pink and sunflower on cream, federal-blue ink, tilted stickers.' },
  { id: 'schematic', name: 'Schematic', mood: 'Engineering blueprint', body: 'A drafting grid on deep blue, mono annotations, numbered callouts.' },
];

/* ------------------------------------------------------------
   Plans. Must match apps/api/src/scripts/tier-seeds.ts.
   ------------------------------------------------------------ */
export type Plan = {
  name: string;
  price: string;
  period: string;
  blurb: string;
  cta: string;
  popular: boolean;
  features: string[];
};

/** Label for the highlighted plan. There is no usage data in beta, so it is a recommendation, not a ranking. */
export const highlightLabel = 'Best for daily posting';

export const plans: Plan[] = [
  { name: 'Free', price: '$0', period: '', blurb: 'Try Mark on one account. No card needed.', cta: 'Start free', popular: false, features: ['120 shared AI credits/month', '1 connected account', '1 scheduled post', '30 day history'] },
  { name: 'Starter', price: '$9.99', period: '/mo', blurb: 'Adds research, for a post or two a week.', cta: 'Choose Starter', popular: false, features: ['2,000 AI credits/month', 'AI research', '1 connected account', '5 scheduled posts', '90 day history'] },
  { name: 'Creator', price: '$19.99', period: '/mo', blurb: 'Enough credits to post most days.', cta: 'Choose Creator', popular: true, features: ['10,000 AI credits/month', 'AI research', '1 connected account', '15 scheduled posts', '1 year post history'] },
  { name: 'Pro Writer', price: '$29.99', period: '/mo', blurb: 'Five accounts, for ghostwriters with clients.', cta: 'Choose Pro Writer', popular: false, features: ['30,000 AI credits/month', 'AI research', '5 connected accounts', 'unlimited scheduled posts', 'unlimited post history'] },
];

export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  { q: 'What does public beta mean for me?', a: 'Everything on the Live now board works in the app today. Analytics is the one feature still switched off. You will see new features land and, now and then, a rough edge. When you hit one, tell us.' },
  { q: 'How do I report a problem or ask for a feature?', a: 'Email hello@marquill.com. Tell us what you asked Mark for and what came back.' },
  { q: 'Can I change plans later?', a: 'Yes. Upgrades and downgrades take effect immediately, and we prorate the charge.' },
  { q: 'Do you offer refunds?', a: 'First-time subscribers get a full refund within 30 days of the charge. Email hello@marquill.com and we will process it.' },
];
