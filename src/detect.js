'use strict';
// Language / package-manager / framework / tooling detection.
const fs = require('fs');
const path = require('path');

const JUNK_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'venv', '.venv', '__pycache__', '.next', '.nuxt', 'target', 'coverage', '.cache', '.turbo', '.idea', '.vscode']);

const LANG_BY_EXT = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
  '.rb': 'Ruby', '.php': 'PHP', '.c': 'C', '.h': 'C', '.cpp': 'C++', '.hpp': 'C++',
  '.cs': 'C#', '.swift': 'Swift', '.sh': 'Shell', '.lua': 'Lua', '.zig': 'Zig',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'CSS', '.vue': 'Vue', '.svelte': 'Svelte',
};

function walk(root, cb, depth = 0) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.git') && e.name !== '.github') continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (JUNK_DIRS.has(e.name)) continue;
      if (depth < 6) walk(p, cb, depth + 1);
    } else cb(p, e.name);
  }
}

function extCensus(root) {
  const counts = {};
  walk(root, (p, name) => {
    const ext = path.extname(name).toLowerCase();
    const lang = LANG_BY_EXT[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, n]) => ({ lang, files: n, pct: total ? Math.round((n / total) * 100) : 0 }));
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readIf(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

// ---- JS/TS frameworks & tooling from package.json ----
const JS_FRAMEWORKS = [
  ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['@remix-run/react', 'Remix'], ['astro', 'Astro'],
  ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['solid-js', 'SolidJS'],
  ['express', 'Express'], ['fastify', 'Fastify'], ['@nestjs/core', 'NestJS'], ['hono', 'Hono'],
  ['electron', 'Electron'], ['react-native', 'React Native'], ['discord.js', 'discord.js'],
  ['prisma', 'Prisma ORM'], ['drizzle-orm', 'Drizzle ORM'], ['tailwindcss', 'Tailwind CSS'],
  ['playwright', 'Playwright'], ['@playwright/test', 'Playwright'], ['puppeteer', 'Puppeteer'],
];
const JS_TOOLS = [
  ['typescript', 'TypeScript'], ['jest', 'Jest'], ['vitest', 'Vitest'], ['mocha', 'Mocha'],
  ['eslint', 'ESLint'], ['biome', 'Biome'], ['prettier', 'Prettier'], ['webpack', 'Webpack'],
  ['vite', 'Vite'], ['esbuild', 'esbuild'], ['tsup', 'tsup'], ['turbo', 'Turborepo'], ['husky', 'husky'],
];

// ---- Python frameworks & tooling ----
const PY_FRAMEWORKS = [
  ['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'], ['starlette', 'Starlette'],
  ['pydantic', 'Pydantic'], ['scrapy', 'Scrapy'], ['celery', 'Celery'], ['streamlit', 'Streamlit'],
  ['numpy', 'NumPy'], ['pandas', 'pandas'], ['torch', 'PyTorch'], ['tensorflow', 'TensorFlow'],
  ['aiogram', 'aiogram'], ['python-telegram-bot', 'python-telegram-bot'], ['discord.py', 'discord.py'],
];
const PY_TOOLS = [
  ['pytest', 'pytest'], ['ruff', 'ruff'], ['black', 'Black'], ['mypy', 'mypy'],
  ['flake8', 'flake8'], ['isort', 'isort'], ['coverage', 'coverage.py'], ['tox', 'tox'],
];

// ---- Go / Rust ----
const GO_LIBS = [['gin-gonic/gin', 'Gin'], ['labstack/echo', 'Echo'], ['spf13/cobra', 'Cobra'], ['go-chi/chi', 'Chi']];
const RUST_LIBS = [['axum', 'axum'], ['actix', 'actix-web'], ['tokio', 'tokio'], ['serde', 'serde']];

function detectPackageManagers(root, pkg) {
  const out = [];
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) out.push('pnpm');
  else if (fs.existsSync(path.join(root, 'yarn.lock'))) out.push('yarn');
  else if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) out.push('bun');
  else if (pkg) out.push('npm');

  if (fs.existsSync(path.join(root, 'poetry.lock'))) out.push('poetry');
  else if (fs.existsSync(path.join(root, 'uv.lock'))) out.push('uv');
  else if (fs.existsSync(path.join(root, 'Pipfile.lock'))) out.push('pipenv');
  else if (fs.existsSync(path.join(root, 'requirements.txt'))) out.push('pip');

  if (fs.existsSync(path.join(root, 'Cargo.lock'))) out.push('cargo');
  if (fs.existsSync(path.join(root, 'go.sum'))) out.push('go modules');
  return [...new Set(out)];
}

function pyDeps(root) {
  const deps = [];
  const req = readIf(path.join(root, 'requirements.txt'));
  if (req) req.split('\n').forEach((l) => { const m = l.trim().split(/[<>=~!\[]/)[0].trim(); if (m && !l.trim().startsWith('#')) deps.push(m.toLowerCase()); });
  const py = readIf(path.join(root, 'pyproject.toml'));
  if (py) {
    const inDeps = py.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (inDeps) (inDeps[1].match(/"([^"]+)"/g) || []).forEach((q) => deps.push(q.replace(/"/g, '').split(/[<>=~!\[]/)[0].trim().toLowerCase()));
  }
  return [...new Set(deps.filter(Boolean))];
}

