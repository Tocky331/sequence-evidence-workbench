import http from 'node:http';
import os from 'node:os';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, open, unlink, readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync, spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import {
  parseFasta,
  parseSmallRna,
  parseSmallRnaFile,
  parseTrnascan,
  parseDifferential,
  compareDifferential,
  compareMultiCells,
  parseTargetMap,
  predictBuiltinTargets,
  prioritizeCandidates,
  compareMultiStrainTrna,
  theoreticalFragmentSpace,
  assemblyStats,
  screenExpressedFragments,
  exactMatches,
  parseBlastTabular,
  csv
} from './lib.mjs';
import { figureSvg, secondaryFigureSvg } from './figure.mjs';
import { buildDocxBuffer } from './docx.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA = process.env.WORKBENCH_DATA_DIR ? resolve(process.env.WORKBENCH_DATA_DIR) : join(ROOT, 'data');
const FILES = join(DATA, 'files');
const QC = join(DATA, 'fastqc');
const BLAST_RUNS = join(DATA, 'blast-runs');
const CACHE_DIR = join(DATA, 'cache');
await mkdir(FILES, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });

const CPU_THREADS = String(Math.max(1, Math.min(8, os.availableParallelism ? os.availableParallelism() : 4)));

// In-memory LRU caches for parsed FASTA and DE tables to accelerate repeated runs
const fastaMemCache = new Map();
const deMemCache = new Map();
const smallRnaMemCache = new Map();

