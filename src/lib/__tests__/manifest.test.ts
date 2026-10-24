import {
  buildManifest,
  isManifest,
  isManifestName,
  isPartName,
  manifestName,
  partName,
  stripPartSuffix,
  MANIFEST_SUFFIX,
} from '../manifest';

describe('part naming', () => {
  it('zero-pads to three digits', () => {
    expect(partName('movie.mp4', 1)).toBe('movie.mp4.001');
    expect(partName('movie.mp4', 42)).toBe('movie.mp4.042');
    expect(partName('archive.7z', 999)).toBe('archive.7z.999');
  });

  it('detects part names and strips the suffix', () => {
    expect(isPartName('movie.mp4.007')).toBe(true);
    expect(isPartName('movie.mp4')).toBe(false);
    expect(isPartName('movie.mp4.0070')).toBe(false);
    expect(stripPartSuffix('movie.mp4.007')).toBe('movie.mp4');
    expect(stripPartSuffix('movie.mp4')).toBeNull();
  });
});

describe('manifest', () => {
  it('builds a valid manifest', () => {
    const m = buildManifest({
      originalName: 'movie.mp4',
      originalSize: 9 * 1024 * 1024,
      partCount: 3,
      partSizeBytes: 3 * 1024 * 1024,
      sha256: 'abc123',
    });
    expect(isManifest(m)).toBe(true);
    expect(m.app).toBe('Spliter');
    expect(m.format).toBe(1);
    expect(m.partPattern).toBe('%03d');
    expect(m.createdAt).toBeTruthy();
    expect(m.sha256).toBe('abc123');
  });

  it('omits sha256 when not requested', () => {
    const m = buildManifest({ originalName: 'a.zip', originalSize: 10, partCount: 1, partSizeBytes: 10 });
    expect('sha256' in m).toBe(false);
  });

  it('names and recognizes manifest files', () => {
    expect(manifestName('movie.mp4')).toBe(`movie.mp4${MANIFEST_SUFFIX}`);
    expect(isManifestName('movie.mp4.spliter.json')).toBe(true);
    expect(isManifestName('movie.mp4.001')).toBe(false);
  });

  it('validates foreign JSON strictly', () => {
    expect(isManifest(null)).toBe(false);
    expect(isManifest({})).toBe(false);
    expect(isManifest({ app: 'Other', format: 1 })).toBe(false);
    expect(isManifest({ app: 'Spliter', format: 2 })).toBe(false);
  });
});
