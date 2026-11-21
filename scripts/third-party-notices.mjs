// Vite build plugin: writes THIRD-PARTY-NOTICES.txt into dist/ (embedded into the exe with the frontend).
//
// npm: only packages whose code actually ends up in the bundle (chunk.modules with rendered code),
// so packages that are installed but tree-shaken away are not listed.
// Rust: normal (non-build, non-dev) dependencies of the app for the Windows target, via `cargo metadata`.
// Fails the build on a license that is incompatible with the GPL; unknown licenses only warn.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_NAME = 'THIRD-PARTY-NOTICES.txt';
const RULE = '='.repeat(80);
const THIN_RULE = '-'.repeat(80);

// Licenses that may be combined with a GPL-3.0-or-later program.
// GPL-2.0-only is deliberately absent: it is not compatible with GPLv3.
const ALLOWED = new Set([
  'MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Zlib',
  'Unicode-3.0', 'Unicode-DFS-2016', 'BSL-1.0', 'CC0-1.0', 'CDLA-Permissive-2.0', 'Unlicense',
  'MPL-2.0', 'BlueOak-1.0.0', 'Python-2.0', 'W3C-20150513', 'CC-BY-4.0',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-3.0+', 'GPL-2.0-or-later', 'GPL-2.0+',
  'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-2.1+',
  'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'LGPL-3.0+',
]);
const FORBIDDEN_IDS = new Set(['UNLICENSED', 'LicenseRef-see-file']);
const FORBIDDEN_TEXT = [
  /sustainable use license/i,
  /business source license/i,
  /server side public license/i,
  /commons clause/i,
];

const RANK = { forbidden: 0, unknown: 1, ok: 2 };

/** Normalizes old-style expressions ("MIT/Apache-2.0", "SEE LICENSE IN x") into SPDX tokens. */
function normalizeExpression(expr) {
  return String(expr)
    .replace(/SEE LICENSE IN \S+/gi, 'LicenseRef-see-file')
    .replace(/\s*\/\s*/g, ' OR ')
    .trim();
}

/** Evaluates an SPDX expression: 'ok' | 'unknown' | 'forbidden'. OR takes the best branch, AND the worst. */
export function checkLicense(expr) {
  if (!expr) return 'unknown';
  const tokens = normalizeExpression(expr).match(/\(|\)|[^\s()]+/g) || [];
  let pos = 0;
  const pick = (a, b, best) => ((RANK[a] > RANK[b]) === best ? a : b);

  function primary() {
    const t = tokens[pos++];
    if (t === '(') {
      const v = orExpr();
      pos++; // ')'
      return v;
    }
    if (t === undefined) return 'unknown';
    // "Apache-2.0 WITH LLVM-exception": the exception only adds permissions
    if (tokens[pos] && tokens[pos].toUpperCase() === 'WITH') pos += 2;
    if (FORBIDDEN_IDS.has(t)) return 'forbidden';
    return ALLOWED.has(t) ? 'ok' : 'unknown';
  }
  function andExpr() {
    let v = primary();
    while (tokens[pos] && tokens[pos].toUpperCase() === 'AND') {
      pos++;
      v = pick(v, primary(), false);
    }
    return v;
  }
  function orExpr() {
    let v = andExpr();
    while (tokens[pos] && tokens[pos].toUpperCase() === 'OR') {
      pos++;
      v = pick(v, andExpr(), true);
    }
    return v;
  }
  return orExpr();
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;
const NOT_A_TEXT = /\.(js|cjs|mjs|ts|json|map|html)$/i;

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').trim();
  } catch {
    return null;
  }
}

/** License texts of a package directory. For "X OR MIT" with a separate MIT file, only the MIT file. */
function licenseTexts(dir, expr, licenseFile) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => {
      if (!LICENSE_FILE.test(n) || NOT_A_TEXT.test(n)) return false;
      try {
        return fs.statSync(path.join(dir, n)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    // directory unreadable: no texts
  }
  if (licenseFile && !names.includes(path.basename(licenseFile))) {
    const rel = path.relative(dir, path.resolve(dir, licenseFile));
    names.push(rel);
  }

  const alternatives = normalizeExpression(expr || '').split(/\s+OR\s+/i).map((s) => s.replace(/[()]/g, '').trim());
  const mitFile = names.find((n) => /licen[cs]e[-_.]?mit/i.test(n));
  if (alternatives.length > 1 && alternatives.includes('MIT') && mitFile) {
    names = names.filter((n) => n === mitFile || /^notice/i.test(n));
  }

  return names
    .sort()
    .map((n) => ({ file: n, content: readText(path.join(dir, n)) }))
    .filter((t) => t.content);
}

/** Package root directory for a bundled module id, or null for non-package modules. */
function packageRoot(id) {
  if (!id || id.startsWith('\0')) return null;
  const clean = id.split('?')[0].replace(/\\/g, '/');
  const marker = '/node_modules/';
  const idx = clean.lastIndexOf(marker);
  if (idx < 0) return null;
  const rest = clean.slice(idx + marker.length).split('/');
  const parts = rest[0].startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1);
  if (parts.length === 0 || !parts[parts.length - 1]) return null;
  return clean.slice(0, idx + marker.length) + parts.join('/');
}

