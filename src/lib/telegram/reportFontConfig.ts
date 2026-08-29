import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPORT_FONT_DIRECTORY = join(process.cwd(), 'src', 'assets', 'fonts');
export const REPORT_FONT_FILES = [
  'NotoSans-Regular.ttf',
  'NotoSans-Bold.ttf',
  'NotoSans-ExtraBold.ttf',
] as const;

const configDirectory = join(tmpdir(), 'game-club-finance-fontconfig');
const cacheDirectory = join(tmpdir(), 'game-club-finance-font-cache');
const configPath = join(configDirectory, 'fonts.conf');

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

mkdirSync(configDirectory, { recursive: true });
mkdirSync(cacheDirectory, { recursive: true });
writeFileSync(configPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(REPORT_FONT_DIRECTORY)}</dir>
  <cachedir>${escapeXml(cacheDirectory)}</cachedir>
  <alias>
    <family>Noto Sans</family>
    <prefer><family>Noto Sans</family></prefer>
  </alias>
</fontconfig>`);

// This module must be evaluated before the static Sharp import. libvips/Pango
// reads Fontconfig during native initialization, so setting it inside the
// render function is too late on a cold Vercel Linux runtime.
process.env.FONTCONFIG_FILE = configPath;
process.env.FONTCONFIG_PATH = configDirectory;

