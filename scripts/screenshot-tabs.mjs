// Screenshot automation: walks Spliter's tabs on a connected device and
// captures PNGs into .github/screenshots/. Requires one wireless/USB device
// paired with adb and the app in the foreground.
//
// Usage: node scripts/screenshot-tabs.mjs [deviceSerial]
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.github', 'screenshots');
const serial = process.argv[2];
const adb = (args) => execSync(`adb ${serial ? `-s ${serial}` : ''} ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

const tabs = [
  { name: 'split', x: 135, y: 2210 },
  { name: 'rejoin', x: 415, y: 2210 },
  { name: 'history', x: 690, y: 2210 },
  { name: 'settings', x: 962, y: 2210 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = adb('devices').split('\n').filter((l) => l.trim().endsWith('device'));
if (!devices.length) {
  console.error('No adb device found. Connect the phone (wireless: adb connect <ip:port>).');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
console.log('Capturing', tabs.length, 'tabs...');

// Bring Spliter to the foreground first.
adb('shell monkey -p com.avithegod.spliter -c android.intent.category.LAUNCHER 1');
await sleep(4000);

for (const tab of tabs) {
  adb(`shell input tap ${tab.x} ${tab.y}`);
  await sleep(2500);
  adb('shell screencap -p /sdcard/spliter-shot.png');
  adb(`pull /sdcard/spliter-shot.png "${join(outDir, `${tab.name}.png`)}"`);
  adb('shell rm /sdcard/s.png');
  rmSync(join(outDir, 'spliter-shot.png'), { force: true });
  console.log('captured', tab.name);
}

console.log('Done →', outDir);
