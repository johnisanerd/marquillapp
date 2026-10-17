import type { ReactNode } from 'react';
import { Eyebrow, Icon } from './data';
import DesignSystemPreview from './DesignSystemPreview';

function MockFrame({ label, meta, children }: { label: string; meta: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-surface shadow-md">
      <div className="flex items-center gap-2 border-b border-line-faint px-4 py-2.5">
        <span className="ff-mono text-[11.5px] font-medium text-ink-900">{label}</span>
        <span className="ff-mono ml-auto min-w-0 truncate text-[11px] text-ink-400">{meta}</span>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const SOCIAL = [
  { label: 'Like', paths: ['M7 10v12', 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z'] },
  { label: 'Comment', paths: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  { label: 'Repost', paths: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'] },
  { label: 'Send', paths: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'] },
];

function PostMock() {
  return (
    <MockFrame label="Post" meta="draft · v1">
      <div className="flex flex-1 flex-col px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 flex-none rounded-full bg-gradient-to-br from-accent to-ink-700" aria-hidden="true" />
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold text-ink-900">Your name</div>
            <div className="text-[11.5px] text-ink-500">Scheduled · Tue 9:00 AM</div>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] leading-[1.5] text-ink-800">
          We rewrote onboarding and signups didn&apos;t move. Activation did.
        </p>
        <p className="mt-2 text-[13.5px] leading-[1.5] text-ink-700">
          Three things we cut from the first five minutes, and why the welcome email now does more work
          than the product tour…
        </p>
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-line bg-accent-tint px-2.5 py-1 text-[11.5px] font-medium text-ink-700">
          <Icon paths={['m21 21-4.3-4.3', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z']} size={12} />
          Researched on the web, YouTube, and Reddit
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 border-t border-line-faint px-2 py-1.5 text-ink-500">
        {SOCIAL.map((s) => (
          <span key={s.label} className="flex items-center justify-center gap-1.5 py-1.5 text-[11.5px] font-medium">
            <Icon paths={s.paths} size={14} />
            <span className="md:hidden xl:inline">{s.label}</span>
          </span>
        ))}
      </div>
    </MockFrame>
  );
}

function CarouselMock() {
  return (
    <MockFrame label="Document" meta="carousel · 6 slides · PDF">
      <div className="flex flex-1 flex-col items-center justify-center bg-canvas-sub px-6 py-5">
        <div className="relative w-[78%] max-w-[240px]">
          <div className="absolute inset-0 translate-x-[14px] translate-y-[6px] rotate-[4deg] rounded-[6px] bg-[#e0352b] opacity-90 shadow-md" aria-hidden="true" />
          <div className="absolute inset-0 translate-x-[7px] translate-y-[3px] rotate-[2deg] rounded-[6px] bg-[#efe9dc] shadow-md" aria-hidden="true" />
          <DesignSystemPreview id="broadside" className="relative rounded-[6px] shadow-lg" />
        </div>
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'w-4 bg-accent' : 'w-1.5 bg-ink-300'}`} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line-faint px-4 py-2.5 text-[11.5px] text-ink-500">
        <span>Design System: Broadside</span>
        <span className="ff-mono">1 / 6</span>
      </div>
    </MockFrame>
  );
}

const POLL_OPTIONS = ['Picking a topic', 'Writing the first draft', 'Making the visuals', 'Posting on time'];

function PollMock() {
  return (
    <MockFrame label="Poll" meta="4 options">
      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="text-[14.5px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink-900">
          What slows down your LinkedIn posting the most?
        </p>
        <p className="mt-1 text-[11.5px] text-ink-500">You can see how people vote</p>
        <ul className="mt-4 flex flex-col gap-2">
          {POLL_OPTIONS.map((opt) => (
            <li
              key={opt}
              className="rounded-full border-[1.5px] border-accent-line bg-accent-tint px-4 py-2 text-center text-[13px] font-semibold text-accent-ink"
            >
              {opt}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2 border-t border-line-faint px-4 py-2.5 text-[11.5px] text-ink-500">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#0a66c2] text-[8px] font-bold text-white" aria-hidden="true">in</span>
        Ready to schedule
      </div>
    </MockFrame>
  );
}

const ITEMS = [
  {
    kind: 'Post',
    title: 'Posts with a point of view',
    body: 'Mark reads the top videos and threads on your topic before he writes, so the draft brings specifics instead of filler. Research is on every paid plan.',
    mock: <PostMock />,
    alt: 'Example LinkedIn post drafted by Mark, scheduled for Tuesday at 9 AM, with a note that it was researched on the web, YouTube, and Reddit.',
  },
  {
    kind: 'Document',
    title: 'Carousels that look designed',
    body: 'Mark lays out a multi-slide carousel or a one-pager in the Design System you pick and exports a PDF that LinkedIn shows as a document. He can also turn a post you already wrote into one.',
    mock: <CarouselMock />,
    alt: 'Example six-slide carousel in the Broadside Design System: a cobalt slab with condensed capitals and red rules on newsprint.',
  },
  {
    kind: 'Poll',
    title: 'Polls in one sentence',
    body: 'Ask for a poll and Mark writes the question and two to four options. Change any of it before it goes out.',
    mock: <PollMock />,
    alt: 'Example LinkedIn poll asking what slows down your posting, with four options.',
  },
];

export default function WhatMarkMakes() {
  return (
    <section id="what-mark-makes" className="perf-section border-t border-line bg-surface px-5 py-16 sm:px-6 sm:py-20 lg:px-16 lg:py-[72px]">
      <div className="mx-auto max-w-[660px] text-center">
        <Eyebrow>_ what mark makes</Eyebrow>
        <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[36px] lg:text-[40px]">
          Posts, polls, and documents.
        </h2>
        <p className="mt-3.5 text-[16px] leading-[1.5] text-ink-500 sm:text-[17px]">
          Describe what you want, or pick a type. You get a draft to refine, schedule, or throw away.
        </p>
      </div>

      <div className="mx-auto mt-11 grid max-w-[1100px] gap-8 md:grid-cols-3 md:gap-5">
        {ITEMS.map((item) => (
          <article key={item.kind} className="flex flex-col">
            <div role="img" aria-label={item.alt} className="h-[400px]">
              {item.mock}
            </div>
            <div className="mt-5 px-1">
              <span className="ff-mono text-[12px] font-medium text-accent">{item.kind}</span>
              <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.015em] text-ink-900">{item.title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-ink-500">{item.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
