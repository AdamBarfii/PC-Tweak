import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Milestone 3 Challenger: Frontend Settings & Localization Stress Tests', () => {
  const settingsViewPath = path.join(projectRoot, 'src', 'views', 'SettingsView.tsx');
  const switchComponentPath = path.join(projectRoot, 'src', 'components', 'common', 'Switch.tsx');
  const confirmDialogPath = path.join(projectRoot, 'src', 'components', 'common', 'ConfirmDialog.tsx');
  const settingsStorePath = path.join(projectRoot, 'electron', 'storage', 'settingsStore.ts');
  const preloadPath = path.join(projectRoot, 'electron', 'preload.ts');
  const electronDtsPath = path.join(projectRoot, 'src', 'types', 'electron.d.ts');
  const enLocalePath = path.join(projectRoot, 'src', 'locales', 'en', 'translation.json');
  const faLocalePath = path.join(projectRoot, 'src', 'locales', 'fa', 'translation.json');

  const settingsViewContent = fs.readFileSync(settingsViewPath, 'utf8');
  const switchComponentContent = fs.readFileSync(switchComponentPath, 'utf8');
  const confirmDialogContent = fs.readFileSync(confirmDialogPath, 'utf8');
  const settingsStoreContent = fs.readFileSync(settingsStorePath, 'utf8');
  const preloadContent = fs.readFileSync(preloadPath, 'utf8');
  const electronDtsContent = fs.readFileSync(electronDtsPath, 'utf8');
  const enLocale = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
  const faLocale = JSON.parse(fs.readFileSync(faLocalePath, 'utf8'));

  // Parse SettingsView.tsx into TypeScript AST
  const sfView = ts.createSourceFile(
    'SettingsView.tsx',
    settingsViewContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  // Helper to resolve nested dot-notation keys in JSON
  function getNestedKey(obj, keyPath) {
    const parts = keyPath.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  describe('1. Static / AST Localization Coverage', () => {
    it('extracts all t(...) translation keys via AST and verifies 100% presence in English translation.json', () => {
      const extractedKeys = new Set();

      function walk(node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isIdentifier(expr) && expr.text === 't') {
            const firstArg = node.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg)) {
              extractedKeys.add(firstArg.text);
            }
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      // Add preset keys referenced dynamically
      const presetKeys = [
        'settings.presetFast',
        'settings.presetBalanced',
        'settings.presetEco',
        'settings.presetLow',
        'settings.overheadFast',
        'settings.overheadModerate',
        'settings.overheadLow',
      ];
      presetKeys.forEach((k) => extractedKeys.add(k));

      assert.ok(
        extractedKeys.size >= 40,
        `Expected at least 40 translation keys, found ${extractedKeys.size}`
      );

      const missingInEn = [];
      for (const key of extractedKeys) {
        const val = getNestedKey(enLocale, key);
        if (typeof val !== 'string' || val.trim() === '') {
          missingInEn.push(key);
        }
      }

      assert.deepEqual(
        missingInEn,
        [],
        `The following translation keys are missing or empty in English translation.json: ${missingInEn.join(', ')}`
      );
    });

    it('extracts all t(...) translation keys via AST and verifies 100% presence in Persian translation.json', () => {
      const extractedKeys = new Set();

      function walk(node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isIdentifier(expr) && expr.text === 't') {
            const firstArg = node.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg)) {
              extractedKeys.add(firstArg.text);
            }
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      const presetKeys = [
        'settings.presetFast',
        'settings.presetBalanced',
        'settings.presetEco',
        'settings.presetLow',
        'settings.overheadFast',
        'settings.overheadModerate',
        'settings.overheadLow',
      ];
      presetKeys.forEach((k) => extractedKeys.add(k));

      const missingInFa = [];
      for (const key of extractedKeys) {
        const val = getNestedKey(faLocale, key);
        if (typeof val !== 'string' || val.trim() === '') {
          missingInFa.push(key);
        }
      }

      assert.deepEqual(
        missingInFa,
        [],
        `The following translation keys are missing or empty in Persian translation.json: ${missingInFa.join(', ')}`
      );
    });

    it('asserts 1:1 key parity between English and Persian dictionaries under the "settings" namespace', () => {
      assert.ok(enLocale.settings, 'enLocale must contain "settings" root object');
      assert.ok(faLocale.settings, 'faLocale must contain "settings" root object');

      const enSettingsKeys = Object.keys(enLocale.settings).sort();
      const faSettingsKeys = Object.keys(faLocale.settings).sort();

      const missingInFa = enSettingsKeys.filter((k) => !(k in faLocale.settings));
      const extraInFa = faSettingsKeys.filter((k) => !(k in enLocale.settings));

      assert.deepEqual(
        missingInFa,
        [],
        `Keys present in EN settings but missing in FA: ${missingInFa.join(', ')}`
      );
      assert.deepEqual(
        extraInFa,
        [],
        `Keys present in FA settings but missing in EN: ${extraInFa.join(', ')}`
      );
    });

    it('verifies dynamic RTL direction binding in SettingsView root and language switcher', () => {
      assert.ok(
        settingsViewContent.includes("dir={isRtl ? 'rtl' : 'ltr'}"),
        'SettingsView root must bind dir attribute dynamically'
      );
      assert.ok(
        settingsViewContent.includes("isRtl = i18n.language === 'fa'"),
        'isRtl must be evaluated from i18n.language'
      );
      assert.ok(
        settingsViewContent.includes("setAppLanguage(newLang)"),
        'Language switcher must invoke setAppLanguage'
      );
    });
  });

  describe('2. Zero Hardcoded User-Facing English Strings in JSX', () => {
    it('verifies all section headings (h1, h2) in SettingsView are wrapped in t(...)', () => {
      const headings = [];

      function walk(node) {
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(sfView);
          if (['h1', 'h2', 'h3'].includes(tag)) {
            headings.push({
              tag,
              children: node.children.map((c) => c.getText(sfView)).join(' ').trim(),
            });
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.ok(headings.length >= 7, `Expected at least 7 headings, found ${headings.length}`);
      for (const h of headings) {
        assert.ok(
          /\bt\(\s*['"]settings\./.test(h.children),
          `Heading <${h.tag}> must use t('settings...') for localization. Found: ${h.children}`
        );
      }
    });

    it('verifies all descriptive paragraphs (p) in SettingsView are wrapped in t(...) or dynamic text', () => {
      const paragraphs = [];

      function walk(node) {
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(sfView);
          if (tag === 'p') {
            paragraphs.push(node.children.map((c) => c.getText(sfView)).join(' ').trim());
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.ok(paragraphs.length >= 10, `Expected at least 10 paragraphs, found ${paragraphs.length}`);
      for (const text of paragraphs) {
        const isLocalized =
          /\bt\(\s*['"]settings\./.test(text) ||
          text.includes('statusBanner.text');
        assert.ok(
          isLocalized,
          `Paragraph <p> must be localized via t(...) or bound to dynamic status text. Found: ${text}`
        );
      }
    });

    it('verifies raw JSX text nodes contain zero untranslated English sentences', () => {
      const rawTextNodes = [];

      function walk(node) {
        if (ts.isJsxText(node)) {
          const text = node.getText(sfView).trim();
          if (text) {
            rawTextNodes.push(text);
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      // Allowed non-sentence tokens: technical direction acronyms, units, and parentheses
      const allowedTokens = new Set([
        'LTR',
        'RTL',
        'ms',
        '500 ms (',
        '1000 ms (',
        '2500 ms (',
        '5000 ms (',
        ')',
      ]);

      const unexpectedStrings = rawTextNodes.filter((t) => !allowedTokens.has(t));
      assert.deepEqual(
        unexpectedStrings,
        [],
        `Found unexpected hardcoded JSX text nodes in SettingsView: ${JSON.stringify(unexpectedStrings)}`
      );
    });

    it('verifies all button labels and titles are localized with t(...)', () => {
      const buttons = [];

      function walk(node) {
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(sfView);
          if (tag === 'button') {
            const children = node.children.map((c) => c.getText(sfView)).join(' ').trim();
            const titleAttr = node.openingElement.attributes.properties.find(
              (p) => ts.isJsxAttribute(p) && p.name.getText(sfView) === 'title'
            );
            buttons.push({
              children,
              title: titleAttr ? titleAttr.getText(sfView) : null,
            });
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.ok(buttons.length >= 8, `Expected at least 8 buttons, found ${buttons.length}`);
      for (const btn of buttons) {
        const hasTInChild =
          /\bt\(\s*['"](settings|common)\./.test(btn.children) ||
          btn.children.includes("t(preset.labelKey)");
        const hasTInTitle =
          btn.title && /\bt\(\s*['"](settings|common)\./.test(btn.title);

        assert.ok(
          hasTInChild || hasTInTitle,
          `Button must have localized text or title. Found: ${JSON.stringify(btn)}`
        );
      }
    });

    it('verifies all ConfirmDialog prompts and actions are fully localized', () => {
      const dialogs = [];

      function walk(node) {
        let tag = null;
        let attrsNode = null;

        if (ts.isJsxSelfClosingElement(node)) {
          tag = node.tagName.getText(sfView);
          attrsNode = node.attributes;
        } else if (ts.isJsxElement(node)) {
          tag = node.openingElement.tagName.getText(sfView);
          attrsNode = node.openingElement.attributes;
        }

        if (tag === 'ConfirmDialog' && attrsNode) {
          const props = {};
          attrsNode.properties.forEach((p) => {
            if (ts.isJsxAttribute(p)) {
              props[p.name.getText(sfView)] = p.initializer ? p.initializer.getText(sfView) : 'true';
            }
          });
          dialogs.push(props);
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.equal(dialogs.length, 2, 'SettingsView must contain exactly 2 ConfirmDialog instances');

      for (const d of dialogs) {
        assert.ok(
          d.title && /\bt\(\s*['"]settings\./.test(d.title),
          'Dialog title must be localized via t(...)'
        );
        assert.ok(
          d.message && /\bt\(\s*['"]settings\./.test(d.message),
          'Dialog message must be localized via t(...)'
        );
        assert.ok(
          d.confirmLabel && /\bt\(\s*['"]settings\./.test(d.confirmLabel),
          'Dialog confirmLabel must be localized via t(...)'
        );
        assert.ok(
          d.cancelLabel && /\bt\(\s*['"]settings\./.test(d.cancelLabel),
          'Dialog cancelLabel must be localized via t(...)'
        );
      }
    });
  });

  describe('3. Settings Default Parity & Model Consistency', () => {
    it('verifies DEFAULT_APP_SETTINGS in SettingsView.tsx exactly matches DEFAULT_SETTINGS in settingsStore.ts', () => {
      let viewDefaults = null;
      function walkView(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(sfView) === 'DEFAULT_APP_SETTINGS') {
          if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            viewDefaults = eval('(' + node.initializer.getText(sfView) + ')');
          }
        }
        ts.forEachChild(node, walkView);
      }
      walkView(sfView);

      const sfStore = ts.createSourceFile(
        'settingsStore.ts',
        settingsStoreContent,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      let storeDefaults = null;
      function walkStore(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(sfStore) === 'DEFAULT_SETTINGS') {
          if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            storeDefaults = eval('(' + node.initializer.getText(sfStore) + ')');
          }
        }
        ts.forEachChild(node, walkStore);
      }
      walkStore(sfStore);

      assert.ok(viewDefaults, 'DEFAULT_APP_SETTINGS must be exported in SettingsView.tsx');
      assert.ok(storeDefaults, 'DEFAULT_SETTINGS must be defined in settingsStore.ts');

      assert.deepEqual(
        viewDefaults,
        storeDefaults,
        'DEFAULT_APP_SETTINGS in SettingsView must match DEFAULT_SETTINGS in settingsStore.ts'
      );

      // Verify canonical baseline values
      assert.equal(viewDefaults.launchOnStartup, false);
      assert.equal(viewDefaults.minimizeToTray, true);
      assert.equal(viewDefaults.closeToTray, true);
      assert.equal(viewDefaults.language, 'en');
      assert.equal(viewDefaults.hardwarePollingInterval, 1000);
      assert.equal(viewDefaults.autoUpdate, true);
      assert.equal(viewDefaults.theme, 'dark');
    });

    it('verifies AppSettings interface alignment in src/types/electron.d.ts', () => {
      assert.ok(electronDtsContent.includes('export interface AppSettings {'));
      assert.ok(electronDtsContent.includes('launchOnStartup: boolean;'));
      assert.ok(electronDtsContent.includes('minimizeToTray: boolean;'));
      assert.ok(electronDtsContent.includes('closeToTray: boolean;'));
      assert.ok(electronDtsContent.includes("language: 'en' | 'fa';"));
      assert.ok(electronDtsContent.includes('hardwarePollingInterval: number;'));
      assert.ok(electronDtsContent.includes('autoUpdate: boolean;'));
      assert.ok(electronDtsContent.includes("theme: 'dark' | 'light' | 'system';"));
    });
  });

  describe('4. Telemetry Polling Presets & Bounds Verification', () => {
    let presets = null;

    it('extracts POLLING_PRESETS and verifies bounds [500ms, 5000ms] and ascending sort', () => {
      function walk(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(sfView) === 'POLLING_PRESETS') {
          if (node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
            presets = eval('(' + node.initializer.getText(sfView) + ')');
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.ok(Array.isArray(presets), 'POLLING_PRESETS must be defined as an array in SettingsView.tsx');
      assert.ok(presets.length >= 4, `Expected at least 4 presets, found ${presets.length}`);

      for (let i = 0; i < presets.length; i++) {
        const p = presets[i];
        assert.ok(typeof p.value === 'number', `Preset ${i} value must be a number`);
        assert.ok(
          p.value >= 500 && p.value <= 5000,
          `Preset value ${p.value} must be strictly bounded between 500 and 5000 ms`
        );
        assert.ok(typeof p.labelKey === 'string' && p.labelKey.startsWith('settings.'), 'labelKey must be a settings i18n key');
        assert.ok(typeof p.sec === 'string' && p.sec.endsWith('s'), 'sec must be formatted with "s" suffix');
        assert.ok(typeof p.overheadKey === 'string' && p.overheadKey.startsWith('settings.'), 'overheadKey must be a settings i18n key');

        if (i > 0) {
          assert.ok(
            p.value > presets[i - 1].value,
            `Presets must be strictly monotonically sorted in ascending order. ${p.value} <= ${presets[i - 1].value}`
          );
        }
      }
    });

    it('verifies preset keys exist in both English and Persian dictionaries', () => {
      assert.ok(presets, 'presets must have been extracted');
      for (const p of presets) {
        const enLabel = getNestedKey(enLocale, p.labelKey);
        const faLabel = getNestedKey(faLocale, p.labelKey);
        assert.ok(typeof enLabel === 'string' && enLabel.length > 0, `Missing EN for ${p.labelKey}`);
        assert.ok(typeof faLabel === 'string' && faLabel.length > 0, `Missing FA for ${p.labelKey}`);

        const enOverhead = getNestedKey(enLocale, p.overheadKey);
        const faOverhead = getNestedKey(faLocale, p.overheadKey);
        assert.ok(typeof enOverhead === 'string' && enOverhead.length > 0, `Missing EN for ${p.overheadKey}`);
        assert.ok(typeof faOverhead === 'string' && faOverhead.length > 0, `Missing FA for ${p.overheadKey}`);
      }
    });

    it('verifies slider input enforces min 500, max 5000, step 250 and ARIA value attributes', () => {
      assert.ok(settingsViewContent.includes('min={500}'), 'Slider must have min={500}');
      assert.ok(settingsViewContent.includes('max={5000}'), 'Slider must have max={5000}');
      assert.ok(settingsViewContent.includes('step={250}'), 'Slider must have step={250}');
      assert.ok(settingsViewContent.includes('aria-valuemin={500}'), 'Slider must have aria-valuemin={500}');
      assert.ok(settingsViewContent.includes('aria-valuemax={5000}'), 'Slider must have aria-valuemax={5000}');
      assert.ok(settingsViewContent.includes('aria-valuenow={sliderValue}'), 'Slider must have aria-valuenow={sliderValue}');
      assert.ok(
        settingsViewContent.includes('aria-valuetext='),
        'Slider must declare aria-valuetext for screen readers'
      );
    });
  });

  describe('5. Accessibility Attributes & Semantic Compliance', () => {
    it('verifies Switch component declares role="switch", aria-checked, and aria-label', () => {
      assert.ok(
        switchComponentContent.includes('role="switch"'),
        'Switch component must render role="switch"'
      );
      assert.ok(
        switchComponentContent.includes('aria-checked={checked}'),
        'Switch component must declare aria-checked={checked}'
      );
      assert.ok(
        switchComponentContent.includes('aria-label={ariaLabel'),
        'Switch component must bind aria-label from ariaLabel prop'
      );
      assert.ok(
        switchComponentContent.includes('aria-busy={isLoading}'),
        'Switch component must declare aria-busy={isLoading}'
      );
    });

    it('verifies all 4 toggles in SettingsView supply localized ariaLabel props', () => {
      const switches = [];

      function walk(node) {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
          const tagName = node.tagName.getText(sfView);
          if (tagName === 'Switch') {
            const attrs = {};
            node.attributes.properties.forEach((p) => {
              if (ts.isJsxAttribute(p)) {
                attrs[p.name.getText(sfView)] = p.initializer ? p.initializer.getText(sfView) : 'true';
              }
            });
            switches.push(attrs);
          }
        }
        ts.forEachChild(node, walk);
      }
      walk(sfView);

      assert.equal(switches.length, 4, 'SettingsView must contain exactly 4 Switch controls');

      const expectedCheckedBindings = [
        '{settings.launchOnStartup}',
        '{settings.minimizeToTray}',
        '{settings.closeToTray}',
        '{settings.autoUpdate}',
      ];

      for (let i = 0; i < switches.length; i++) {
        const sw = switches[i];
        assert.equal(
          sw.checked,
          expectedCheckedBindings[i],
          `Switch ${i} must bind checked to ${expectedCheckedBindings[i]}`
        );
        assert.ok(sw.ariaLabel, `Switch ${i} must have an ariaLabel prop`);
        assert.ok(
          /\bt\(\s*['"]settings\./.test(sw.ariaLabel),
          `Switch ${i} ariaLabel must be localized via t('settings...'). Found: ${sw.ariaLabel}`
        );
      }
    });

    it('verifies polling interval slider is bound to an accessible label via htmlFor', () => {
      assert.ok(
        settingsViewContent.includes('id="polling-interval-slider"'),
        'Slider input must have id="polling-interval-slider"'
      );
      assert.ok(
        settingsViewContent.includes('htmlFor="polling-interval-slider"'),
        'Label must associate with slider via htmlFor="polling-interval-slider"'
      );
    });

    it('verifies ConfirmDialog component handles Escape key (WCAG 2.2 / R-26)', () => {
      assert.ok(
        confirmDialogContent.includes("e.key === 'Escape'"),
        'ConfirmDialog must listen for Escape key to cancel'
      );
      assert.ok(
        confirmDialogContent.includes('role="dialog"'),
        'ConfirmDialog must have role="dialog"'
      );
      assert.ok(
        confirmDialogContent.includes('aria-modal="true"'),
        'ConfirmDialog must have aria-modal="true"'
      );
      assert.ok(
        confirmDialogContent.includes('aria-labelledby="confirm-dialog-title"'),
        'ConfirmDialog must bind aria-labelledby'
      );
      assert.ok(
        confirmDialogContent.includes('aria-describedby="confirm-dialog-message"'),
        'ConfirmDialog must bind aria-describedby'
      );
    });
  });

  describe('6. Danger Zone Destructive Action & Safety Confirmation', () => {
    it('verifies factory wipe button has prominent destructive styling', () => {
      assert.ok(
        settingsViewContent.includes('border-red-500/30') &&
          settingsViewContent.includes('text-red-400') &&
          settingsViewContent.includes('bg-red-500/10') &&
          settingsViewContent.includes('hover:bg-red-600'),
        'Factory wipe button must feature red destructive styling and hover states'
      );
    });

    it('verifies factory wipe triggers ConfirmDialog with isDestructive={true}', () => {
      const wipeDialogMatch = settingsViewContent.match(
        /<ConfirmDialog[\s\S]*?isOpen=\{factoryWipeOpen\}[\s\S]*?\/>/
      );
      assert.ok(wipeDialogMatch, 'Factory wipe ConfirmDialog must exist and bind to factoryWipeOpen');
      assert.ok(
        wipeDialogMatch[0].includes('isDestructive={true}'),
        'Factory wipe dialog must explicitly set isDestructive={true}'
      );
      assert.ok(
        wipeDialogMatch[0].includes("title={t('settings.confirmFactoryWipeTitle'"),
        'Factory wipe dialog must have localized title'
      );
    });

    it('verifies default reset button has amber/caution styling and isDestructive={false}', () => {
      const resetDialogMatch = settingsViewContent.match(
        /<ConfirmDialog[\s\S]*?isOpen=\{resetDefaultsOpen\}[\s\S]*?\/>/
      );
      assert.ok(resetDialogMatch, 'Default reset ConfirmDialog must exist and bind to resetDefaultsOpen');
      assert.ok(
        resetDialogMatch[0].includes('isDestructive={false}'),
        'Default reset dialog must set isDestructive={false}'
      );
    });

    it('verifies ConfirmDialog conditionally renders bg-destructive when isDestructive is true', () => {
      assert.ok(
        confirmDialogContent.includes(
          "isDestructive\n                ? 'bg-destructive/15 text-destructive'"
        ) ||
          confirmDialogContent.includes("isDestructive") &&
          confirmDialogContent.includes("'bg-destructive hover:bg-destructive/90 text-destructive-foreground'"),
        'ConfirmDialog must apply destructive classes to action button when isDestructive is true'
      );
    });
  });

  describe('7. IPC Bridge & Preload Parity', () => {
    it('verifies electron/preload.ts exposes all settings methods on window.electronAPI', () => {
      const expectedMethods = [
        'getSettings',
        'setSettings',
        'updateSettings',
        'resetSettings',
        'resetAppData',
      ];

      for (const method of expectedMethods) {
        assert.ok(
          preloadContent.includes(`${method}:`),
          `preload.ts must expose ${method} on window.electronAPI`
        );
      }
    });

    it('verifies src/types/electron.d.ts declares all settings methods with accurate signatures', () => {
      assert.ok(electronDtsContent.includes('getSettings: () => Promise<AppSettings>;'));
      assert.ok(
        electronDtsContent.includes(
          'setSettings: (partial: Partial<AppSettings>) => Promise<SettingsUpdateResult>;'
        )
      );
      assert.ok(
        electronDtsContent.includes(
          'updateSettings: (partial: Partial<AppSettings>) => Promise<SettingsUpdateResult>;'
        )
      );
      assert.ok(electronDtsContent.includes('resetSettings: () => Promise<SettingsUpdateResult>;'));
      assert.ok(electronDtsContent.includes('resetAppData: () => Promise<ResetAppDataResult>;'));
    });
  });
});
