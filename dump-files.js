#!/usr/bin/env node
/**
 * dump-files.js (ultra-silent con exclusiones por defecto)
 * - Excluye SIEMPRE: node_modules/, package-lock.json, y .env*
 * - Acepta: --out=FILE o --out FILE, --ext=js,ts o --ext js,ts, etc.
 * - Siempre escribe a un archivo (default: repo_dump.txt o repo_dump.jsonl).
 * - En consola solo imprime file://<ruta-del-archivo> al final.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_IGNORES = new Set([
  '.git','node_modules','dist','build','.next','.turbo','.cache',
  '.idea','.vscode','.DS_Store','coverage','.husky'
]);

function parseArgs(argv) {
  const args = { dir: null, out: null, maxSize: 1024*1024, exts: null, ignore: new Set(), includeHidden: false, jsonl: false };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!args.dir && !t.startsWith('--')) { args.dir = t; continue; }

    const eatVal = (def=null) => {
      const nxt = tokens[i+1];
      if (nxt && !nxt.startsWith('-')) { i++; return nxt; }
      return def;
    };

    if (t.startsWith('--out=')) args.out = t.split('=')[1];
    else if (t === '--out') args.out = eatVal();

    else if (t.startsWith('--max-size=')) args.maxSize = parseSize(t.split('=')[1]);
    else if (t === '--max-size') args.maxSize = parseSize(eatVal('1mb'));

    else if (t.startsWith('--ext=')) args.exts = splitList(t.split('=')[1]);
    else if (t === '--ext') args.exts = splitList(eatVal(''));

    else if (t.startsWith('--ignore=')) splitList(t.split('=')[1]).forEach(x=>x && args.ignore.add(x));
    else if (t === '--ignore') splitList(eatVal('')).forEach(x=>x && args.ignore.add(x));

    else if (t === '--include-hidden') args.includeHidden = true;
    else if (t === '--jsonl') args.jsonl = true;

    else if (t === '--help') usageAndExit();
  }
  if (!args.dir) usageAndExit('Falta el directorio.');
  return args;
}

function splitList(s){ return String(s||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean); }

function usageAndExit(msg) {
  if (msg) console.error('Error:', msg);
  console.log(`Uso:
  node dump-files.js "<directorio>" [--out repo_dump.txt] [--max-size 2mb]
                     [--ext js,ts,tsx,json,md,html,css] [--ignore dist,build]
                     [--include-hidden] [--jsonl]
`);
  process.exit(msg ? 1 : 0);
}

function parseSize(s) {
  const m = /^(\d+)\s*(b|kb|mb|gb)?$/i.exec(String(s).trim());
  if (!m) return 1024 * 1024;
  const n = Number(m[1]);
  const unit = (m[2] || 'b').toLowerCase();
  const mult = unit === 'gb' ? 1024**3 : unit === 'mb' ? 1024**2 : unit === 'kb' ? 1024 : 1;
  return n * mult;
}

function isHidden(name){ return name.startsWith('.'); }
function shouldIgnore(name, userIgnores){ return DEFAULT_IGNORES.has(name) || userIgnores.has(name); }

function isProbablyText(buffer){
  if (!buffer || buffer.length === 0) return true;
  let controlish = 0;
  for (let i=0;i<buffer.length;i++){
    const c = buffer[i];
    if (c === 0) return false;
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) controlish++;
  }
  return (controlish / buffer.length) < 0.3;
}

async function listFiles(root, options, out = []) {
  let entries;
  try { entries = await fs.promises.readdir(root, { withFileTypes: true }); }
  catch { return out; }

  for (const e of entries) {
    const name = e.name;
    const lname = name.toLowerCase();

    // EXCLUSIONES SIEMPRE ACTIVAS:
    // 1) Bloquear node_modules a nivel de directorio
    if (e.isDirectory() && lname === 'node_modules') continue;

    // 2) Ignora ocultos si no se pidió incluirlos
    if (!options.includeHidden && isHidden(name)) continue;

    // 3) Ignorados por default/usuario
    if (shouldIgnore(name, options.ignore)) continue;

    const full = path.join(root, name);
    if (full === options._outAbs) continue; // no incluir el archivo de salida

    if (e.isSymbolicLink()) continue;

    if (e.isDirectory()) {
      await listFiles(full, options, out);
    } else if (e.isFile()) {
      // 4) Excluir package-lock.json y .env*
      if (lname === 'package-lock.json') continue;
      if (name === '.env' || name.startsWith('.env')) continue;

      // Filtro por extensión (si se especifica)
      if (options.exts && options.exts.length) {
        const ext = path.extname(name).toLowerCase().replace(/^\./,'');
        if (!options.exts.includes(ext)) continue;
      }

      // Tamaño máximo
      let stat;
      try { stat = await fs.promises.stat(full); } catch { continue; }
      if (stat.size > options.maxSize) continue;

      // Heurística binario
      const sampleLen = Math.min(4096, Math.max(1, stat.size));
      try {
        const fd = await fs.promises.open(full, 'r');
        const { buffer } = await fd.read({ length: sampleLen, buffer: Buffer.alloc(sampleLen), position: 0 });
        await fd.close();
        if (!isProbablyText(buffer)) continue;
      } catch { continue; }

      out.push(full);
    }
  }
  return out;
}

async function run(){
  const args = parseArgs(process.argv);
  const root = path.resolve(args.dir);

  // Archivo de salida por defecto si no se especifica
  if (!args.out) args.out = args.jsonl ? 'repo_dump.jsonl' : 'repo_dump.txt';
  const outAbs = path.resolve(args.out);
  args._outAbs = outAbs;

  await fs.promises.mkdir(path.dirname(outAbs), { recursive: true });

  const files = await listFiles(root, args);

  const writer = fs.createWriteStream(outAbs, { encoding: 'utf8' });
  const write = (s) => new Promise((res, rej) => {
    if (writer.write(s)) res();
    else writer.once('drain', res).once('error', rej);
  });

  for (const f of files) {
    const rel = path.relative(root, f) || path.basename(f);
    try {
      const content = await fs.promises.readFile(f, 'utf8');
      if (args.jsonl) {
        await write(JSON.stringify({ path: rel, content }) + '\n');
      } else {
        await write(`==== ${rel} ====\n${content}\n==== /${rel} ====\n\n`);
      }
    } catch {
      if (args.jsonl) {
        try {
          const raw = await fs.promises.readFile(f);
          await write(JSON.stringify({ path: rel, content_base64: raw.toString('base64') }) + '\n');
        } catch {}
      }
    }
  }

  await new Promise((r) => writer.end(r));
  console.log(pathToFileURL(outAbs).href); // <- ÚNICA salida en consola
}

run().catch((e)=>{ console.error('Error:', e?.message || e); process.exit(1); });
