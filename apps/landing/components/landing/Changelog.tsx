import { changelog, Eyebrow, StatusMark } from './data';

export default function Changelog() {
  return (
    <section id="changelog" className="perf-section border-t border-line bg-canvas px-5 py-16 sm:px-6 sm:py-20 lg:px-16 lg:py-[72px]">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>_ changelog</Eyebrow>
          <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[36px]">
            Shipped recently.
          </h2>
        </div>
        <p className="max-w-[380px] text-[15px] leading-[1.5] text-ink-500">
          Mark gets new abilities while you use him. These are the latest, newest first.
        </p>
      </div>

      <ol className="mx-auto mt-10 grid max-w-[1100px] gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {changelog.map((entry, i) => (
          <li
            key={entry.title}
            className={`relative flex flex-col rounded-[14px] border bg-surface p-4 ${
              i === 0 ? 'border-accent-line shadow-md' : 'border-line shadow-xs'
            }`}
          >
            <div className="flex items-center gap-2">
              <StatusMark status="shipped" />
              <time className="ff-mono text-[11.5px] text-ink-500">{entry.date}</time>
              {i === 0 && (
                <span className="ff-mono ml-auto rounded-full bg-accent-soft px-2 py-[1px] text-[10.5px] font-medium text-accent-ink">
                  Latest
                </span>
              )}
            </div>
            <h3 className="mt-3 text-[15.5px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink-900">{entry.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-500">{entry.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
