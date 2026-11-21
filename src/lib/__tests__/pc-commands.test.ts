import { buildRejoinKit, unixCommand, windowsCommand } from '../pc-commands';
import { toSafeBaseName } from '../safe-name';

describe('pc rejoin commands', () => {
  const parts = ['movie.mp4.001', 'movie.mp4.002', 'movie.mp4.003'];

  it('builds a Windows copy /b command with + separators', () => {
    expect(windowsCommand(parts, 'movie.mp4')).toBe(
      'copy /b "movie.mp4.001"+"movie.mp4.002"+"movie.mp4.003" "movie.mp4"'
    );
  });

  it('builds a Unix cat command with quoted operands', () => {
    expect(unixCommand(parts, 'movie.mp4')).toBe(
      `cat 'movie.mp4.001' 'movie.mp4.002' 'movie.mp4.003' > 'movie.mp4'`
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
    expect(kit.unsafeNames).toEqual([]);
  });

  it('single part still produces a valid command', () => {
    expect(windowsCommand(['a.001'], 'a')).toBe('copy /b "a.001" "a"');
  });

  describe('injection payloads', () => {
    // The original bug: `photo"&calc&".jpg` closed the quote and ran `calc`.
    const payloads = [
      'photo"&calc&".jpg',
      'a&calc&b.001',
      'x%USERPROFILE%y.001',
      'x"y.001',
      'x!PATH!y.001',
      'x^&y.001',
      'x|y.001',
      'x<y.001',
    ];

    it.each(payloads)('never emits a Windows command for %s', (name) => {
      expect(windowsCommand([name], 'out.bin')).toBe('');
      const kit = buildRejoinKit([name], 'out.bin');
      expect(kit.windows).toBe('');
      expect(kit.unsafeNames).toContain(name);
      expect(kit.note).toMatch(/rename/i);
    });

    it('refuses when only the output name is unsafe', () => {
      expect(windowsCommand(['safe.001'], 'out"&calc&".bin')).toBe('');
    });

    it.each([
      'a&calc&b.001',
      'semi;colon.001',
      'sub$(whoami).001',
      "quote'name.001",
      'dollar$var.001',
      'back`tick`.001',
    ])('quotes %s totally for POSIX shells', (name) => {
      const cmd = unixCommand([name], 'out.bin');
      expect(cmd).toBe(`cat '${name.replace(/'/g, `'\\''`)}' > 'out.bin'`);
    });

    it('keeps a legitimately punctuated name working on Windows', () => {
      expect(windowsCommand(['holiday (1) [final]-v2.001'], 'holiday (1) [final]-v2')).toBe(
        'copy /b "holiday (1) [final]-v2.001" "holiday (1) [final]-v2"'
      );
    });
  });
});

describe('toSafeBaseName', () => {
  it('strips paths and hostile characters', () => {
    expect(toSafeBaseName('/storage/emulated/0/photo"&calc&".jpg')).toBe('photo__calc__.jpg');
    expect(toSafeBaseName('C:\\Users\\a\\report%TEMP%.pdf')).toBe('report_TEMP_.pdf');
    expect(toSafeBaseName('...')).toBe('_');
    expect(toSafeBaseName('')).toBe('file');
  });

  it('keeps ordinary names untouched', () => {
    expect(toSafeBaseName('holiday video (1) [final]-v2.mp4')).toBe('holiday video (1) [final]-v2.mp4');
  });

  it('bounds length', () => {
    expect(toSafeBaseName('a'.repeat(500)).length).toBe(120);
  });
});
