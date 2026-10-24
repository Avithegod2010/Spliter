/**
 * PC Rejoin Kit — exact shell commands that rebuild the original file from
 * Spliter parts on any desktop, no software required.
 */

export function windowsCommand(partNames: string[], outputName: string): string {
  const joined = partNames.map((n) => `"${n}"`).join('+');
  return `copy /b ${joined} "${outputName}"`;
}

export function unixCommand(partNames: string[], outputName: string): string {
  const joined = partNames.map((n) => `"${n}"`).join(' ');
  return `cat ${joined} > "${outputName}"`;
}

export interface RejoinKit {
  windows: string;
  unix: string;
  note: string;
}

export function buildRejoinKit(partNames: string[], outputName: string): RejoinKit {
  const ordered = [...partNames].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return {
    windows: windowsCommand(ordered, outputName),
    unix: unixCommand(ordered, outputName),
    note: 'Run inside the folder that contains the parts. All parts must be in the same folder.',
  };
}
