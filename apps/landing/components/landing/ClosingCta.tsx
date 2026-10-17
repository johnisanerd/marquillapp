import { BetaBadge } from './data';

const ASKS = [
  'What you asked Mark for, and what came back',
  'A document that should have looked different',
  'The thing you expected to find and didn’t',
];

/** "Help shape Mark": the feedback invitation and the closing call to action. */
export default function ClosingCta({ appUrl }: { appUrl: string }) {
  return (
    <section id="feedback" className="perf-section border-t border-line bg-surface px-5 py-16 sm:px-6 sm:py-20 lg:px-16">
      <div className="relative isolate mx-auto max-w-[1100px] overflow-hidden rounded-[24px] border border-accent-line bg-surface-2 px-6 py-12 sm:px-12 sm:py-14">
        <div className="mq-glow pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <BetaBadge>Help shape Mark</BetaBadge>
            <h2 className="mt-5 text-[28px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[36px] lg:text-[40px]">
              <span className="text-ink-900">Nobody has told us what&apos;s wrong yet.</span>{' '}
              <span className="text-ink-500">You could be first.</span>
            </h2>
            <p className="mt-4 max-w-[520px] text-[16px] leading-[1.55] text-ink-500">
              Marquill is new, and early users decide what lands on the status board next. Your note goes
              to the people building Mark.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={appUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-accent px-[26px] text-[15px] font-semibold tracking-[-0.01em] text-on-accent shadow-md transition-opacity hover:opacity-90"
              >
                Join the public beta →
              </a>
              <a
                href="mailto:hello@marquill.com?subject=Marquill%20beta%20feedback"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-[22px] text-[15px] font-semibold tracking-[-0.01em] text-ink-900 transition-colors hover:bg-canvas-sub"
              >
                Email hello@marquill.com
              </a>
            </div>
          </div>

          <div className="rounded-[16px] border border-line bg-surface p-5 shadow-md sm:p-6">
            <div className="ff-mono text-[11.5px] text-ink-400">Useful things to send</div>
            <ul className="mt-4 flex flex-col gap-3">
              {ASKS.map((ask) => (
                <li key={ask} className="flex items-start gap-3 text-[14.5px] leading-[1.45] text-ink-700">
                  <span className="mt-[7px] inline-block h-[7px] w-[7px] flex-none rounded-[2px] bg-accent" aria-hidden="true" />
                  {ask}
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-line-faint pt-4 text-[13px] text-ink-500">
              Screenshots help. So does the prompt you typed.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