function goDeps(root) {
  // matches both `require mod v1` and indented block entries
  const go = readIf(path.join(root, 'go.mod')) || '';
  return [...go.matchAll(/^(?:require\s+|\s+)([a-z0-9][a-z0-9./-]*)\s+v\d/gm)].map((m) => m[1]);
}

function detect(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  const pyproject = readIf(path.join(root, 'pyproject.toml'));
  const goMod = readIf(path.join(root, 'go.mod'));
  const cargo = readIf(path.join(root, 'Cargo.toml'));

  const langs = extCensus(root);
  const packageManagers = detectPackageManagers(root, pkg);
  const frameworks = [];
  const tools = [];

  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [dep, label] of JS_FRAMEWORKS) if (deps[dep]) frameworks.push(label);
    for (const [dep, label] of JS_TOOLS) if (deps[dep]) tools.push(label);
  }
  if (pyproject || fs.existsSync(path.join(root, 'requirements.txt'))) {
    const deps = pyDeps(root);
    for (const [dep, label] of PY_FRAMEWORKS) if (deps.includes(dep)) frameworks.push(label);
    for (const [dep, label] of PY_TOOLS) if (deps.includes(dep)) tools.push(label);
    if (pyproject && /\[tool\.ruff\]/.test(pyproject) && !tools.includes('ruff')) tools.push('ruff');
    if (pyproject && /\[tool\.black\]/.test(pyproject) && !tools.includes('Black')) tools.push('Black');
    if (pyproject && /\[tool\.pytest[.\]]/.test(pyproject) && !tools.includes('pytest')) tools.push('pytest');
  }
  if (goMod) {
    const deps = goDeps(root);
    for (const [dep, label] of GO_LIBS) if (deps.some((d) => d.includes(dep))) frameworks.push(label);
  }
  if (cargo) {
    for (const [dep, label] of RUST_LIBS) if (new RegExp(`^${dep}\\s*=`, 'm').test(cargo)) frameworks.push(label);
  }

  const has = (f) => fs.existsSync(path.join(root, f));
  const infra = {
    git: has('.git') || true, // assume; repo may be a subdirectory
    docker: has('Dockerfile') || has('docker-compose.yml') || has('compose.yml'),
    ci: has('.github/workflows') || has('.gitlab-ci.yml') || has('.circleci'),
    makefile: has('Makefile'),
    justfile: has('justfile') || has('Justfile'),
    tsconfig: has('tsconfig.json'),
    prettier: has('.prettierrc') || has('.prettierrc.json') || has('prettier.config.js') || (pkg && (pkg.prettier != null)),
    eslint: has('.eslintrc') || has('.eslintrc.js') || has('.eslintrc.json') || has('eslint.config.js') || has('eslint.config.mjs'),
    editorconfig: has('.editorconfig'),
    envExample: has('.env.example') || has('.env.sample') || has('.env.template'),
    dockerCompose: has('docker-compose.yml') || has('compose.yml'),
  };

  let monorepo = null;
  if (pkg && pkg.workspaces) {
    const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
    const pkgs = [];
    for (const g of globs) {
      const base = g.replace(/[/\\]\*$/, '');
      try {
        for (const e of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
          if (e.isDirectory() && readJson(path.join(root, base, e.name, 'package.json'))) pkgs.push(`${base}/${e.name}`);
        }
      } catch { /* glob dir missing */ }
    }
    monorepo = { kind: 'npm workspaces', packages: pkgs };
  } else if (has('turbo.json')) monorepo = { kind: 'Turborepo', packages: [] };
  else if (has('pnpm-workspace.yaml')) monorepo = { kind: 'pnpm workspace', packages: [] };
  else if (goMod && /^go\s+1/.test(goMod) && has('go.work')) monorepo = { kind: 'Go workspace', packages: [] };

  let name = path.basename(path.resolve(root));
  let description = null;
  if (pkg && pkg.name) { name = pkg.name; description = pkg.description || null; }
  if (pyproject) {
    const m = pyproject.match(/^name\s*=\s*"([^"]+)"/m); if (m) name = m[1];
    const d = pyproject.match(/^description\s*=\s*"([^"]+)"/m); if (d) description = description || d[1];
  }
  if (goMod) {
    const m = goMod.match(/^module\s+(\S+)/m); if (m && name === path.basename(path.resolve(root))) name = m[1].split('/').pop();
  }

  return {
    root: path.resolve(root),
    name,
    description,
    langs,
    languages: langs.slice(0, 4).map((l) => l.lang),
    packageManagers,
    frameworks: [...new Set(frameworks)],
    tools: [...new Set(tools)],
    infra,
    monorepo,
    hasPackageJson: !!pkg,
    hasGoMod: !!goMod,
    hasCargo: !!cargo,
    hasPyproject: !!pyproject,
  };
}

module.exports = { detect, readJson, readIf, JUNK_DIRS, walk };
