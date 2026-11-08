import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import asar from '@electron/asar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releaseDir = path.join(rootDir, 'release', 'PC-Tweak');
const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');

console.log('==> Packaging PC Tweak App into standalone directory...');

// 1. Ensure release dir exists and has electron runtime
fs.mkdirSync(releaseDir, { recursive: true });

const targetExe = path.join(releaseDir, 'PC Tweak.exe');
if (!fs.existsSync(targetExe)) {
  console.log('==> Copying Electron runtime...');
  fs.cpSync(electronDist, releaseDir, { recursive: true });
  const defaultExe = path.join(releaseDir, 'electron.exe');
  if (fs.existsSync(defaultExe)) {
    fs.renameSync(defaultExe, targetExe);
  }
}

// 4. Create resources/app and remove default_app.asar
console.log('==> Assembling app bundle in resources/app...');
const defaultAppAsar = path.join(releaseDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAppAsar)) {
  fs.rmSync(defaultAppAsar, { force: true });
}
const appDir = path.join(releaseDir, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });

// Copy dist, dist-electron, data, and package.json
fs.cpSync(path.join(rootDir, 'dist'), path.join(appDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'dist-electron'), path.join(appDir, 'dist-electron'), { recursive: true });
const stalePreloadJs = path.join(appDir, 'dist-electron', 'preload.js');
if (fs.existsSync(stalePreloadJs)) {
  fs.rmSync(stalePreloadJs, { force: true });
}
fs.cpSync(path.join(rootDir, 'data'), path.join(appDir, 'data'), { recursive: true });

// Write production package.json into resources/app
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const prodPkg = {
  name: pkg.name,
  version: pkg.version,
  main: 'dist-electron/main.js',
  type: 'module',
  dependencies: pkg.dependencies,
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(prodPkg, null, 2));

// Copy production dependencies from node_modules
console.log('==> Bundling runtime dependencies...');
const appNodeModules = path.join(appDir, 'node_modules');
fs.mkdirSync(appNodeModules, { recursive: true });

const prodDeps = Object.keys(pkg.dependencies || {});
for (const dep of prodDeps) {
  const srcDep = path.join(rootDir, 'node_modules', dep);
  const dstDep = path.join(appNodeModules, dep);
  if (fs.existsSync(srcDep)) {
    fs.cpSync(srcDep, dstDep, { recursive: true, dereference: true });
  }
}

// 5. Pack into resources/app.asar for native standalone execution
console.log('==> Packing app bundle into resources/app.asar...');
const asarTarget = path.join(releaseDir, 'resources', 'app.asar');
await asar.createPackage(appDir, asarTarget);
fs.rmSync(appDir, { recursive: true, force: true });

// Also create a convenient elevated launcher in root of PC Tweak
const launcherBat = `@echo off
cd /d "%~dp0"
powershell -Command "Start-Process -FilePath '%~dp0release\\PC-Tweak\\PC Tweak.exe' -Verb RunAs"
`;
fs.writeFileSync(path.join(rootDir, 'Launch-PC-Tweak-Admin.bat'), launcherBat);

// Also copy Emergency-Revert.bat and resources to release dir
const emergencyBat = path.join(rootDir, 'Emergency-Revert.bat');
if (fs.existsSync(emergencyBat)) {
  fs.copyFileSync(emergencyBat, path.join(releaseDir, 'Emergency-Revert.bat'));
}

const resourcesDir = path.join(rootDir, 'resources');
if (fs.existsSync(resourcesDir)) {
  fs.cpSync(resourcesDir, path.join(releaseDir, 'resources'), { recursive: true });
}

// 6. Ensure Windows Explorer automatically triggers UAC on double click
try {
  execSync(
    `reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "${targetExe}" /t REG_SZ /d "RUNASADMIN" /f`,
    { stdio: 'ignore' }
  );
  console.log('==> Set native Windows AppCompatFlags: RUNASADMIN configured for PC Tweak.exe');
} catch {}

console.log('==> Successfully built standalone executable:');
console.log(targetExe);