const db = new DatabaseSync(join(DATA, 'workbench.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, sha256 TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, summary TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT NOT NULL);`);

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function json(res, status, body) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function fail(res, error, status = 400) {
  json(res, status, { error: error.message || String(error) });
}

const STEP_PREFIX_MAP = {
  trna: '步骤1_tRNA扫描',
  strains: '步骤1_多菌株保守性对比',
  tsrna: '步骤2_OMV_tsRNA筛选',
  cells: '步骤3A_宿主细胞转录组比较',
  priority: '步骤3B_候选tsRNA整合',
  match: '序列比对检索'
};
const STEP_PREFIX_MAP_EN = {
  trna: 'stage1_trna_scan',
  strains: 'stage1_strain_conservation',
  tsrna: 'stage2_omv_tsrna_screening',
  cells: 'stage3a_host_transcriptome',
  priority: 'stage3b_candidate_tsrna',
  match: 'sequence_alignment'
};

export function formatLocalTimeParts(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = valid.getFullYear();
  const mm = pad(valid.getMonth() + 1);
  const dd = pad(valid.getDate());
  const hh = pad(valid.getHours());
  const mi = pad(valid.getMinutes());
  const ss = pad(valid.getSeconds());
  return {
    display: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    dateOnly: `${yyyy}-${mm}-${dd}`,
    fileTag: `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
  };
}

function sanitizeFileSegment(raw) {
  return String(raw || '未命名')
    .replace(/\s*·\s*(tRNA 基因|多菌株 tRNA 保守性对比|候选证据整合|OMV 序列清单|BLAST\+|精确匹配)/g, '')
    .replace(/\.(fa|fasta|fna|fastq|fq|csv|tsv|out|txt|gz)+$/gi, '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s*([·↔/|,，、])\s*/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || '分析结果';
}

function buildDownloadNames(kind, name, createdAt, lang = 'zh') {
  const english = lang === 'en';
  const stepLabel = (english ? STEP_PREFIX_MAP_EN[kind] : STEP_PREFIX_MAP[kind]) || kind;
  let cleanName = sanitizeFileSegment(name);
  if (english) {
    cleanName = cleanName.replace(/[\u3400-\u9fff]+/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'analysis';
  }
  const { fileTag } = formatLocalTimeParts(createdAt);
  const base = `${stepLabel}-${cleanName}-${fileTag}`;
  return {
    base,
    csv: `${base}.csv`,
    svg: `${base}.svg`,
    svg2: `${base}-${english ? 'secondary-figure' : '专题图'}.svg`,
    report: `${base}.docx`
  };
}

function contentDispositionHeader(filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const CSV_HEADERS_EN = {
  contig: 'Contig', number: 'Locus #', start: 'Start (1-based)', end: 'End', strand: 'Strand', type: 'tRNA type', anticodon: 'Anticodon', score: 'Cove score',
  conservation: 'Cross-strain conservation', copySummary: 'Copies by strain', fivePrime13: '5-prime tRF-5X (13 nt)', fivePrime24: '5-prime tRF-5b (24 nt)', hairpinFreeEnergy: 'Hairpin free energy', knownHomolog: 'Known OMV tsRNA homolog',
  sequence: 'Sequence', length: 'Length (nt)', subtype: 'Subtype', readCount: 'OMV reads', rpm: 'RPM', log2Enrichment: 'OMV enrichment log2', freeEnergy: 'Hairpin free energy', lociCount: 'Matched loci', trnaStart: 'tRNA locus start',
  gene: 'Host gene ID', direction: 'Regulatory direction and category', category: 'Significant category',
  hepg2Down: 'Cell line A down targets', hepg2Up: 'Cell line A up targets', caco2Down: 'Cell line B down targets', caco2Up: 'Cell line B up targets',
  stableHairpin: 'Stable hairpin', trnaTypes: 'Source tRNA types', subtypes: 'Subtypes', predictionMethods: 'Prediction methods',
  cell_0_log2FC: 'Cell line 1 log2FC', cell_0_fdr: 'Cell line 1 FDR', cell_1_log2FC: 'Cell line 2 log2FC', cell_1_fdr: 'Cell line 2 FDR',
  hepg2Log2FC: 'Cell line A log2FC', hepg2Fdr: 'Cell line A FDR', caco2Log2FC: 'Cell line B log2FC', caco2Fdr: 'Cell line B FDR',
  predictedTargets: 'Predicted targets', bothDown: 'Concordant down targets', bothUp: 'Concordant up targets', targetGenes: 'Key target genes and direction', evidenceScore: 'Evidence score',
  query: 'Query sequence', target: 'Reference sequence', alignmentLength: 'Alignment length (nt)', queryCoverage: 'Query coverage (%)', identity: 'Identity (%)', targetStart: 'Reference start', targetEnd: 'Reference end', method: 'Method', bitscore: 'Bit score', evalue: 'E-value'
};
const CSV_VALUE_EN = [
  ['两细胞系同向', 'Concordant across both cell lines'], ['显著上调', 'Significantly upregulated'], ['显著下调', 'Significantly downregulated'], ['共同下调', 'Concordantly downregulated'], ['共同上调', 'Concordantly upregulated'], ['同向下调', 'Concordant downregulation'], ['同向上调', 'Concordant upregulation'], ['仅', 'Only '], ['达阈值', ' meets threshold'], ['全部', 'All '], ['细胞系同向', ' cell lines concordant'], ['多细胞系反向', 'Discordant across cell lines'], ['菌株特异', 'Strain-specific'], ['核心保守', 'Core conserved'], ['部分共有', 'Partially shared'], ['其他', 'Other'], ['待关联', 'Not linked'], ['已确认', 'Confirmed'], ['未核实', 'Unverified'], ['预测靶基因', 'Predicted target genes'], ['仅 OMV 序列证据', 'OMV sequence evidence only'], ['有靶基因预测', 'Has target prediction']
];
function localizeCsv(kind, rows, lang) {
  if (lang !== 'en') return { rows, keys: rows.length ? Object.keys(rows[0]) : ['status'], headers: rows.length ? Object.keys(rows[0]) : ['status'] };
  const keys = rows.length ? Object.keys(rows[0]) : ['status'];
  const localizedRows = rows.map(row => Object.fromEntries(keys.map(key => {
    let value = row[key];
    if (typeof value === 'string') for (const [from, to] of CSV_VALUE_EN) value = value.split(from).join(to);
    return [key, value];
  })));
  return { rows: localizedRows, keys, headers: keys.map(key => CSV_HEADERS_EN[key] || key.replaceAll('_', ' ')) };
}

// Supports real-time NDJSON streaming progress when client sends X-Stream-Progress: 1
function createProgressContext(req, res) {
  const streaming = req.headers['x-stream-progress'] === '1';
  let started = false;
  const ensureStarted = () => {
    if (streaming && !started) {
      started = true;
      res.writeHead(200, {
        ...headers,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      });
    }
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return {
    streaming,
    async progress(percent, stage, message, findings = null) {
      if (!streaming) return;
      ensureStarted();
      res.write(JSON.stringify({
        type: 'progress',
        percent,
        stage,
        message,
        findings,
        time: formatLocalTimeParts().display.slice(11)
      }) + '\n');
      await tick();
    },
    finish(status, payload) {
      if (!streaming) {
        return json(res, status, payload);
      }
      ensureStarted();
      res.write(JSON.stringify({ type: 'result', status, data: payload }) + '\n');
      res.end();
    },
    error(err, status = 400) {
      if (!streaming) {
        return fail(res, err, status);
      }
      ensureStarted();
      res.write(JSON.stringify({ type: 'error', status, error: err.message || String(err) }) + '\n');
      res.end();
    }
  };
}

function fetchUpload(id, kind) {
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id);
  if (!row || (kind && row.kind !== kind)) throw new Error('找不到指定文件');
  return row;
}

async function parsedFasta(row) {
  const cacheKey = `${row.id}:${row.sha256}`;
  if (fastaMemCache.has(cacheKey)) return fastaMemCache.get(cacheKey);
  const parsed = parseFasta(await readFile(row.path, 'utf8'));
  if (fastaMemCache.size < 30) fastaMemCache.set(cacheKey, parsed);
  return parsed;
}

async function parsedSmallRnaCached(filePath, fileName) {
  const st = await stat(filePath);
  const key = `${filePath}:${st.size}:${st.mtimeMs}`;
  if (smallRnaMemCache.has(key)) return smallRnaMemCache.get(key);
  const parsed = await parseSmallRnaFile(filePath, fileName);
  if (smallRnaMemCache.size < 30) smallRnaMemCache.set(key, parsed);
  return parsed;
}

async function parsedDe(row) {
  const cacheKey = `${row.id}:${row.sha256}`;
  if (deMemCache.has(cacheKey)) return deMemCache.get(cacheKey);
  const parsed = parseDifferential(await readFile(row.path, 'utf8'));
  if (deMemCache.size < 60) deMemCache.set(cacheKey, parsed);
  return parsed;
}

async function readBody(req, limit = 80 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('文件超过 80 MB；大 FASTQ 请使用分批或预处理后的计数表');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function receiveFile(req, path, limit = 2 * 1024 * 1024 * 1024) {
  const handle = await open(path, 'wx');
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new Error('文件超过 2 GB；请先分批或预处理');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        if (!bytesWritten) throw new Error('写入文件失败');
        offset += bytesWritten;
      }
    }
    await handle.close();
    return { size, hash: hash.digest('hex') };
  } catch (error) {
    await handle.close();
    await unlink(path).catch(() => {});
    throw error;
  }
}

function saveAnalysis(kind, name, result) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO analyses VALUES (?,?,?,?,?)').run(id, kind, name, createdAt, JSON.stringify(result));
  return { id, createdAt, downloadNames: buildDownloadNames(kind, name, createdAt) };
}

const ENV_ROOT = join(ROOT, '.tools', 'env');
const toolEnv = {
  ...process.env,
  JAVA_HOME: join(ENV_ROOT, 'lib', 'jvm'),
  PATH: `${join(ENV_ROOT, 'lib', 'jvm', 'bin')}:${join(ENV_ROOT, 'bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
};

const toolPathCache = new Map();
function toolStatus(name) {
  if (toolPathCache.has(name)) return toolPathCache.get(name);
  const r = spawnSync('which', [name], { encoding: 'utf8', env: toolEnv });
  const found = r.status === 0 ? r.stdout.trim() : null;
  toolPathCache.set(name, found);
  return found;
}

const execFileAsync = promisify(execFile);
async function runTool(name, args, timeout = 600000) {
  const executable = toolStatus(name);
  if (!executable) throw new Error(`${name} 未安装在项目工具环境中`);
  try {
    return await execFileAsync(executable, args, { env: toolEnv, timeout, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`${name} 运行失败：${(error.stderr || error.message).slice(0, 900)}`);
  }
}

async function runTrnascanCached(executable, genomePath, genomeHash, ctx = null) {
  const cacheFile = join(CACHE_DIR, `trnascan-${genomeHash}.out`);
  if (existsSync(cacheFile)) {
    if (ctx) await ctx.progress(55, 'tRNAscan-SE 高速缓存命中', '检测到同一基因组 SHA-256 签名，已从本地高速缓存加载 tRNAscan-SE 细菌模式结果…');
    return await readFile(cacheFile, 'utf8');
  }
  if (ctx) await ctx.progress(40, 'tRNAscan-SE 多核扫描', `正在调用 tRNAscan-SE (-B 细菌模式, ${CPU_THREADS} 线程并行) 扫描全基因组 tRNA 基因位点…`);
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, ['-B', '--thread', CPU_THREADS, genomePath], { env: toolEnv });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', err => rejectPromise(new Error(`tRNAscan-SE 运行失败：${err.message}`)));
    child.on('close', async code => {
      if (code !== 0) {
        // Fallback without --thread if older tRNAscan-SE build doesn't accept --thread
        const fallback = spawnSync(executable, ['-B', genomePath], { encoding: 'utf8', env: toolEnv, timeout: 180000, maxBuffer: 20 * 1024 * 1024 });
        if (fallback.status === 0 && fallback.stdout) {
          await writeFile(cacheFile, fallback.stdout, 'utf8').catch(() => {});
          return resolvePromise(fallback.stdout);
        }
        return rejectPromise(new Error(`tRNAscan-SE 运行失败：${stderr || fallback.stderr || `退出码 ${code}`}`));
      }
      await writeFile(cacheFile, stdout, 'utf8').catch(() => {});
      resolvePromise(stdout);
    });
  });
}

async function hashFile(path) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { hash: hash.digest('hex'), size };
}

async function querySequences(id) {
  const upload = db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
  if (upload) {
    if (!['assembly', 'reference'].includes(upload.kind)) throw new Error('查询文件必须是 FASTA');
    return { records: await parsedFasta(upload), name: upload.name, uploadId: upload.id, analysisId: null };
  }
  const analysis = db.prepare('SELECT * FROM analyses WHERE id=? AND kind=?').get(id, 'tsrna');
  if (!analysis) throw new Error('请选择查询 FASTA 或 tsRNA 筛选结果');
  const matches = JSON.parse(analysis.result).matches;
  const sequences = [...new Set(matches.map(row => row.sequence))];
  if (!sequences.length) throw new Error('所选 tsRNA 分析没有匹配序列');
  return { records: sequences.map(sequence => ({ id: sequence, sequence })), name: analysis.name, uploadId: null, analysisId: analysis.id };
}

async function blastMatches(queries, target, { minLength }, ctx = null) {
  if (queries.length > 5000 || queries.reduce((sum, row) => sum + row.sequence.length, 0) > 300000) {
    throw new Error('BLAST+ 查询上限为 5,000 条且总长 300,000 nt；请拆分查询');
  }
  const lengths = queries.map(row => row.sequence.length);
  if (lengths.some(length => length < 10)) throw new Error('BLAST+ 查询序列不能短于 10 nt');
  if (lengths.some(length => length <= 50) && lengths.some(length => length > 50)) {
    throw new Error('请将不超过 50 nt 的短序列与长序列分开检索');
  }
  const task = lengths.every(length => length <= 50) ? 'blastn-short' : 'blastn';
  await mkdir(BLAST_RUNS, { recursive: true });
  const dir = await mkdtemp(join(BLAST_RUNS, 'run-'));
  try {
    const queryPath = join(dir, 'query.fa'), database = join(dir, 'reference'), output = join(dir, 'hits.tsv');
    await writeFile(queryPath, queries.map((row, i) => `>query_${i + 1}\n${row.sequence}\n`).join(''));
    if (ctx) await ctx.progress(35, '建立 BLAST+ 索引库', `正在使用 makeblastdb 为参考序列 ${target.name} 构建核酸索引库…`);
    await runTool('makeblastdb', ['-in', target.path, '-dbtype', 'nucl', '-out', database], 120000);
    if (ctx) await ctx.progress(65, `运行 ${task} 多核比对`, `正在对 ${queries.length} 条查询序列执行 ${task} (${CPU_THREADS} 线程并行)…`);
    await runTool('blastn', ['-task', task, '-num_threads', CPU_THREADS, '-dust', 'no', '-evalue', '10000', '-query', queryPath, '-db', database, '-outfmt', '6 qseqid sseqid pident length qlen qstart qend sstart send evalue bitscore', '-out', output], 600000);
    if ((await stat(output)).size > 20 * 1024 * 1024) throw new Error('BLAST+ 命中超过 20 MB；请缩小查询或参考库后重试');
    const parsed = parseBlastTabular(await readFile(output, 'utf8'), { minLength });
    const matches = parsed.map(row => ({ ...row, query: queries[Number(row.query.slice(6)) - 1]?.id || row.query, method: `BLAST+ ${task}` }));
    return { matches, task, parameters: { dust: 'no', evalue: 10000, minAlignmentLength: minLength } };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const REPORT_TRANSLATIONS_EN = [
  ['序证工作台', 'Sequence Evidence Workbench'], ['分析报告', 'Analysis Report'], ['分析阶段与模块', 'Analysis stage and module'], ['分析任务名称', 'Analysis task name'], ['结果生成时间', 'Generated at'], ['结果记录总数', 'Total result records'], ['核心参数与摘要', 'Core parameters and summary'], ['一、计算生物信息学方法说明', '1. Computational bioinformatics methods'], ['二、核心分析结果预览', '2. Core result preview'], ['全量记录见配套 CSV', 'full records are available in the companion CSV'], ['三、原始输入文件与 SHA-256 完整性校验', '3. Source files and SHA-256 integrity checks'], ['以下为本次分析所引用的全部上游输入文件及其 SHA-256 加密哈希值，用于保障数据溯源与发表复现性：', 'The following upstream files and SHA-256 hashes were used for traceability and publication reproducibility:'], ['输入文件名称', 'Input file'], ['SHA-256 校验值', 'SHA-256 hash'], ['未登记外部文件', 'No external file registered'], ['四、配套 SVG 发表级矢量图说明与科学解释边界', '4. SVG figure notes and scientific interpretation limits'], ['SVG 矢量图说明', 'SVG figure note'], ['科学严谨性边界', 'Scientific interpretation limit'], ['同行评议参考文献', 'Peer-reviewed references'], ['生成时间：', 'Generated: '], ['菌株：', 'Strain:'], ['对比宿主细胞系：', 'Host cell lines compared: '], ['显著性阈值：', 'Significance thresholds: '], ['共有检测基因数：', 'Shared genes detected: '], ['样本总 reads：', 'Total sample reads: '], ['唯一序列数：', 'Unique sequences: '], ['筛查长度范围：', 'Screening length range: '], ['3′-CCA 成熟尾匹配：', '3′-CCA mature-tail matching: '], ['预处理状态：', 'Preprocessing status: '], ['参考库：', 'Reference database: '], ['查询集：', 'Query set: '], ['比对任务：', 'Alignment task: '], ['dust 过滤：', 'Dust filter: '], ['E-value 上限：', 'E-value limit: '], ['最短比对长度：', 'Minimum alignment length: '], ['最短匹配长度：', 'Minimum match length: '], ['结果截断：', 'Results truncated: '], ['预测来源：', 'Prediction source: '], ['检出 tRNA 位点数：', 'Detected tRNA loci: '], ['理论候选片段长度范围：', 'Theoretical candidate fragment range: '], ['对比菌株：', 'Strains compared: '], ['所属菌株：', 'Strain: '], ['跨界靶点来源：', 'Cross-kingdom target source: '], ['调控筛选模式：', 'Regulatory mode: '], ['宿主转录组关联状态：', 'Host transcriptome linkage: '], ['已建立完整跨界关联', 'Complete cross-kingdom linkage established'], ['仅按 OMV 丰度与结构排序', 'Ranked by OMV abundance and structure only'], ['条记录', 'records'], ['已确认去接头与质控', 'Adapter trimming and QC confirmed'], ['未核实', 'Unverified'], ['是', 'Yes'], ['否', 'No'], ['开启', 'Enabled'], ['关闭', 'Disabled'], ['细菌细胞系', 'cell lines'], ['细胞系', 'cell line'], ['共同下调', 'Concordantly downregulated'], ['共同上调', 'Concordantly upregulated'], ['同向下调', 'Concordant downregulation'], ['同向上调', 'Concordant upregulation'], ['预测靶点', 'Predicted targets'], ['待关联', 'Not linked'], ['候选 tsRNA', 'candidate tsRNA'], ['综合证据分', 'Evidence score'], ['排名', 'Rank'], ['候选 tsRNA 序列', 'Candidate tsRNA sequence'], ['宿主基因 ID', 'Host gene ID'], ['查询序列', 'Query sequence'], ['参考序列', 'Reference sequence'], ['起点', 'Start'], ['终点', 'End'], ['链', 'Strand'], ['一致性 %', 'Identity %'], ['比对方式', 'Method']
].sort((a, b) => b[0].length - a[0].length);
function localizeReportSpec(value) {
  if (typeof value === 'string') {
    let text = value;
    for (const [from, to] of REPORT_TRANSLATIONS_EN) text = text.split(from).join(to);
    text = text
      .replaceAll('项目属性', 'Project attribute')
      .replaceAll('详细内容', 'Details')
      .replaceAll('导入的 tRNAscan-SE 结果', 'Imported tRNAscan-SE output')
      .replaceAll(' tRNA 基因', ' tRNA gene')
      .replaceAll('导入的靶基因预测表', 'Imported target prediction table')
      .replaceAll('内置跨界种子区/反义互补预测引擎', 'Built-in cross-kingdom seed/antisense complement predictor')
      .replaceAll('候选证据整合', 'candidate evidence integration')
      .replaceAll('OMV 序列清单', 'OMV sequence list')
      .replaceAll('半分子', 'half-molecule')
      .replaceAll('端候选', 'end candidate')
      .replaceAll('精细亚型', 'subtype')
      .replaceAll('非冗余理论序列', 'non-redundant theoretical sequences')
      .replace(/（共\s*(\d+)\s*条记录）/g, '($1 records)')
      .replace(/（共\s*(\d+)\s*条非冗余理论序列）/g, '($1 non-redundant theoretical sequences)')
      .replaceAll('；', '; ')
      .replaceAll('：', ': ')
      .replaceAll('（', '(')
      .replaceAll('）', ')')
      .replaceAll('、', ', ')
      .replaceAll('。', '.');
    return text;
  }
  if (Array.isArray(value)) return value.map(localizeReportSpec);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeReportSpec(item)]));
  return value;
}

function buildReportDocx(row, result, rows, sources, lang = 'zh') {
  const timeInfo = formatLocalTimeParts(row.created_at);
  const stepName = STEP_PREFIX_MAP[row.kind] || row.kind;
  const methods = {
    trna: '调用 tRNAscan-SE 2.0 细菌模式 (-B) 或解析外部导入的 tRNAscan-SE 输出；基因组坐标采用 1-based 闭区间，并构建 10–50 nt 理论 tsRNA 候选空间。',
    strains: '跨多株细菌基因组组装横向比对预测的 tRNA 基因全长序列及 5′/3′ 理论 tsRNA 候选序列，自动识别全部菌株 100% 共有的核心保守位点与菌株特异位点。',
    tsrna: '采用高速 k-mer 哈希索引将观测到的 OMV small RNA 序列精确匹配到同菌株预测的基因组 tRNA 区段及成熟 3′-CCA 末端；精细划分为 5′-tRF (tRF-5X/5a/5b/5c)、5′-tiRNA、3′-tRF、3′-tiRNA 与 i-tRF，并计算二级结构茎环自由能（ΔG）、RPM 与全菌富集比。',
    match: result.mode === 'blast' ? '对本地参考 FASTA 建立 BLAST+ 核酸索引库，再执行 blastn / blastn-short 多核局部相似性检索；坐标采用 1-based。' : '对参考 FASTA 正负双链进行 100% 全长精确匹配；不允许错配或缺口。',
    cells: '按同源基因 ID 对齐同一菌株处理的宿主细胞系差异表达表，并分别应用 FDR 与 |log2FC| 阈值筛选跨细胞系同向或特异调控基因。',
    priority: '以已核实预处理的 OMV tRNA 衍生序列为候选；联合 RNA 二级结构稳定性、OMV 表达丰度（RPM 及富集度）、跨界靶基因预测（外部预测表或内置 8mer/7mer 种子区与反义互补扫描）及宿主细胞转录组差异响应方向进行综合证据链评分排序。'
  };
  const limits = {
    trna: '基因组 tRNA 定位属于计算预测，不等同于外膜囊泡（OMV）中的实际转录或选择性包装表达证据。',
    strains: '多菌株基因组层面的序列保守性仅反映基因座同源性，实际 OMV 包装丰度仍需各菌株 OMV small RNA 测序验证。',
    tsrna: '网站支持运行 FastQC 和 Cutadapt，但须提供真实建库接头并人工审阅质控报告；多位点同源命中不强行拆分 reads；序列匹配结果需结合独立实验证明囊泡内定位与生物学功能。',
    match: result.mode === 'blast' ? 'BLAST+ 的局部命中、短序列 E-value 和有限查询覆盖度均不能单独证明物种来源、成熟 tsRNA 身份或靶基因因果调控。' : '全长精确匹配不等同于局部同源检索或功能注释；无命中亦不排除存在含错配的同源序列。',
    cells: '本模块对导入的差异表达统计表进行跨细胞系对齐与描述性归类，未对原始计数矩阵重新运行 DESeq2 或双因素交互效应检验。',
    priority: '综合证据评分用于排列分子生物学实验验证优先级。即使靶基因预测与宿主转录组变化方向完全一致，仍须通过双荧光素酶报告基因、Mimic/Inhibitor 转染、Ago2-RIP 或细菌基因敲除突变株实验建立因果机制。'
  };
  const figureMeaning = {
    trna: '主图柱形展示各氨基酸反密码子类型的预测基因组 tRNA 位点数（n 为预测位点数）。',
    strains: '主图柱形展示不同跨菌株保守性等级（核心保守、部分共有、菌株特异）的 tRNA 序列数量。',
    tsrna: '主图柱形展示各长度（nt）匹配的 OMV reads 分布（同一唯一序列按 reads 数计一次）。',
    cells: '主图柱形展示各调控分类的显著差异基因数；专题图展示跨细胞系 log2FoldChange 四象限分布。',
    priority: '主图柱形展示各互斥证据层级中的候选 tsRNA 序列数；专题图展示 Top 候选序列的跨界调控证据链拓扑关系。',
    match: result.mode === 'blast' ? '主图柱形展示各参考序列的 BLAST+ 局部比对命中记录数。' : '主图柱形展示各参考序列的双链全长精确匹配记录数。'
  };
  const literature = {
    trna: 'Chan PP et al. tRNAscan-SE 2.0: improved detection and functional classification of transfer RNA genes. Nucleic Acids Research (2021), DOI: 10.1093/nar/gkab688.',
    strains: 'Chan PP et al. tRNAscan-SE 2.0, Nucleic Acids Research (2021), DOI: 10.1093/nar/gkab688; Wyres KL et al. Population genomics of Klebsiella pneumoniae. Nature Reviews Microbiology (2020).',
    tsrna: 'Koeppen K et al. A Novel Mechanism of Host-Pathogen Interaction through sRNA in Bacterial Outer Membrane Vesicles. PLoS Pathogens (2016), DOI: 10.1371/journal.ppat.1005672; Diallo I et al. A tRNA-derived fragment present in E. coli OMVs regulates host cell gene expression. PLoS Pathogens (2022), DOI: 10.1371/journal.ppat.1010827; Welsh JA et al. MISEV2023. J Extracell Vesicles (2024), DOI: 10.1002/jev2.12404.',
    cells: 'Love MI et al. Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. Genome Biology (2014), DOI: 10.1186/s13059-014-0550-8.',
    priority: 'Koeppen K et al. PLoS Pathogens (2016), DOI: 10.1371/journal.ppat.1005672; Diallo I et al. PLoS Pathogens (2022), DOI: 10.1371/journal.ppat.1005672 / 10.1371/journal.ppat.1010827; Welsh JA et al. MISEV2023, DOI: 10.1002/jev2.12404.',
    match: 'Camacho C et al. BLAST+: architecture and applications. BMC Bioinformatics (2009), DOI: 10.1186/1471-2105-10-421.'
  };

  const cellLabelDesc = Array.isArray(result.cellLabels) && result.cellLabels.length
    ? result.cellLabels.join(' vs ')
    : `${result.cellLineA || '细胞系 1'} vs ${result.cellLineB || '细胞系 2'}`;

  const details = row.kind === 'cells'
    ? `菌株：${result.strain}；对比宿主细胞系：${cellLabelDesc}；显著性阈值：FDR ≤ ${result.fdr}，|log2FC| ≥ ${result.minAbsLog2FC}；共有检测基因数：${result.sharedGeneCount}。`
    : row.kind === 'tsrna'
      ? `样本总 reads：${result.totalReads}；唯一序列数：${result.uniqueSequences}；筛查长度范围：${result.minLength ?? 10}–${result.maxLength ?? 50} nt；3′-CCA 成熟尾匹配：${result.allowCca !== false ? '开启' : '关闭'}；预处理状态：${result.processingStatus === 'processed' ? '已确认去接头与质控' : '未核实'}。`
      : row.kind === 'match'
        ? result.mode === 'blast'
          ? `参考库：${result.referenceName}；查询集：${result.queryName}；比对任务：${result.task}；dust 过滤：${result.parameters.dust}；E-value 上限：${result.parameters.evalue}；最短比对长度：${result.parameters.minAlignmentLength} nt。`
          : `参考库：${result.referenceName}；查询集：${result.queryName}；最短匹配长度：${result.minLength} nt；结果截断：${result.truncated ? '是' : '否'}。`
        : row.kind === 'trna'
          ? `预测来源：${result.source}；检出 tRNA 位点数：${rows.length}；理论候选片段长度范围：${result.candidateSpace?.minLength ?? 15}–${result.candidateSpace?.maxLength ?? 50} nt（共 ${result.candidateSpace?.distinctSequences ?? 0} 条非冗余理论序列）。`
          : row.kind === 'strains'
            ? `对比菌株：${(result.strainNames || []).join(' / ')}；全部菌株 100% 保守 tRNA 序列：${result.coreConservedTrnaSeqs} 条；菌株特异序列：${result.strainSpecificTrnaSeqs} 条；保守 24 nt 5′-tRF 候选：${result.conserved24nt5Prime} 条。`
            : row.kind === 'priority'
              ? `所属菌株：${result.strain}；跨界靶点来源：${result.targetSource || '预测表'}；调控筛选模式：${result.regulationMode || 'both'}；宿主转录组关联状态：${result.linkedToTranscriptome ? '已建立完整跨界关联' : '仅按 OMV 丰度与结构排序'}。`
              : '';

  // Build preview table of top 15 records for the Word document
  let previewTable = null;
  if (rows.length > 0) {
    if (row.kind === 'trna') {
      previewTable = {
        headers: ['Contig', '位点 #', '起点', '终点', '链', '氨基酸类型', '反密码子', 'Cove 分数'],
        rows: rows.slice(0, 15).map(r => [r.contig, r.number, r.start, r.end, r.strand, r.type, r.anticodon, r.score])
      };
    } else if (row.kind === 'strains') {
      previewTable = {
        headers: ['tRNA 类型', '反密码子', '跨菌株保守性', '各菌株拷贝数', '5′-tRF-5X (13 nt)', '5′-tRF-5b (24 nt)', '已知同源注释'],
        rows: rows.slice(0, 15).map(r => [r.type, r.anticodon, r.conservation, r.copySummary, r.fivePrime13, r.fivePrime24, r.knownHomolog])
      };
    } else if (row.kind === 'tsrna') {
      previewTable = {
        headers: ['tsRNA 序列', '长度', '精细亚型', '来源 tRNA', 'OMV reads', 'RPM', 'OMV/全菌 log2', '茎环 ΔG'],
        rows: rows.slice(0, 15).map(r => [r.sequence, r.length, r.subtype, `${r.type}(${r.anticodon})`, r.readCount, r.rpm, r.log2Enrichment ?? '—', r.freeEnergy])
      };
    } else if (row.kind === 'cells') {
      previewTable = {
        headers: ['宿主基因 ID', `${result.cellLineA || '细胞1'} log2FC`, `${result.cellLineA || '细胞1'} FDR`, `${result.cellLineB || '细胞2'} log2FC`, `${result.cellLineB || '细胞2'} FDR`, '调控方向与类别'],
        rows: rows.slice(0, 15).map(r => [r.gene, r.hepg2Log2FC, r.hepg2Fdr, r.caco2Log2FC, r.caco2Fdr, r.direction])
      };
    } else if (row.kind === 'priority') {
      previewTable = {
        headers: ['排名', '候选 tsRNA 序列', '亚型', '来源 tRNA', 'OMV RPM', '茎环 ΔG', '关键响应靶基因', '综合证据分'],
        rows: rows.slice(0, 15).map((r, i) => [`#${i + 1}`, r.sequence, r.subtype, r.trnaTypes, r.rpm, r.freeEnergy, r.targetGenes || '—', r.evidenceScore])
      };
    } else {
      previewTable = {
        headers: ['查询序列', '参考序列', '起点', '终点', '链', '一致性 %', '比对方式'],
        rows: rows.slice(0, 15).map(r => [r.query, r.target, r.targetStart ?? r.start, r.targetEnd ?? r.end, r.strand, r.identity, r.method])
      };
    }
  }

  const reportSpec = {
    title: `序证工作台｜${stepName}分析报告`,
    subtitle: `${row.name} · 生成时间：${timeInfo.display}`,
    metadata: [
      ['分析阶段与模块', stepName],
      ['分析任务名称', row.name],
      ['结果生成时间', timeInfo.display],
      ['结果记录总数', `${rows.length.toLocaleString('en-US')} 条记录`],
      ['核心参数与摘要', details]
    ],
    sections: [
      {
        heading: '一、计算生物信息学方法说明',
        paragraphs: [methods[row.kind] || '按工作台标准流程执行分析。'],
        callout: {
          title: '参数与执行摘要',
          text: details
        }
      },
      ...(previewTable ? [{
        heading: `二、核心分析结果预览（前 ${Math.min(15, rows.length)} 条，全量记录见配套 CSV）`,
        table: previewTable
      }] : []),
      {
        heading: '三、原始输入文件与 SHA-256 完整性校验',
        paragraphs: ['以下为本次分析所引用的全部上游输入文件及其 SHA-256 加密哈希值，用于保障数据溯源与发表复现性：'],
        table: {
          headers: ['输入文件名称', 'SHA-256 校验值'],
          rows: sources.length ? sources.map(item => [item.name, item.sha256]) : [['未登记外部文件', '—']]
        }
      },
      {
        heading: '四、配套 SVG 发表级矢量图说明与科学解释边界',
        bullets: [
          { lead: 'SVG 矢量图说明', text: `${figureMeaning[row.kind] || ''} 导出的 SVG 文件支持在 Adobe Illustrator、Inkscape 或 Affinity Designer 中无损缩放与编辑字体。` },
          { lead: '科学严谨性边界', text: limits[row.kind] || '' },
          { lead: '同行评议参考文献', text: literature[row.kind] || '' }
        ]
      }
    ]
  };
  if (lang === 'en') {
    const methodsEn = {
      trna: 'Run tRNAscan-SE 2.0 in bacterial mode (-B), or parse an imported tRNAscan-SE output. Genome coordinates use 1-based closed intervals and a theoretical 10–50 nt tsRNA candidate space is generated.',
      strains: 'Compare full-length tRNA genes and theoretical 5-prime/3-prime tsRNA fragments across bacterial assemblies to identify core loci conserved in every strain and strain-specific loci.',
      tsrna: 'Use a k-mer hash index to match observed OMV small RNA sequences to predicted tRNA regions and mature 3-prime-CCA termini. Classify 5-prime-tRF, 5-prime-tiRNA, 3-prime-tRF, 3-prime-tiRNA and i-tRF fragments and calculate hairpin free energy, RPM and whole-cell enrichment.',
      match: result.mode === 'blast' ? 'Build a BLAST+ nucleotide index for the local reference FASTA and run multi-core blastn or blastn-short local similarity searches with 1-based coordinates.' : 'Compare both strands of the reference FASTA using 100% full-length exact matching with no mismatches or gaps.',
      cells: 'Align host-cell differential-expression tables by homologous gene ID and apply FDR and absolute log2 fold-change thresholds to identify concordant or cell-specific regulation.',
      priority: 'Rank OMV tRNA-derived candidates by RNA structural stability, OMV abundance, cross-kingdom target prediction and the direction of host transcriptome responses.'
    };
    const limitsEn = {
      trna: 'Genome tRNA localization is a computational prediction and does not establish OMV transcription or selective packaging.',
      strains: 'Cross-strain sequence conservation reflects locus homology only; OMV packaging abundance requires OMV small RNA sequencing for each strain.',
      tsrna: 'Provide the true library adapter and review FastQC/Cutadapt output. Multi-locus matches are retained without forced read splitting; OMV localization and biological function require independent experiments.',
      match: result.mode === 'blast' ? 'Local BLAST+ hits, short-sequence E-values and limited query coverage do not establish species origin, mature tsRNA identity or causal target regulation.' : 'Full-length exact matching is not local homology or functional annotation; a no-hit result does not exclude homologs with mismatches.',
      cells: 'This module aligns and categorizes imported differential-expression statistics; it does not rerun DESeq2 or factorial interaction testing from raw counts.',
      priority: 'Evidence scores prioritize molecules for validation. Concordant target prediction and transcriptome changes still require luciferase, mimic/inhibitor, Ago2-RIP or bacterial mutant experiments.'
    };
    const figureMeaningEn = {
      trna: 'The bar chart shows predicted genomic tRNA loci by amino-acid/anticodon type.',
      strains: 'The bar chart shows tRNA sequence counts by cross-strain conservation level.',
      tsrna: 'The bar chart shows OMV read counts by matched fragment length; each unique sequence is counted by reads.',
      cells: 'The bar chart shows significant genes by regulatory category; the secondary figure shows log2 fold-change quadrants across cell lines.',
      priority: 'The bar chart shows candidate counts by mutually exclusive evidence tier; the secondary figure shows the evidence topology of top candidates.',
      match: result.mode === 'blast' ? 'The bar chart shows BLAST+ local alignment records by reference sequence.' : 'The bar chart shows full-length exact-match records by reference sequence.'
    };
    const previewHeadersEn = {
      trna: ['Contig', 'Locus #', 'Start', 'End', 'Strand', 'Amino-acid type', 'Anticodon', 'Cove score'],
      strains: ['tRNA type', 'Anticodon', 'Conservation', 'Copies by strain', '5-prime-tRF-5X (13 nt)', '5-prime-tRF-5b (24 nt)', 'Known homolog'],
      tsrna: ['tsRNA sequence', 'Length', 'Subtype', 'Source tRNA', 'OMV reads', 'RPM', 'OMV/whole-cell log2', 'Hairpin ΔG'],
      cells: ['Host gene ID', `${result.cellLineA || 'Cell line A'} log2FC`, `${result.cellLineA || 'Cell line A'} FDR`, `${result.cellLineB || 'Cell line B'} log2FC`, `${result.cellLineB || 'Cell line B'} FDR`, 'Regulatory direction and category'],
      priority: ['Rank', 'Candidate tsRNA sequence', 'Subtype', 'Source tRNA', 'OMV RPM', 'Hairpin ΔG', 'Key target genes', 'Evidence score'],
      match: ['Query sequence', 'Reference sequence', 'Start', 'End', 'Strand', 'Identity (%)', 'Method']
    };
    reportSpec.title = `Sequence Evidence Workbench | ${STEP_PREFIX_MAP_EN[row.kind] || row.kind} Analysis Report`;
    reportSpec.subtitle = `${localizeReportSpec(row.name)} · Generated: ${timeInfo.display}`;
    reportSpec.metadataHeaders = ['Project attribute', 'Details'];
    reportSpec.metadata = [
      ['Analysis stage and module', STEP_PREFIX_MAP_EN[row.kind] || row.kind], ['Analysis task name', localizeReportSpec(row.name)], ['Generated at', timeInfo.display], ['Total result records', `${rows.length.toLocaleString('en-US')} records`], ['Core parameters and summary', localizeReportSpec(details)]
    ];
    reportSpec.sections[0] = { heading: '1. Computational bioinformatics methods', paragraphs: [methodsEn[row.kind] || 'The standard workbench workflow was executed.'], callout: { title: 'Parameters and execution summary', text: localizeReportSpec(details) } };
    if (previewTable) reportSpec.sections[1] = { heading: `2. Core result preview (first ${Math.min(15, rows.length)} records; full records are available in the companion CSV)`, table: { headers: previewHeadersEn[row.kind] || previewTable.headers, rows: previewTable.rows } };
    const inputIndex = previewTable ? 2 : 1;
    reportSpec.sections[inputIndex] = { heading: '3. Source files and SHA-256 integrity checks', paragraphs: ['The following upstream files and SHA-256 hashes were used for traceability and publication reproducibility:'], table: { headers: ['Input file', 'SHA-256 hash'], rows: sources.length ? sources.map(item => [item.name, item.sha256]) : [['No external file registered', '—']] } };
    reportSpec.sections[inputIndex + 1] = { heading: '4. SVG figure notes and scientific interpretation limits', bullets: [{ lead: 'SVG figure note', text: `${figureMeaningEn[row.kind] || ''} Exported SVG files can be edited and scaled without loss in Adobe Illustrator, Inkscape or Affinity Designer.` }, { lead: 'Scientific interpretation limit', text: limitsEn[row.kind] || '' }, { lead: 'Peer-reviewed references', text: literature[row.kind] || '' }] };
  }
  return buildDocxBuffer(lang === 'en' ? localizeReportSpec(reportSpec) : reportSpec);
}

const server = http.createServer(async (req, res) => {
  const ctx = createProgressContext(req, res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const uploads = db.prepare('SELECT id,kind,name,created_at,summary FROM uploads ORDER BY created_at DESC').all().map(r => {
        const t = formatLocalTimeParts(r.created_at);
        return { ...r, display_time: t.display, summary: JSON.parse(r.summary) };
      });
      const analyses = db.prepare('SELECT id,kind,name,created_at,result FROM analyses ORDER BY created_at DESC').all().map(row => {
        const result = JSON.parse(row.result);
        const t = formatLocalTimeParts(row.created_at);
        return {
          id: row.id,
          kind: row.kind,
          name: row.name,
          created_at: row.created_at,
          display_time: t.display,
          downloadNames: buildDownloadNames(row.kind, row.name, row.created_at),
          meta: { assemblyId: result.assemblyId || null, strainId: result.strainId || null }
        };
      });
      return json(res, 200, {
        apiVersion: '2026.10.15-github-v2',
        uploads,
        analyses,
        tools: {
          trnascan: toolStatus('tRNAscan-SE'),
          cutadapt: toolStatus('cutadapt'),
          fastqc: toolStatus('fastqc'),
          blastn: toolStatus('blastn'),
          makeblastdb: toolStatus('makeblastdb')
        }
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const kind = url.searchParams.get('kind'), name = basename(url.searchParams.get('name') || 'upload.fa');
      if (!['assembly', 'reference', 'reads', 'trna', 'de', 'targets'].includes(kind)) throw new Error('未知文件类型');
      const id = randomUUID(), suffix = /\.(fastq|fq)\.gz$/i.test(name) ? '.fastq.gz' : /\.csv\.gz$/i.test(name) ? '.csv.gz' : extname(name).slice(0, 12), path = join(FILES, `${id}${suffix}`);
      const received = await receiveFile(req, path);
      let summary;
      try {
        if (kind === 'assembly' || kind === 'reference') {
          const records = parseFasta(await readFile(path, 'utf8'));
          summary = kind === 'assembly' ? assemblyStats(records) : { sequences: records.length, totalBp: records.reduce((a, r) => a + r.sequence.length, 0) };
        } else if (kind === 'reads') {
          const strain = fetchUpload(url.searchParams.get('strainId'), 'assembly');
          const reads = await parseSmallRnaFile(path, name);
          const processingStatus = url.searchParams.get('processingStatus') || 'unverified';
          if (!['unverified', 'processed'].includes(processingStatus)) throw new Error('small RNA 预处理状态无效');
          const hasWholeCell = reads.some(r => r.wholeCellCount !== null);
          summary = {
            strainId: strain.id,
            strain: strain.name,
            uniqueSequences: reads.length,
            totalReads: reads.reduce((a, r) => a + r.count, 0),
            processingStatus,
            hasWholeCell,
            format: /\.(fastq|fq)(\.gz)?$/i.test(name) ? 'FASTQ' : 'FASTA/计数表'
          };
        } else if (kind === 'de') {
          const cellLine = (url.searchParams.get('cellLine') || '').trim();
          if (!cellLine) throw new Error('请指定宿主细胞系名称');
          const strainId = url.searchParams.get('strainId');
          const strain = fetchUpload(strainId, 'assembly');
          const rows = parseDifferential(await readFile(path, 'utf8'));
          summary = { cellLine, strainId: strain.id, strain: strain.name, contrast: `${cellLine} + ${strain.name} OMV vs ${cellLine} 空白对照`, genes: rows.length };
        } else if (kind === 'targets') {
          const rows = parseTargetMap(await readFile(path, 'utf8'));
          summary = { predictions: rows.length, methods: [...new Set(rows.map(row => row.method))] };
        } else {
          summary = { status: '待与基因组关联后解析' };
        }
      } catch (error) {
        await unlink(path).catch(() => {});
        throw error;
      }
      db.prepare('INSERT INTO uploads VALUES (?,?,?,?,?,?,?)').run(id, kind, name, received.hash, path, new Date().toISOString(), JSON.stringify(summary));
      return json(res, 201, { id, kind, name, summary });
    }
    const uploadDeleteMatch = url.pathname.match(/^\/api\/uploads\/([a-f0-9-]+)$/);
    if (req.method === 'DELETE' && uploadDeleteMatch) {
      const id = uploadDeleteMatch[1];
      const row = db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
      if (!row) return fail(res, new Error('找不到指定文件'), 404);
      const dependentAnalysis = db.prepare('SELECT name,result FROM analyses').all().find(a => {
        const r = JSON.parse(a.result);
        const cellIds = Array.isArray(r.cellLineItems) ? r.cellLineItems.map(x => x.id) : [];
        return [r.assemblyId, r.annotationId, r.readsId, r.queryId, r.referenceId, r.hepg2Id, r.caco2Id, r.targetsId, ...(r.assemblyIds || []), ...cellIds].includes(id);
      });
      if (dependentAnalysis) throw new Error(`该文件已被分析记录“${dependentAnalysis.name}”引用，请先删除对应分析记录`);
      const dependentUpload = db.prepare('SELECT name,summary FROM uploads WHERE id<>?').all(id).find(u => {
        const s = JSON.parse(u.summary);
        return s.strainId === id || s.derivedFrom === id;
      });
      if (dependentUpload) throw new Error(`该基因组仍关联着文件“${dependentUpload.name}”，请先删除关联文件`);
      await unlink(row.path).catch(() => {});
      db.prepare('DELETE FROM uploads WHERE id=?').run(id);
      return json(res, 200, { deleted: 1, id });
    }
    if (req.method === 'POST' && url.pathname === '/api/fastqc') {
      const input = JSON.parse(await readBody(req, 4096));
      const reads = fetchUpload(input.readsId, 'reads');
      if (!/\.(fastq|fq)(\.gz)?$/i.test(reads.name)) throw new Error('FastQC 需要 FASTQ 或 FASTQ.gz');
      const dir = join(QC, reads.id);
      await mkdir(dir, { recursive: true });
      await ctx.progress(20, '启动 FastQC 质控', `正在对测序文件 ${reads.name} 启动 FastQC (${CPU_THREADS} 线程并行)…`);
      await runTool('fastqc', ['--threads', CPU_THREADS, '--format', 'fastq', '--outdir', dir, reads.path]);
      const zip = (await readdir(dir)).find(name => name.endsWith('_fastqc.zip'));
      if (!zip) throw new Error('FastQC 未生成报告 ZIP');
      await ctx.progress(100, 'FastQC 质控完成', `已成功生成 ${reads.name} 的质量评估报告包。`);
      return ctx.finish(200, { readsId: reads.id, tool: 'FastQC 0.13.0', zipUrl: `/api/fastqc/${reads.id}/zip` });
    }
    const qcMatch = url.pathname.match(/^\/api\/fastqc\/([a-f0-9-]+)\/zip$/);
    if (req.method === 'GET' && qcMatch) {
      const readsRow = fetchUpload(qcMatch[1], 'reads');
      const dir = join(QC, qcMatch[1]), zip = (await readdir(dir)).find(name => name.endsWith('_fastqc.zip'));
      if (!zip) throw new Error('找不到 FastQC 报告');
      const dlName = `步骤2_FastQC质控-${sanitizeFileSegment(readsRow.name)}-${formatLocalTimeParts().fileTag}.zip`;
      res.writeHead(200, { ...headers, 'Content-Type': 'application/zip', 'Content-Disposition': contentDispositionHeader(dlName) });
      return res.end(await readFile(join(dir, zip)));
    }
    if (req.method === 'POST' && url.pathname === '/api/cutadapt') {
      const input = JSON.parse(await readBody(req, 4096));
      const reads = fetchUpload(input.readsId, 'reads'), original = JSON.parse(reads.summary);
      if (!/\.(fastq|fq)(\.gz)?$/i.test(reads.name)) throw new Error('Cutadapt 需要 FASTQ 或 FASTQ.gz');
      const adapter = String(input.adapter || '').toUpperCase().replace(/U/g, 'T');
      if (!/^[ACGT]{8,80}$/.test(adapter)) throw new Error('请填写 8–80 nt 的真实 3′ 接头序列（A/C/G/T）');
      const id = randomUUID(), name = `${reads.name.replace(/\.(fastq|fq)(\.gz)?$/i, '')}.trimmed.fastq.gz`, path = join(FILES, `${id}.fastq.gz`);
      const markProcessed = Boolean(input.markProcessed);
      try {
        await ctx.progress(20, '启动 Cutadapt 接头剪切', `正在使用 3′ 接头 (${adapter.slice(0, 16)}…) 对 ${reads.name} 进行多核剪切 (-j ${CPU_THREADS})…`);
        const run = await runTool('cutadapt', ['-j', CPU_THREADS, '-a', adapter, '-m', '10', '-o', path, reads.path], 1200000);
        await ctx.progress(75, '统计剪切后序列分布', '接头剪切完成，正在折叠唯一序列并统计有效 reads 丰度…');
        const records = await parseSmallRnaFile(path, name), file = await hashFile(path);
        const totalTrimmed = records.reduce((sum, row) => sum + row.count, 0);
        const summary = {
          strainId: original.strainId,
          strain: original.strain,
          uniqueSequences: records.length,
          totalReads: totalTrimmed,
          processingStatus: markProcessed ? 'processed' : 'unverified',
          format: 'FASTQ',
          derivedFrom: reads.id,
          adapter,
          cutadaptLog: run.stdout.slice(-4000)
        };
        db.prepare('INSERT INTO uploads VALUES (?,?,?,?,?,?,?)').run(id, 'reads', name, file.hash, path, new Date().toISOString(), JSON.stringify(summary));
        await ctx.progress(100, 'Cutadapt 处理完成', `已生成 ${name}：保留 ${totalTrimmed.toLocaleString('en-US')} 条高质量 reads（${records.length.toLocaleString('en-US')} 种不同序列）。`, { totalReads: totalTrimmed, uniqueSequences: records.length });
        return ctx.finish(201, { id, name, summary });
      } catch (error) {
        await unlink(path).catch(() => {});
        throw error;
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/trna') {
      const input = JSON.parse(await readBody(req, 4096));
      const assembly = fetchUpload(input.assemblyId, 'assembly');
      await ctx.progress(15, '读取基因组组装', `正在读取并校验细菌基因组 ${assembly.name}…`);
      const contigs = await parsedFasta(assembly);
      await ctx.progress(30, '基因组序列就绪', `已加载 ${contigs.length} 条 Contigs，准备定位 tRNA 基因座…`, { contigs: contigs.length });
      let output, source;
      if (input.annotationId) {
        output = await readFile(fetchUpload(input.annotationId, 'trna').path, 'utf8');
        source = '导入的 tRNAscan-SE 结果';
        await ctx.progress(65, '解析外部注释', '已读取导入的 tRNAscan-SE 结果文件…');
      } else {
        const executable = toolStatus('tRNAscan-SE');
        if (!executable) throw new Error('本机未安装 tRNAscan-SE；可导入其 .out 结果，或安装后在此直接运行');
        output = await runTrnascanCached(executable, assembly.path, assembly.sha256, ctx);
        source = '本机 tRNAscan-SE 细菌模式';
      }
      const hits = parseTrnascan(output, contigs);
      const anticodonCount = new Set(hits.map(x => `${x.type}-${x.anticodon}`)).size;
      await ctx.progress(82, '构建理论 tsRNA 候选库', `已成功定位 ${hits.length} 个 tRNA 基因位点（覆盖 ${anticodonCount} 种反密码子），正在构建理论 tsRNA 序列空间…`, { trnaLoci: hits.length, anticodons: anticodonCount });
      const candidateSpace = theoreticalFragmentSpace(hits, contigs);
      const result = { assemblyId: assembly.id, annotationId: input.annotationId || null, source, hits, candidateSpace };
      const saved = saveAnalysis('trna', `${assembly.name} · tRNA 基因`, result);
      await ctx.progress(100, 'tRNA 扫描完成', `共定位 ${hits.length} 个 tRNA 位点，生成 ${candidateSpace.distinctSequences.toLocaleString('en-US')} 条理论 tsRNA 片段。`, { trnaLoci: hits.length, distinctFragments: candidateSpace.distinctSequences });
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'trna', name: `${assembly.name} · tRNA 基因`, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/compare-strains') {
      const input = JSON.parse(await readBody(req, 4096));
      await ctx.progress(15, '检索多菌株 tRNA 记录', '正在汇总已完成 tRNA 扫描的细菌菌株记录…');
      const trnaRows = Array.isArray(input.trnaIds) && input.trnaIds.length >= 2
        ? input.trnaIds.map(id => db.prepare('SELECT * FROM analyses WHERE id=? AND kind=?').get(id, 'trna')).filter(Boolean)
        : db.prepare('SELECT * FROM analyses WHERE kind=? ORDER BY created_at DESC').all('trna');
      const byAssembly = new Map();
      for (const row of trnaRows) {
        const r = JSON.parse(row.result);
        if (!byAssembly.has(r.assemblyId)) byAssembly.set(r.assemblyId, { row, result: r });
      }
      if (byAssembly.size < 2) throw new Error('需要至少 2 株不同细菌的 tRNA 定位结果才能执行多菌株对比');
      const strainItems = [];
      const assemblyIds = [];
      let idx = 0;
      for (const [assemblyId, { result }] of byAssembly.entries()) {
        idx++;
        const assembly = fetchUpload(assemblyId, 'assembly');
        const contigs = await parsedFasta(assembly);
        assemblyIds.push(assemblyId);
        const sName = assembly.name.replace(/\.(fa|fasta|fna)$/i, '');
        strainItems.push({ strainName: sName, hits: result.hits, contigs });
        await ctx.progress(20 + Math.round(idx / byAssembly.size * 45), '提取菌株 tRNA 序列', `已提取菌株 ${sName} 的 ${result.hits.length} 个 tRNA 位点序列…`, { strain: sName, loci: result.hits.length });
      }
      await ctx.progress(78, '计算跨菌株保守性与茎环能量', `正在比对 ${strainItems.length} 株细菌的核心保守 tRNA、5′-tRF 及已知功能性同源序列…`);
      const comparison = compareMultiStrainTrna(strainItems);
      const result = { assemblyIds, ...comparison };
      const title = `${comparison.strainNames.join(' / ')} · 多菌株 tRNA 保守性对比`;
      const saved = saveAnalysis('strains', title, result);
      await ctx.progress(100, '多菌株对比完成', `识别出 ${comparison.coreConservedTrnaSeqs} 条全菌株 100% 保守 tRNA 序列与 ${comparison.conserved24nt5Prime} 条保守 24 nt 5′-tRF 候选。`, { coreConserved: comparison.coreConservedTrnaSeqs });
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'strains', name: title, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/tsrna') {
      const input = JSON.parse(await readBody(req, 4096));
      const trna = db.prepare('SELECT * FROM analyses WHERE id=? AND kind=?').get(input.trnaId, 'trna');
      if (!trna) throw new Error('请先完成 tRNA 基因定位');
      const model = JSON.parse(trna.result), assembly = fetchUpload(model.assemblyId, 'assembly'), reads = fetchUpload(input.readsId, 'reads');
      if (JSON.parse(reads.summary).strainId !== assembly.id) throw new Error('OMV small RNA 文件与 tRNA 预测必须属于同一菌株');
      await ctx.progress(18, '加载基因组与 OMV 测序数据', `正在读取菌株 ${assembly.name} 基因组与 OMV 样本 ${reads.name}…`);
      const contigs = await parsedFasta(assembly), readRecords = await parsedSmallRnaCached(reads.path, reads.name);
      const readSummary = JSON.parse(reads.summary);
      const processingStatus = readSummary.processingStatus || 'unverified';
      const minLength = Math.max(10, Number(input.minLength) || 10), maxLength = Math.min(100, Number(input.maxLength) || 50);
      if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || maxLength < minLength) throw new Error('tsRNA 长度范围无效');
      const allowCca = input.allowCca !== false;
      await ctx.progress(50, '建立高速 k-mer 索引与 3′-CCA 筛查', `已加载 ${readRecords.length.toLocaleString('en-US')} 种唯一 sRNA 序列，正在对 ${model.hits.length} 个 tRNA 基因座进行精确匹配与亚型分类…`, { uniqueReads: readRecords.length, trnaLoci: model.hits.length });
      const screened = screenExpressedFragments(readRecords, model.hits, contigs, { minLength, maxLength, allowCca });
      const topLocus = screened.locusSummaries[0];
      await ctx.progress(88, '计算二级结构自由能与位点丰度', `已匹配 ${screened.matches.length.toLocaleString('en-US')} 条 tsRNA 记录（覆盖 ${screened.locusSummaries.length} 个 tRNA 基因座${topLocus ? `，最高丰度位点 ${topLocus.type}-${topLocus.anticodon} 累计 ${topLocus.totalOmvReads.toLocaleString('en-US')} reads` : ''}）…`, { matchedRecords: screened.matches.length, activeLoci: screened.locusSummaries.length });
      const result = {
        assemblyId: assembly.id,
        readsId: reads.id,
        trnaId: trna.id,
        source: reads.name,
        processingStatus,
        minLength,
        maxLength,
        allowCca,
        rawFastq: readSummary.rawFastq || false,
        ...screened
      };
      const analysisName = `${assembly.name} · ${reads.name}`;
      const saved = saveAnalysis('tsrna', analysisName, result);
      await ctx.progress(100, 'OMV tsRNA 筛选完成', `成功筛出 ${screened.matches.length.toLocaleString('en-US')} 条 OMV tsRNA 匹配记录！`);
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'tsrna', name: analysisName, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/match') {
      const input = JSON.parse(await readBody(req, 4096));
      const query = await querySequences(input.queryId), target = fetchUpload(input.referenceId, 'reference');
      const mode = input.mode || 'exact';
      if (!['exact', 'blast'].includes(mode)) throw new Error('未知匹配方式');
      const minLength = Number(input.minLength);
      if (!Number.isInteger(minLength) || minLength < 1 || minLength > 10000) throw new Error('最短匹配长度无效');
      await ctx.progress(20, '准备序列比对', `已加载查询集 ${query.name}（${query.records.length} 条序列）与参考库 ${target.name}…`, { queryCount: query.records.length });
      let search;
      if (mode === 'blast') {
        search = await blastMatches(query.records, target, { minLength }, ctx);
      } else {
        const targetContigs = await parsedFasta(target);
        await ctx.progress(60, '执行双链全长精确检索', `正在对 ${targetContigs.length} 条参考序列的正负双链执行高速匹配…`);
        search = exactMatches(query.records, targetContigs, { minLength });
      }
      const analysisName = `${query.name} ↔ ${target.name} · ${mode === 'blast' ? 'BLAST+' : '精确匹配'}`;
      const result = { queryId: query.uploadId, queryAnalysisId: query.analysisId, referenceId: target.id, queryName: query.name, referenceName: target.name, mode, minLength, ...search };
      const saved = saveAnalysis('match', analysisName, result);
      await ctx.progress(100, '序列比对完成', `共检出 ${search.matches.length.toLocaleString('en-US')} 条符合阈值的比对记录。`, { matchCount: search.matches.length });
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'match', name: analysisName, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/compare-cells') {
      const input = JSON.parse(await readBody(req, 8192));
      const fdr = Number(input.fdr), minAbsLog2FC = Number(input.minAbsLog2FC);
      if (!Number.isFinite(fdr) || fdr <= 0 || fdr > 1 || !Number.isFinite(minAbsLog2FC) || minAbsLog2FC < 0) throw new Error('FDR 或 log2FC 阈值无效');

      // Support both flexible N-cell-line array (`cellLineItems`) and classic 2-cell-line (`hepg2Id`, `caco2Id`)
      let rawItems = [];
      if (Array.isArray(input.cellLineItems) && input.cellLineItems.length >= 1) {
        rawItems = input.cellLineItems.filter(x => x && x.id);
      } else if (input.hepg2Id && input.caco2Id) {
        rawItems = [
          { id: input.hepg2Id, label: input.labelA || '' },
          { id: input.caco2Id, label: input.labelB || '' }
        ];
      } else if (input.hepg2Id || input.caco2Id) {
        const onlyId = input.hepg2Id || input.caco2Id;
        rawItems = [{ id: onlyId, label: input.labelA || input.labelB || '' }];
      }
      if (!rawItems.length) throw new Error('请至少选择 1 份宿主细胞差异表达表');

      await ctx.progress(20, '加载宿主细胞差异表达表', `正在解析 ${rawItems.length} 份宿主细胞转录组差异表达文件…`);
      const loaded = [];
      let strainId = null;
      let strainName = '';
      for (const item of rawItems) {
        const uploadRow = fetchUpload(item.id, 'de');
        const meta = JSON.parse(uploadRow.summary);
        if (!strainId) {
          strainId = meta.strainId;
          strainName = meta.strain;
        } else if (meta.strainId !== strainId) {
          throw new Error('所选宿主细胞差异表达表必须对应同一细菌菌株');
        }
        const rows = await parsedDe(uploadRow);
        const label = (item.label && item.label.trim()) || meta.cellLine || uploadRow.name;
        loaded.push({ id: uploadRow.id, name: uploadRow.name, label, rows });
      }

      await ctx.progress(60, '对齐同源基因并筛选显著响应', `已加载 ${loaded.map(x => `${x.label} (${x.rows.length.toLocaleString('en-US')} 基因)`).join('、')}，正在按 FDR ≤ ${fdr}、|log2FC| ≥ ${minAbsLog2FC} 筛选…`);

      let matches, sharedGeneCount, cellLabels;
      if (loaded.length === 2) {
        const a = loaded[0].rows, b = loaded[1].rows;
        const bGenes = new Set(b.map(row => row.gene));
        sharedGeneCount = a.filter(row => bGenes.has(row.gene)).length;
        cellLabels = [loaded[0].label, loaded[1].label];
        matches = compareDifferential(a, b, { fdr, minAbsLog2FC, labelA: loaded[0].label, labelB: loaded[1].label });
      } else {
        const multi = compareMultiCells(loaded, { fdr, minAbsLog2FC });
        matches = multi.matches;
        sharedGeneCount = multi.sharedGeneCount;
        cellLabels = multi.cellLabels;
      }

      const downCount = matches.filter(r => r.direction === '共同下调').length;
      const upCount = matches.filter(r => r.direction === '共同上调').length;
      const labelA = cellLabels[0] || '细胞系 1';
      const labelB = cellLabels[1] || cellLabels[0] || '细胞系 2';
      const result = {
        strainId,
        strain: strainName,
        hepg2Id: loaded[0]?.id || null,
        caco2Id: loaded[1]?.id || loaded[0]?.id || null,
        cellLineItems: loaded.map(x => ({ id: x.id, name: x.name, label: x.label })),
        cellLabels,
        cellLineA: labelA,
        cellLineB: labelB,
        fdr,
        minAbsLog2FC,
        sharedGeneCount,
        matches
      };
      const analysisName = loaded.map(x => x.label || x.name).join(' ↔ ');
      const saved = saveAnalysis('cells', analysisName, result);
      await ctx.progress(100, '宿主转录组比较完成', `共筛出 ${matches.length.toLocaleString('en-US')} 个显著差异基因（同向下调 ${downCount} 个，同向上调 ${upCount} 个）。`, { significantGenes: matches.length, bothDown: downCount, bothUp: upCount });
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'cells', name: analysisName, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/prioritize') {
      const input = JSON.parse(await readBody(req, 4096));
      const tsrnaRow = db.prepare('SELECT * FROM analyses WHERE id=? AND kind=?').get(input.tsrnaId, 'tsrna');
      if (!tsrnaRow) throw new Error('请先完成同一菌株的 OMV tsRNA 筛选');
      const tsrna = JSON.parse(tsrnaRow.result);
      if (tsrna.processingStatus !== 'processed') throw new Error('此 OMV 文件的预处理状态未经确认；不能进入候选证据整合');
      const assembly = fetchUpload(tsrna.assemblyId, 'assembly');
      await ctx.progress(20, '读取 OMV tsRNA 候选集', `正在提取菌株 ${assembly.name} 的已核实 OMV tsRNA 序列（共 ${tsrna.matches.length.toLocaleString('en-US')} 条匹配记录）…`);
      let cells = null, hepg2 = [], caco2 = [], cellDatasets = null;
      if (input.cellsId) {
        const row = db.prepare('SELECT * FROM analyses WHERE id=? AND kind=?').get(input.cellsId, 'cells');
        if (!row) throw new Error('找不到细胞转录组比较结果');
        cells = JSON.parse(row.result);
        if (cells.strainId !== assembly.id) throw new Error('OMV tsRNA 与细胞转录组必须对应同一菌株');
        if (Array.isArray(cells.cellLineItems) && cells.cellLineItems.length) {
          cellDatasets = [];
          for (const item of cells.cellLineItems) {
            const deRow = fetchUpload(item.id, 'de');
            cellDatasets.push({ label: item.label, rows: await parsedDe(deRow) });
          }
          hepg2 = cellDatasets[0]?.rows || [];
          caco2 = cellDatasets[1]?.rows || [];
        } else {
          if (cells.hepg2Id) hepg2 = await parsedDe(fetchUpload(cells.hepg2Id, 'de'));
          if (cells.caco2Id) caco2 = await parsedDe(fetchUpload(cells.caco2Id, 'de'));
        }
      }
      let targets = [];
      let targetSource = '未提供';
      if (input.targetsId && input.targetsId !== '__builtin__') {
        await ctx.progress(50, '加载跨界靶基因预测表', '正在解析外部导入的跨界靶基因预测表…');
        targets = parseTargetMap(await readFile(fetchUpload(input.targetsId, 'targets').path, 'utf8'));
        targetSource = '导入的靶基因预测表';
      } else if (input.targetsId === '__builtin__' || input.useBuiltinTargets) {
        await ctx.progress(50, '运行跨界种子区/反义互补预测', '正在启动内置 8mer/7mer 种子区与反义互补预测引擎扫描人类免疫/增殖核心通路靶点…');
        targets = predictBuiltinTargets(tsrna.matches.map(m => m.sequence));
        targetSource = '内置跨界种子区/反义互补预测引擎';
      }
      await ctx.progress(78, '整合多维证据评分', `已关联 ${targets.length.toLocaleString('en-US')} 条靶点记录，正在结合二级结构自由能与宿主转录组响应计算综合证据分…`, { targetPredictions: targets.length });
      const regulationMode = ['both', 'down', 'up'].includes(input.regulationMode) ? input.regulationMode : 'both';
      const matches = prioritizeCandidates(tsrna.matches, targets, hepg2, caco2, {
        fdr: cells?.fdr ?? 0.05,
        minAbsLog2FC: cells?.minAbsLog2FC ?? 1,
        regulationMode,
        cellDatasets
      });
      const linkedToTranscriptome = Boolean(cells && targets.length > 0);
      const result = {
        assemblyId: assembly.id,
        tsrnaId: tsrnaRow.id,
        cellsId: input.cellsId || null,
        targetsId: input.targetsId === '__builtin__' ? null : (input.targetsId || null),
        targetSource,
        regulationMode,
        strain: assembly.name,
        cellLabels: cells?.cellLabels || [cells?.cellLineA || '细胞系 1', cells?.cellLineB || '细胞系 2'],
        linkedToTranscriptome,
        matches
      };
      const analysisName = `${assembly.name} · ${linkedToTranscriptome ? '候选证据整合' : 'OMV 序列清单'}`;
      const saved = saveAnalysis('priority', analysisName, result);
      await ctx.progress(100, '候选功能性 tsRNA 锁定完成', `Top #1 候选序列：${matches[0]?.sequence || '无'}（综合证据分 ${matches[0]?.evidenceScore || 0}，靶向 ${matches[0]?.targetGenes || '—'}）。`, { topCandidate: matches[0]?.sequence, topScore: matches[0]?.evidenceScore });
      return ctx.finish(201, { id: saved.id, created_at: saved.createdAt, display_time: formatLocalTimeParts(saved.createdAt).display, downloadNames: saved.downloadNames, kind: 'priority', name: analysisName, ...result });
    }
    const analysisMatch = url.pathname.match(/^\/api\/analyses\/([a-f0-9-]+)(?:\/(csv|svg|svg2|report)(?:\/[^/]+)?)?$/);
    if (req.method === 'DELETE' && url.pathname === '/api/analyses') {
      const removed = db.prepare('DELETE FROM analyses').run().changes;
      return json(res, 200, { deleted: removed });
    }
    if (req.method === 'DELETE' && analysisMatch && !analysisMatch[2]) {
      const id = analysisMatch[1];
      const row = db.prepare('SELECT id FROM analyses WHERE id=?').get(id);
      if (!row) return fail(res, new Error('找不到分析结果'), 404);
      const dependent = db.prepare('SELECT name,result FROM analyses WHERE id<>?').all(id).find(other => {
        const result = JSON.parse(other.result);
        return ['trnaId', 'tsrnaId', 'cellsId', 'queryAnalysisId'].some(key => result[key] === id);
      });
      if (dependent) throw new Error(`该结果仍被“${dependent.name}”使用，请先删除后续分析记录`);
      db.prepare('DELETE FROM analyses WHERE id=?').run(id);
      return json(res, 200, { deleted: 1, id });
    }
    if (req.method === 'GET' && analysisMatch) {
      const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(analysisMatch[1]);
      if (!row) return fail(res, new Error('找不到分析结果'), 404);
      const result = JSON.parse(row.result), rows = result.hits || result.matches || [];
      const timeParts = formatLocalTimeParts(row.created_at);
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
      const dlNames = buildDownloadNames(row.kind, row.name, row.created_at, lang);
      if (!analysisMatch[2]) {
        const svgOpts = {
          date: timeParts.display,
          processingStatus: result.processingStatus,
          mode: result.mode,
          cellLabels: result.cellLabels,
          primaryColor: url.searchParams.get('primaryColor') || '#1B4F72',
          accentColor: url.searchParams.get('accentColor') || '#D95F02',
          colorMode: url.searchParams.get('colorMode') || 'highlight',
          fontFamily: url.searchParams.get('fontFamily') || 'Inter,Arial,Helvetica,sans-serif',
          showGrid: url.searchParams.get('showGrid') !== 'false',
          lang
        };
        const svgPreview = figureSvg(row.kind, row.name, rows, svgOpts);
        const svgSecondary = secondaryFigureSvg(row.kind, row.name, result, svgOpts);
        return json(res, 200, { id: row.id, kind: row.kind, name: row.name, createdAt: row.created_at, display_time: timeParts.display, downloadNames: dlNames, result, svgPreview, svgSecondary });
      }
      if (analysisMatch[2] === 'csv') {
        const localized = localizeCsv(row.kind, rows, lang);
        res.writeHead(200, { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDispositionHeader(dlNames.csv) });
        const csvText = csv(localized.rows, localized.keys);
        const headerLine = localized.headers.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',');
        return res.end('\ufeff' + headerLine + '\r\n' + csvText.split('\r\n').slice(1).join('\r\n'));
      }
      if (analysisMatch[2] === 'svg2') {
        const svgOpts = {
          date: timeParts.display,
          processingStatus: result.processingStatus,
          mode: result.mode,
          cellLabels: result.cellLabels,
          primaryColor: url.searchParams.get('primaryColor') || '#1B4F72',
          accentColor: url.searchParams.get('accentColor') || '#D95F02',
          colorMode: url.searchParams.get('colorMode') || 'highlight',
          fontFamily: url.searchParams.get('fontFamily') || 'Inter,Arial,Helvetica,sans-serif',
          showGrid: url.searchParams.get('showGrid') !== 'false',
          lang
        };
        const svg2 = secondaryFigureSvg(row.kind, row.name, result, svgOpts) || figureSvg(row.kind, row.name, result, svgOpts);
        res.writeHead(200, { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': contentDispositionHeader(dlNames.svg2) });
        return res.end(svg2);
      }
      if (analysisMatch[2] === 'report') {
        const inputs = db.prepare('SELECT id,name,sha256 FROM uploads').all();
        const relatedTsrna = (result.tsrnaId || result.queryAnalysisId) ? db.prepare('SELECT result FROM analyses WHERE id=?').get(result.tsrnaId || result.queryAnalysisId) : null;
        const tsrnaInputs = relatedTsrna ? JSON.parse(relatedTsrna.result) : null;
        const relatedTrna = (result.trnaId || tsrnaInputs?.trnaId) ? db.prepare('SELECT result FROM analyses WHERE id=?').get(result.trnaId || tsrnaInputs.trnaId) : null;
        const trnaInputs = relatedTrna ? JSON.parse(relatedTrna.result) : null;
        const relatedCells = result.cellsId ? db.prepare('SELECT result FROM analyses WHERE id=?').get(result.cellsId) : null;
        const cellInputs = relatedCells ? JSON.parse(relatedCells.result) : null;
        const usedReadsId = result.readsId || tsrnaInputs?.readsId;
        const readMeta = usedReadsId ? JSON.parse(fetchUpload(usedReadsId, 'reads').summary) : null;
        const cellItemIds = [
          ...(Array.isArray(result.cellLineItems) ? result.cellLineItems.map(x => x.id) : []),
          ...(Array.isArray(cellInputs?.cellLineItems) ? cellInputs.cellLineItems.map(x => x.id) : [])
        ];
        const ids = [
          result.assemblyId,
          ...(result.assemblyIds || []),
          result.annotationId,
          usedReadsId,
          readMeta?.derivedFrom,
          tsrnaInputs?.assemblyId,
          trnaInputs?.annotationId,
          result.queryId,
          result.referenceId,
          result.hepg2Id,
          result.caco2Id,
          result.targetsId,
          cellInputs?.hepg2Id,
          cellInputs?.caco2Id,
          ...cellItemIds
        ].filter(Boolean);
        const sources = inputs.filter(item => ids.includes(item.id));
        const docxBuf = buildReportDocx(row, result, rows, sources, lang);
        res.writeHead(200, {
          ...headers,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': contentDispositionHeader(dlNames.report)
        });
        return res.end(docxBuf);
      }
      const svgOpts = {
        date: timeParts.display,
        processingStatus: result.processingStatus,
        mode: result.mode,
        cellLabels: result.cellLabels,
        primaryColor: url.searchParams.get('primaryColor') || '#1B4F72',
        accentColor: url.searchParams.get('accentColor') || '#D95F02',
        colorMode: url.searchParams.get('colorMode') || 'highlight',
        fontFamily: url.searchParams.get('fontFamily') || 'Inter,Arial,Helvetica,sans-serif',
        showGrid: url.searchParams.get('showGrid') !== 'false',
        lang
      };
      const svg = figureSvg(row.kind, row.name, rows, svgOpts);
      res.writeHead(200, { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': contentDispositionHeader(dlNames.svg) });
      return res.end(svg);
    }
    if (req.method === 'GET') {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const icon = /^icons\/[a-z0-9-]+\.svg$/.test(file);
      if (!icon && !['index.html', 'app.js', 'style.css', 'logo.svg'].includes(file)) return fail(res, new Error('不存在的路径'), 404);
      const content = await readFile(join(ROOT, 'public', file));
      res.writeHead(200, { ...headers, 'Content-Type': (icon ? 'image/svg+xml' : ({ 'index.html': 'text/html', 'app.js': 'text/javascript', 'style.css': 'text/css', 'logo.svg': 'image/svg+xml' })[file]) + '; charset=utf-8' });
      return res.end(content);
    }
    fail(res, new Error('不支持的请求'), 405);
  } catch (error) {
    ctx.error(error);
  }
});
const PORT = Number(process.env.PORT) || 8817;
server.listen(PORT, '127.0.0.1', () => console.log(`Genome workbench: http://127.0.0.1:${PORT}`));
