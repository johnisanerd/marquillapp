import { liveNow, shippingNext, Eyebrow, StatusMark } from './data';

export default function StatusBoard() {
  return (
    <section id="status" className="perf-section border-t border-line bg-canvas px-5 py-16 sm:px-6 sm:py-20 lg:px-16 lg:py-[72px]">
      <div className="mx-auto max-w-[640px] text-center">
        <Eyebrow>_ status board</Eyebrow>
        <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[36px] lg:text-[40px]">
          What works today. What&apos;s next.
        </h2>
        <p className="mt-3.5 text-[16px] leading-[1.5] text-ink-500 sm:text-[17px]">
          You can use everything under Live now in the app today. Analytics is the one thing we&apos;re
          still building.
        </p>
      </div>

      <div className="mx-auto mt-11 grid max-w-[1100px] gap-4 lg:grid-cols-[1.75fr_1fr]">
        {/* Live now */}
        <div className="rounded-[18px] border border-accent-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2.5">
            <StatusMark status="live" />
            <h3 className="ff-mono text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-900">Live now</h3>
            <span className="ff-mono ml-auto text-[12px] text-ink-400">{liveNow.length} items</span>
          </div>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {liveNow.map((item) => (
              <li key={item.title} className="rounded-[12px] border border-line bg-accent-tint px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <StatusMark status="shipped" />
                  <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{item.title}</span>
                </div>
                <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-500">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Shipping next */}
        <div className="flex flex-col rounded-[18px] border border-dashed border-line-strong bg-surface-2 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <StatusMark status="next" />
            <h3 className="ff-mono text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-900">Shipping next</h3>
          </div>
          <ul className="mt-5 flex flex-col gap-2.5">
            {shippingNext.map((item) => (
              <li key={item.title} className="rounded-[12px] border border-dashed border-line-strong bg-surface px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{item.title}</span>
                  <span className="ff-mono rounded-full border border-line px-2 py-[1px] text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
                    In progress
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-500">{item.body}</p>
                {/* Analytics placeholder bars, drawn in outline to read as "not yet" */}
                <div className="mt-3.5 flex h-12 items-end gap-1.5" aria-hidden="true">
                  {[40, 62, 35, 78, 54, 90, 66].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[3px] border border-b-0 border-dashed border-ink-300" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <a
            href="mailto:hello@marquill.com?subject=What%20Mark%20should%20do%20next"
            className="group mt-2.5 flex flex-1 flex-col justify-between rounded-[12px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-accent-line"
          >
            <div>
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">Your request</span>
              <p className="mt-1 text-[13.5px] leading-[1.45] text-ink-500">
                The next line on this board could be yours. Tell us what you want Mark to make.
              </p>
            </div>
            <span className="mt-3 text-[13.5px] font-semibold text-accent">hello@marquill.com →</span>
          </a>
        </div>
      </div>
    </section>
  );
}
