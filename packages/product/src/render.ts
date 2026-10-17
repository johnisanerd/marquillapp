import { changelog } from './changelog';
import { features } from './features';
import type { Feature, FeatureArea, FeatureStatus } from './types';

const AREAS: Record<FeatureArea, string> = {
  creation: 'Creation',
  documents: 'Documents',
  research: 'Research',
  publishing: 'Publishing',
  scheduling: 'Scheduling',
  accounts: 'Accounts',
  insights: 'Insights',
  billing: 'Billing',
  workspace: 'Workspace',
};

const SECTIONS: { title: string; statuses: FeatureStatus[] }[] = [
  { title: 'Live', statuses: ['live'] },
  { title: 'Planned and building', statuses: ['building', 'planned'] },
  { title: 'Ideas', statuses: ['idea'] },
  { title: 'Paused and retired', statuses: ['paused', 'retired'] },
];

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function links(feature: Feature): string {
  const parts = [
    ...(feature.issues ?? []).map((n) => `#${n}`),
    ...(feature.docs ?? []).map((path) => `[${path.split('/').pop()}](../../${path})`),
  ];
  return parts.join(', ');
}

function row(feature: Feature): string {
  const flags = [feature.board ? 'board' : '', feature.plans ? feature.plans.join(', ') : ''].filter(Boolean).join('; ');
  const date = feature.since ?? feature.discussed?.date ?? '';
  const notes = [...(feature.notes ?? []), ...(feature.discussed ? [`Discussed: ${feature.discussed.summary}`] : [])];
  const summary = [feature.summary, ...notes.map((n) => `_${n}_`)].join('<br>');
  return `| \`${feature.id}\` | ${cell(feature.name)} | ${feature.status} | ${date} | ${cell(summary)} | ${flags} | ${links(feature)} |`;
}

/** FEATURES.md, generated from the ledger. The ledger test fails when the file is stale. */
export function renderFeaturesMarkdown(): string {
  const out: string[] = [
    '# Marquill features',
    '',
    '<!-- Generated from src/features.ts and src/changelog.ts. Do not edit; run `bun run render` in packages/product. -->',
    '',
    'Every feature Marquill has, is building, or has discussed. `live` means deployed and enabled in production. `board` features appear on the landing page status board.',
  ];

  for (const section of SECTIONS) {
    const inSection = features.filter((f) => section.statuses.includes(f.status));
    if (inSection.length === 0) continue;
    out.push('', `## ${section.title}`);
    for (const [area, label] of Object.entries(AREAS)) {
      const rows = inSection.filter((f) => f.area === area);
      if (rows.length === 0) continue;
      out.push('', `### ${label}`, '', '| Id | Feature | Status | Date | What it does | Landing; plans | Links |', '| --- | --- | --- | --- | --- | --- | --- |');
      out.push(...rows.map(row));
    }
  }

  out.push('', '## Changelog', '', '| Date | Feature | Entry | Published |', '| --- | --- | --- | --- |');
  for (const entry of changelog) {
    const live = features.find((f) => f.id === entry.feature)?.status === 'live';
    out.push(`| ${entry.date} | \`${entry.feature}\` | **${cell(entry.title)}**: ${cell(entry.body)} | ${live ? 'yes' : 'draft'} |`);
  }

  return `${out.join('\n')}\n`;
}
