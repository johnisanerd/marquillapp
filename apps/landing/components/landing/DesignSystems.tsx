import { designSystems, Eyebrow } from './data';
import DesignSystemPreview, { Swatch } from './DesignSystemPreview';

/** A sketch of the in-app swatch menu with one Design System hovered. */
function SwatchMenuMock() {
  return (
    <div
      role="img"
      aria-label="The swatch menu: six Design System swatches in a row, with Overprint hovered and a preview of it open above."
      className="relative mx-auto w-full max-w-[360px] pt-[168px]"
    >
      <div className="absolute left-1/2 top-0 w-[128px] -translate-x-[18%] overflow-hidden rounded-[10px] border border-line bg-surface p-1.5 shadow-pop" aria-hidden="true">
        <DesignSystemPreview id="overprint" className="rounded-[6px]" />
        <div className="mt-1.5 px-0.5 text-[11px] font-semibold text-ink-900">Overprint</div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-full border border-line-strong bg-surface px-3 py-2.5 shadow-md" aria-hidden="true">
        <span className="ff-mono pl-1 text-[11px] text-ink-500">Design</span>
        <div className="flex items-center gap-1.5">
          {designSystems.map((ds) => (
            <span
              key={ds.id}
              className={`rounded-full p-[2px] ${ds.id === 'overprint' ? 'ring-2 ring-accent' : ds.id === 'broadside' ? 'ring-1 ring-ink-300' : ''}`}
            >
              <Swatch id={ds.id} size={22} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DesignSystems() {
  return (
    <section id="design-systems" className="perf-section border-t border-line bg-canvas px-5 py-16 sm:px-6 sm:py-20 lg:px-16 lg:py-[72px]">
      <div className="mx-auto grid max-w-[1100px] items-end gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <Eyebrow>_ design systems</Eyebrow>
          <h2 className="mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-[36px] lg:text-[40px]">
            Six Design Systems. Your carousel won&apos;t look like the one above it in the feed.
          </h2>
          <p className="mt-3.5 max-w-[560px] text-[16px] leading-[1.5] text-ink-500 sm:text-[17px]">
            A Design System sets the type, colour, and layout of a document. Pick one from the swatch
            menu, hover to preview it, and switch to another when you ask Mark to refine.
          </p>
        </div>
        <SwatchMenuMock />
      </div>

      <ul className="mx-auto mt-12 grid max-w-[1100px] grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:gap-x-5">
        {designSystems.map((ds) => (
          <li key={ds.id}>
            <div className="overflow-hidden rounded-[14px] border border-line bg-surface p-2 shadow-sm">
              <DesignSystemPreview id={ds.id} className="rounded-[9px] ring-1 ring-line" />
            </div>
            <div className="mt-3 flex items-center gap-2 px-0.5">
              <Swatch id={ds.id} size={14} />
              <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-900">{ds.name}</h3>
              <span className="ff-mono ml-auto hidden text-[11px] text-ink-400 sm:inline">{ds.mood}</span>
            </div>
            <p className="mt-1 px-0.5 text-[13.5px] leading-[1.45] text-ink-500">{ds.body}</p>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-12 grid max-w-[1100px] gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-accent-line bg-accent-tint px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink-900">Every refinement is a new version</h3>
          <p className="mt-1 text-[14px] leading-[1.5] text-ink-500">
            Ask for a change and Mark saves it as a new version. The old ones stay, and you can pin any
            finished version to your post.
          </p>
        </div>
        <div className="rounded-[14px] border border-accent-line bg-accent-tint px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink-900">Checked before you see it</h3>
          <p className="mt-1 text-[14px] leading-[1.5] text-ink-500">
            Marquill checks each document for rendering problems and has Mark repair them before the
            document reaches you.
          </p>
        </div>
      </div>
    </section>
  );
}
