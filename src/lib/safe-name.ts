/**
 * Filename hardening for names that leave the app: they are written to disk by
 * the native module and later interpolated into shell commands the user is told
 * to paste. A display name from another app's content provider is attacker
 * controlled, so every name that reaches either destination goes through here.
 */

const MAX_LEN = 120;

/** Characters that are dangerous or meaningless in a filename handed to cmd.exe/sh. */
const HOSTILE = /["%!&|<>^$`;:*?\\/\x00-\x1f\x7f]/g;

/**
 * Turn an untrusted display name (possibly a full URI path) into a plain,
 * shell-safe file base name. Never returns an empty string.
 */
export function toSafeBaseName(raw: string): string {
  const withoutPath = String(raw ?? '').split(/[\\/]/).pop() ?? '';
  const flattened = withoutPath.replace(/[\r\n\t]+/g, ' ').replace(HOSTILE, '_');
  const collapsed = flattened.replace(/\s+/g, ' ').trim();
  const noLeadingDots = collapsed.replace(/^\.+/, '_');
  const bounded = noLeadingDots.slice(0, MAX_LEN).trim();
  return bounded || 'file';
}

/**
 * True when a name can be embedded in a cmd.exe command line inside double
 * quotes without changing what the command does. Inside quotes cmd treats
 * `& | < > ^` literally, but `"` closes the quote and `%VAR%` still expands.
 */
export function isCmdSafeName(name: string): boolean {
  return !/["%!\x00-\x1f\x7f]/.test(name) && name.length > 0;
}

/** POSIX single-quote wrapper: safe for every byte except the quote itself, which is escaped. */
export function posixQuote(name: string): string {
  return `'${name.replace(/'/g, `'\\''`)}'`;
}
