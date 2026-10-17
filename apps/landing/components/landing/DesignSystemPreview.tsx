import type { JSX } from 'react';
import type { DesignSystemId } from './data';

/*
 * HTML/CSS sketches of a document cover in each Design System.
 * These depict the documents Mark produces, so they keep their own print
 * colours in both site themes instead of following the page tokens.
 */

const SERIF = { fontFamily: '"Didot", "Bodoni 72", "Bodoni MT", "Playfair Display", Georgia, serif' };

function Afterglow() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0a10] p-[8%] text-white">
      <div className="absolute -left-[20%] -top-[15%] h-[70%] w-[80%] rounded-full bg-[#7c3aed] opacity-60 blur-[38px]" />
      <div className="absolute -bottom-[20%] -right-[15%] h-[60%] w-[75%] rounded-full bg-[#fb923c] opacity-50 blur-[42px]" />
      <div className="relative flex h-full flex-col justify-between">
        <span className="ff-mono text-[9px] tracking-[0.14em] text-white/60">01 / LAUNCH NOTES</span>
        <div className="rounded-[12px] border border-white/15 bg-white/[0.07] p-[9%] backdrop-blur-md">
          <div className="text-[19px] font-semibold leading-[1.05] tracking-[-0.03em]">The week after launch matters more</div>
          <div className="mt-2 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#a78bfa] to-[#fb923c]" />
        </div>
      </div>
    </div>
  );
}

function Broadside() {
  return (
    <div className="flex h-full w-full flex-col bg-[#efe9dc] text-[#111]">
      <div className="flex h-[52%] flex-col justify-end bg-[#1d3fc4] p-[8%]">
        <div
          className="origin-left text-[30px] font-extrabold uppercase leading-[0.86] tracking-[-0.045em] text-[#efe9dc]"
          style={{ transform: 'scaleX(0.82)', width: '122%' }}
        >
          The week after launch
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[8%]">
        <div>
          <div className="h-[3px] w-full bg-[#e0352b]" />
          <div className="mt-[6%] text-[10.5px] font-semibold uppercase leading-[1.3] tracking-[0.02em]">
            Six things we changed once the launch traffic left
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className="h-[3px] w-[38%] bg-[#e0352b]" />
          <span className="text-[10px] font-bold">01</span>
        </div>
      </div>
    </div>
  );
}

function Colophon() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-[#f1e9db] p-[8%] text-[#2a1a17]">
      <div className="flex items-center justify-between border-b border-[#6b1f24]/40 pb-1.5">
        <span className="text-[9px] uppercase tracking-[0.22em]">Feature</span>
        <span className="text-[9px] italic" style={SERIF}>No. 3</span>
      </div>
      <div className="-my-2 text-[118px] font-light leading-[0.8] text-[#6b1f24]" style={SERIF}>
        3
      </div>
      <div>
        <div className="text-[18px] italic leading-[1.05]" style={SERIF}>Three habits of writers who post every week</div>
        <div className="mt-2 border-t border-[#6b1f24]/40" />
      </div>
    </div>
  );
}

function Margin() {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-[#fbfbf9] p-[10%] text-[#141414]">
      <span className="text-[9px] tracking-[0.04em] text-[#8a8a85]">Notes on shipping</span>
      <div>
        <div className="text-[17px] font-medium leading-[1.15] tracking-[-0.02em]">Say less.</div>
        <div className="mt-1 text-[9.5px] leading-[1.4] text-[#8a8a85]">One idea per page, with room around it.</div>
      </div>
      <span className="self-end text-[9px] tabular-nums text-[#8a8a85]">1</span>
    </div>
  );
}

function Overprint() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f7efd9] p-[8%] text-[#1f3a93]">
      <div className="absolute -right-[18%] top-[6%] h-[58%] w-[70%] rounded-full bg-[#ff3d9a] opacity-90 mix-blend-multiply" />
      <div className="absolute -left-[10%] bottom-[16%] h-[30%] w-[70%] -rotate-6 bg-[#ffd23f] mix-blend-multiply" />
      <div className="relative flex h-full flex-col justify-between">
        <span className="w-fit -rotate-[8deg] rounded-[4px] bg-[#1f3a93] px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-[#ffd23f] shadow-[2px_2px_0_#ff3d9a]">
          Hot take
        </span>
        <div className="text-[27px] font-black uppercase leading-[0.9] tracking-[-0.03em]">
          Post less.
          <br />
          Say more.
        </div>
        <span className="w-fit rotate-[5deg] rounded-full border-2 border-[#1f3a93] bg-[#f7efd9] px-2 py-[2px] text-[9px] font-bold uppercase">
          Zine no. 1
        </span>
      </div>
    </div>
  );
}

function Schematic() {
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#0f2d5c] p-[8%] text-white"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.09) 1px, transparent 1px)',
        backgroundSize: '14px 14px',
      }}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="ff-mono flex justify-between text-[8.5px] tracking-[0.1em] text-white/70">
          <span>FIG. 01</span>
          <span>REV A</span>
        </div>
        <div className="relative mx-auto h-[38%] w-[78%] rounded-[3px] border border-white/80">
          <div className="absolute left-[12%] top-[20%] h-[28%] w-[34%] border border-dashed border-white/60" />
          <div className="absolute bottom-[18%] right-[10%] h-[34%] w-[40%] border border-white/60" />
          {['1', '2', '3'].map((n, i) => (
            <span
              key={n}
              className="ff-mono absolute flex h-4 w-4 items-center justify-center rounded-full border border-white bg-[#0f2d5c] text-[8px]"
              style={[{ left: '-8px', top: '18%' }, { right: '-8px', top: '8%' }, { left: '44%', bottom: '-8px' }][i]}
            >
              {n}
            </span>
          ))}
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-[1.1] tracking-[-0.01em]">How the publishing queue works</div>
          <div className="ff-mono mt-1 text-[8.5px] text-white/60">SCALE 1:1 · SHEET 1 OF 6</div>
        </div>
      </div>
    </div>
  );
}

const PREVIEWS: Record<DesignSystemId, () => JSX.Element> = {
  afterglow: Afterglow,
  broadside: Broadside,
  colophon: Colophon,
  margin: Margin,
  overprint: Overprint,
  schematic: Schematic,
};

export default function DesignSystemPreview({ id, className = '' }: { id: DesignSystemId; className?: string }) {
  const Preview = PREVIEWS[id];
  return (
    <div className={`aspect-[4/5] overflow-hidden ${className}`} aria-hidden="true">
      <Preview />
    </div>
  );
}

/** Two-colour swatch per Design System, as shown in the app's swatch menu. */
export const SWATCH: Record<DesignSystemId, [string, string]> = {
  afterglow: ['#7c3aed', '#fb923c'],
  broadside: ['#1d3fc4', '#e0352b'],
  colophon: ['#f1e9db', '#6b1f24'],
  margin: ['#fbfbf9', '#141414'],
  overprint: ['#ff3d9a', '#ffd23f'],
  schematic: ['#0f2d5c', '#ffffff'],
};

export function Swatch({ id, size = 26 }: { id: DesignSystemId; size?: number }) {
  const [a, b] = SWATCH[id];
  return (
    <span
      className="inline-block flex-none rounded-full border border-black/10"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)` }}
      aria-hidden="true"
    />
  );
}