function npmPackages(bundle) {
  const roots = new Set();
  const addId = (id) => {
    const r = packageRoot(id);
    if (r) roots.add(r);
  };
  for (const item of Object.values(bundle)) {
    if (item.type === 'chunk') {
      for (const [id, info] of Object.entries(item.modules)) {
        const isStyle = /\.(css|scss|sass|less)$/i.test(id.split('?')[0]);
        if (info.renderedLength > 0 || isStyle) addId(id);
      }
    } else if (Array.isArray(item.originalFileNames)) {
      for (const f of item.originalFileNames) addId(path.isAbsolute(f) ? f : path.join(ROOT, f));
    }
  }

  const packages = new Map();
  for (const root of roots) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (packages.has(key)) continue;
    let license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
    if (!license && Array.isArray(pkg.licenses)) {
      license = pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).filter(Boolean).join(' OR ');
    }
    packages.set(key, { source: 'npm', name: pkg.name, version: pkg.version, license: license || '', dir: root });
  }
  return [...packages.values()];
}

function rustPackages() {
  const out = execFileSync(
    'cargo',
    [
      'metadata', '--format-version', '1',
      '--manifest-path', path.join(ROOT, 'src-tauri', 'Cargo.toml'),
      '--filter-platform', 'x86_64-pc-windows-msvc',
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const meta = JSON.parse(out);
  const byId = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const rootId = meta.resolve.root;

  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const node = nodes.get(queue.shift());
    if (!node) continue;
    for (const dep of node.deps) {
      const normal = dep.dep_kinds.some((k) => k.kind === null);
      if (normal && !seen.has(dep.pkg)) {
        seen.add(dep.pkg);
        queue.push(dep.pkg);
      }
    }
  }
  seen.delete(rootId);

  return [...seen].map((id) => {
    const p = byId.get(id);
    return {
      source: 'crates.io',
      name: p.name,
      version: p.version,
      license: p.license || '',
      licenseFile: p.license_file || null,
      dir: path.dirname(p.manifest_path),
    };
  });
}

function normalizeForGrouping(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** @returns {import('vite').Plugin} */
export default function thirdPartyNotices() {
  return {
    name: 'nullspace-third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const appPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const packages = npmPackages(bundle);

      let rustError = null;
      try {
        packages.push(...rustPackages());
      } catch (err) {
        rustError = err instanceof Error ? err.message : String(err);
        const message = `[third-party-notices] cargo metadata failed, Rust crates are missing: ${rustError}`;
        if (process.env.CI) this.error(message);
        this.warn(message);
      }

      const forbidden = [];
      const unknown = [];
      const groups = new Map(); // normalized text -> { texts, packages }
      const withoutText = [];

      for (const p of packages) {
        const texts = licenseTexts(p.dir, p.license, p.licenseFile);
        let verdict = checkLicense(p.license);
        if (texts.some((t) => FORBIDDEN_TEXT.some((re) => re.test(t.content)))) verdict = 'forbidden';
        if (verdict === 'forbidden') forbidden.push(p);
        else if (verdict === 'unknown') unknown.push(p);

        if (texts.length === 0) {
          withoutText.push(p);
          continue;
        }
        const key = texts.map((t) => normalizeForGrouping(t.content)).join('\n');
        if (!groups.has(key)) groups.set(key, { texts, packages: [] });
        groups.get(key).packages.push(p);
      }

      const label = (p) => `${p.name} ${p.version} (${p.source})`;
      if (forbidden.length) {
        this.error(
          `[third-party-notices] license not compatible with GPL-3.0 in the bundle: ${forbidden
            .map((p) => `${label(p)}: ${p.license || 'no license field'}`)
            .join('; ')}`,
        );
      }
      for (const p of unknown) {
        this.warn(`[third-party-notices] check the license of ${label(p)}: "${p.license || 'no license field'}"`);
      }

      const byName = (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version);
      const sections = [...groups.values()]
        .map((g) => ({ ...g, packages: g.packages.sort(byName) }))
        .sort((a, b) => byName(a.packages[0], b.packages[0]));

      const lines = [
        'nullSpace — third-party notices',
        `nullSpace ${appPkg.version} is free software under the GNU General Public License v3 or later`,
        '(see LICENSE). It includes the third-party components listed below, each under its own license.',
        '',
      ];
      if (rustError) {
        lines.push('WARNING: this local build could not list the Rust crates (cargo metadata failed).', '');
      }
      for (const s of sections) {
        lines.push(RULE);
        lines.push(`Components: ${s.packages.map(label).join(', ')}`);
        const licenses = [...new Set(s.packages.map((p) => p.license).filter(Boolean))];
        if (licenses.length) lines.push(`License: ${licenses.join('; ')}`);
        for (const t of s.texts) {
          lines.push(THIN_RULE, `${t.file}:`, '', t.content);
        }
        lines.push('');
      }
      if (withoutText.length) {
        lines.push(RULE, 'Components that ship no license file (license as declared by the package):', THIN_RULE);
        for (const p of withoutText.sort(byName)) {
          const ids = (normalizeExpression(p.license).match(/[^\s()]+/g) || [])
            .filter((t) => !/^(AND|OR|WITH)$/i.test(t) && !FORBIDDEN_IDS.has(t));
          const links = ids.map((id) => `https://spdx.org/licenses/${encodeURIComponent(id)}.html`).join(' ');
          lines.push(`${label(p)} — ${p.license || 'no license declared'}${links ? ` — ${links}` : ''}`);
        }
        lines.push('');
      }
      const extra = readText(path.join(ROOT, 'scripts', 'extra-notices.txt'));
      if (extra) lines.push(extra, '');

      this.emitFile({ type: 'asset', fileName: OUTPUT_NAME, source: lines.join('\n') });
    },
  };
}
