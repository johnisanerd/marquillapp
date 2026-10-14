import { findCoverKey } from './eval-covers';

const artifact = {
  versions: [
    { version: 1, content: { document: { coverKey: 'a/v1/cover.png' } } },
    { version: 2, content: { document: { pageCount: 4 } } },
    { version: 3 },
  ],
};

describe('findCoverKey', () => {
  it('should return the cover key of the requested version', () => {
    expect(findCoverKey(artifact, 1)).toBe('a/v1/cover.png');
  });

  it('should return undefined when the cover capture failed', () => {
    expect(findCoverKey(artifact, 2)).toBeUndefined();
  });

  it('should return undefined for a version without content', () => {
    expect(findCoverKey(artifact, 3)).toBeUndefined();
  });

  it('should return undefined for an unknown version or artifact', () => {
    expect(findCoverKey(artifact, 9)).toBeUndefined();
    expect(findCoverKey(null, 1)).toBeUndefined();
  });
});
