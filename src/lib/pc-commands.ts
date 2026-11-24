/**
 * PC Rejoin Kit — exact shell commands that rebuild the original file from
 * Spliter parts on any desktop, no software required.
 *
 * SECURITY: part and output names can originate from another app's content
 * provider. They are never interpolated raw:
 *   - cmd.exe: a name containing `"` closes the quote (`&` then starts a new
 *     command) and `%VAR%` expands even inside quotes, so such names cannot be
 *     embedded at all — the kit reports them as unsafe instead of guessing.
 *   - POSIX: single quotes, with `'` escaped as `'\''`, which is total.
 */

import { isCmdSafeName, posixQuote } from './safe-name';

export function windowsCommand(partNames: string[], outputName: string): string {
  const unsafe = [...partNames, outputName].filter((n) => !isCmdSafeName(n));
  if (unsafe.length > 0) {
    // Refusing to emit is the only safe answer: any quoting we invent here
    // would be defeated by the name itself.
    return '';
  }
  const joined = partNames.map((n) => `"${n}"`).join('+');
  return `copy /b ${joined} "${outputName}"`;
}

export function unixCommand(partNames: string[], outputName: string): string {
  const joined = partNames.map((n) => posixQuote(n)).join(' ');
  return `cat ${joined} > ${posixQuote(outputName)}`;
}

export interface RejoinKit {
  windows: string;
  unix: string;
  note: string;
  /** Names that cannot be embedded in a cmd.exe command; empty when all are safe. */
  unsafeNames: string[];
}

export function buildRejoinKit(partNames: string[], outputName: string): RejoinKit {
  const ordered = [...partNames].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const windows = windowsCommand(ordered, outputName);
  const unsafeNames = [...ordered, outputName].filter((n) => !isCmdSafeName(n));
  const note =
    unsafeNames.length > 0
      ? 'Windows: rename these parts in Explorer first (they contain characters a command line cannot safely carry: ' +
        `${unsafeNames.map((n) => JSON.stringify(n)).join(', ')}). The macOS / Linux command works as-is. ` +
        'All parts must be in the same folder.'
      : 'Run inside the folder that contains the parts. All parts must be in the same folder.';
  return { windows, unix: unixCommand(ordered, outputName), note, unsafeNames };
}
