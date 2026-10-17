import { Eyebrow, Icon } from './data';

const OUTCOMES = [
  {
    title: 'Skip the blank page',
    body: 'One prompt covers the research, the writing, and the layout. Your job is to read the draft and decide.',
    paths: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  },
  {
    title: 'Keep a steady cadence',
    body: 'Fill next week in one sitting. Type “next Tuesday 9am” to set the time, and reschedule from the calendar.',
    paths: ['M3 4h18v18H3z', 'M16 2v4', 'M8 2v4', 'M3 10h18', 'm9 16 2 2 4-4'],
  },
  {
    title: 'Post as you, or as the company',
    body: 'Publish to your own profile or a company page you admin. Pro Writer connects five accounts, for ghostwriters with clients.',
    paths: ['M3 21h18', 'M5 21V7l8-4v18', 'M19 21V11l-6-4', 'M9 9v.01', 'M9 13v.01', 'M9 17v.01'],
  },
  {
    title: 'Watch Mark work',
    body: 'Research, generate, render: you see each step as it happens, not a spinner.',
    paths: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  },
];

const WEEK = [
  { day: 'Mon', date: '19', post: null },
  { day: 'Tue', date: '20', post: { kind: 'Document', time: '9:00', tone: 'accent' } },
  { day: 'Wed', date: '21', post: null },
  { day: 'Thu', date: '22', post: { kind: 'Poll', time: '12:30', tone: 'muted' } },
  { day: 'Fri', date: '23', post: { kind: 'Post', time: '8:15', tone: 'muted' } },
] as const;

function ScheduleMock() {
  return (
    <div
      role="img"
      aria-label="Scheduling example: the phrase next Tuesday 9am becomes Tuesday at 9:00 AM, posting to a company page, shown on a week calendar with a document, a poll, and a post."
      className="overflow-hidden rounded-[18px] border border-line bg-surface shadow-lg"
    >
      <div className="border-b border-line-faint p-4 sm:p-5">
        <div className="ff-mono text-[11px] text-ink-400">When</div>
        <div className="mt-1.5 flex items-center gap-2 rounded-[10px] border border-accent-line bg-accent-tint px-3 py-2.5">
          <span className="text-[14px] text-ink-900">next Tuesday 9am</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-[3px] text-[11.5px] font-semibold text-on-accent">
            Tue · 9:00 AM
          </span>
        </div>

        <div className="ff-mono mt-4 text-[11px] text-ink-400">Post as</div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2">
            <span className="h-6 w-6 flex-none rounded-full bg-gradient-to-br from-accent to-ink-700" />
            <span className="truncate text-[13px] text-ink-700">Your profile</span>
          </div>
          <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-accent px-3 py-2">
            <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-ink-900 text-[10px] font-bold text-surface">
              Co
            </span>
            <span className="truncate text-[13px] font-semibold text-ink-900">Company page</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 bg-canvas-sub p-3 sm:gap-2 sm:p-4">
        {WEEK.map((d) => (
          <div key={d.day} className="flex min-h-[112px] flex-col rounded-[10px] border border-line bg-surface p-1.5 sm:p-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-medium text-ink-500">{d.day}</span>
              <span className="ff-mono text-[10.5px] text-ink-400">{d.date}</span>
            </div>
            {d.post && (
              <div
                className={`mt-auto rounded-[7px] px-1.5 py-1.5 ${
                  d.post.tone === 'accent' ? 'bg-accent text-on-accent' : 'border border-line bg-surface-2 text-ink-700'
                }`}
              >
                <div className="truncate text-[10.5px] font-semibold">{d.post.kind}</div>
                <div className="ff-mono text-[9.5px] opacity-80">{d.post.time}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OneWorkspace() {
  return (
    <section id="one-workspace" className="perf-section border-t border-line bg-surface px-5 py-16 sm:px-6 sm:py-20 lg:px-16 lg:py-[72px]">
      <div className="mx-auto grid max-w-[1100px] items-center gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>_ one workspace</Eyebrow>
          <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[36px] lg:text-[40px]">
            From prompt to published in one place.
          </h2>
          <ul className="mt-8 flex flex-col gap-5">
            {OUTCOMES.map((o) => (
              <li key={o.title} className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-accent-line bg-accent-soft text-accent" aria-hidden="true">
                  <Icon paths={o.paths} size={18} />
                </span>
                <div>
                  <h3 className="text-[16.5px] font-semibold tracking-[-0.01em] text-ink-900">{o.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-[1.5] text-ink-500">{o.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ScheduleMock />
      </div>
    </section>
  );
}
