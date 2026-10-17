import { renderFeaturesMarkdown } from '../src/render';

const target = new URL('../FEATURES.md', import.meta.url);
await Bun.write(target, renderFeaturesMarkdown());
console.log(`Wrote ${target.pathname}`);
