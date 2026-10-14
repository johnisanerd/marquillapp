// The prompt module reads `ArtifactType` through the `src/...` alias, which Jest
// does not resolve; only the constant under test is needed here.
jest.mock(
  'src/database/schemas',
  () => ({
    ArtifactType: { POST: 'POST', POLL: 'POLL', DOCUMENT: 'DOCUMENT' },
  }),
  { virtual: true },
);

import { GENERATE_DOCUMENT_SYSTEM_PROMPT } from './artifact-generation.prompts';

describe('GENERATE_DOCUMENT_SYSTEM_PROMPT', () => {
  // The prompt is hard-wrapped; compare it as the model reads it.
  const prompt = GENERATE_DOCUMENT_SYSTEM_PROMPT.replace(/\s+/g, ' ');

  describe('page selectors', () => {
    it.each(['`*`', '`body > *`', '`html *`', '`:is()`', '`:where()`'])(
      'should name %s as a selector that matches a page',
      (selector) => {
        expect(prompt).toContain(selector);
      },
    );

    it('should show `.page *` as the allowed reset', () => {
      expect(prompt).toContain('.page * { box-sizing: border-box; }');
    });

    it('should state that a page carries no class but page', () => {
      expect(prompt).toContain(
        '<section class="page" data-role="<role>"> and nothing else',
      );
    });
  });

  describe('frame', () => {
    it('should tell the model the page is already padded by the safe area', () => {
      expect(prompt).toMatch(/already (has|pads?) .*safe area/s);
    });

    it('should describe one unpadded wrapper filling the page', () => {
      expect(prompt).toContain('height: 100%');
      expect(prompt).toMatch(/no padding[^.]*no px height/s);
    });

    it('should forbid overflow: hidden because the page already crops', () => {
      expect(prompt).toMatch(/crops[^.]*no overflow: hidden/s);
    });

    it('should give the bleed recipe on an unpositioned wrapper', () => {
      expect(prompt).toContain(
        "::before { content: ''; position: absolute; inset: 0; z-index: -1;",
      );
    });

    it('should ask for an explicit colour on the wrapper and on each svg', () => {
      expect(prompt).toMatch(/color on the wrapper and on every svg/);
    });

    it('should restrict characters to those the declared fonts cover', () => {
      expect(prompt).toMatch(/only characters the declared fonts cover/);
    });
  });
});
