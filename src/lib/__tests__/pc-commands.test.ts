import { buildRejoinKit, unixCommand, windowsCommand } from '../pc-commands';

describe('pc rejoin commands', () => {
  const parts = ['movie.mp4.001', 'movie.mp4.002', 'movie.mp4.003'];

  it('builds a Windows copy /b command with + separators', () => {
    expect(windowsCommand(parts, 'movie.mp4')).toBe(
      'copy /b "movie.mp4.001"+"movie.mp4.002"+"movie.mp4.003" "movie.mp4"'
    );
  });

  it('builds a Unix cat command', () => {
    expect(unixCommand(parts, 'movie.mp4')).toBe(
      'cat "movie.mp4.001" "movie.mp4.002" "movie.mp4.003" > "movie.mp4"'
    );
  });

  it('sorts parts numerically even when given out of order', () => {
    const kit = buildRejoinKit([parts[2], parts[0], parts[1]], 'movie.mp4');
    expect(kit.windows).toContain('movie.mp4.001"+"movie.mp4.002');
    expect(kit.unix.indexOf('.001')).toBeLessThan(kit.unix.indexOf('.003'));
  });

  it('handles names with spaces', () => {
    const kit = buildRejoinKit(['my file.001', 'my file.002'], 'my file');
    expect(kit.windows).toBe('copy /b "my file.001"+"my file.002" "my file"');
  });

  it('single part still produces a valid command', () => {
    expect(windowsCommand(['a.001'], 'a')).toBe('copy /b "a.001" "a"');
  });
});
