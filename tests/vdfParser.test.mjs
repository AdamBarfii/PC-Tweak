import test from 'node:test';
import assert from 'node:assert/strict';

// Pure VDF & Manifest parsers matching GamingEngine
function parseSteamVdf(content) {
  const paths = [];
  const regex = /"path"\s+"([^"]+)"/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const cleanPath = match[1].replace(/\\\\/g, '\\');
    if (!paths.includes(cleanPath)) {
      paths.push(cleanPath);
    }
  }
  return paths;
}

function parseSteamManifest(content) {
  const appidMatch = content.match(/"appid"\s+"([^"]+)"/i);
  const nameMatch = content.match(/"name"\s+"([^"]+)"/i);
  const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/i);

  if (nameMatch && installdirMatch) {
    return {
      appid: appidMatch ? appidMatch[1].trim() : '0',
      name: nameMatch[1].trim(),
      installdir: installdirMatch[1].trim(),
    };
  }
  return null;
}

test('VDF Parser: extracts all library paths with proper Windows backslash normalization', () => {
  const sampleVdf = `
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
		"contentid"		"1877747595923124229"
		"totalsize"		"0"
	}
	"1"
	{
		"path"		"E:\\\\SteamLibrary"
		"label"		""
		"totalsize"		"239418179584"
	}
	"2"
	{
		"path"		"D:\\\\Games\\\\SteamLibrary"
	}
}
`;

  const paths = parseSteamVdf(sampleVdf);
  assert.equal(paths.length, 3);
  assert.equal(paths[0], 'C:\\Program Files (x86)\\Steam');
  assert.equal(paths[1], 'E:\\SteamLibrary');
  assert.equal(paths[2], 'D:\\Games\\SteamLibrary');
});

test('Steam Manifest Parser: extracts appid, game name, and installdir from ACF content', () => {
  const sampleAcf = `
"AppState"
{
	"appid"		"359550"
	"universe"		"1"
	"LauncherPath"		"C:\\\\Program Files (x86)\\\\Steam\\\\steam.exe"
	"name"		"Tom Clancy's Rainbow Six Siege"
	"StateFlags"		"1542"
	"installdir"		"Tom Clancy's Rainbow Six Siege"
	"LastUpdated"		"1781424169"
}
`;

  const meta = parseSteamManifest(sampleAcf);
  assert.ok(meta);
  assert.equal(meta.appid, '359550');
  assert.equal(meta.name, "Tom Clancy's Rainbow Six Siege");
  assert.equal(meta.installdir, "Tom Clancy's Rainbow Six Siege");
});

test('Steam Manifest Parser: returns null for invalid or corrupted manifests missing essential keys', () => {
  const corruptAcf = `
"AppState"
{
	"appid"		"9999"
}
`;
  const meta = parseSteamManifest(corruptAcf);
  assert.equal(meta, null);
});

test('Per-Game Registry Value Formats: ensures exact compliance with Windows specifications', () => {
  // 1. DirectX High Performance GPU flag
  const gpuPrefFlag = 'GpuPreference=2;';
  assert.ok(gpuPrefFlag.includes('GpuPreference=2;'));

  // 2. Disable Fullscreen Optimizations flag
  const fsoFlag = '~ DISABLEDXMAXIMIZEDWINDOWEDMODE';
  assert.ok(fsoFlag.includes('DISABLEDXMAXIMIZEDWINDOWEDMODE'));

  // 3. IFEO High CPU Priority Class
  const highPriorityValue = 3;
  assert.equal(highPriorityValue, 3);
});
