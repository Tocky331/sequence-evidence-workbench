import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { parse as parseCsv } from 'csv-parse/sync';

// Pre-computed ASCII lookup tables for high-throughput sequence operations
const COMP_MAP = {
  A: 'T', T: 'A', G: 'C', C: 'G',
  R: 'Y', Y: 'R', S: 'S', W: 'W',
  K: 'M', M: 'K', B: 'V', V: 'B',
  D: 'H', H: 'D', N: 'N'
};
const COMP_CODES = new Uint8Array(128);
COMP_CODES.fill(78); // 'N'
for (const [k, v] of Object.entries(COMP_MAP)) {
  COMP_CODES[k.charCodeAt(0)] = v.charCodeAt(0);
  COMP_CODES[k.toLowerCase().charCodeAt(0)] = v.charCodeAt(0);
}

const IS_ACGT = new Uint8Array(128);
IS_ACGT[65] = 1; // A
IS_ACGT[67] = 1; // C
IS_ACGT[71] = 1; // G
IS_ACGT[84] = 1; // T

export function isPureAcgt(seq) {
  const len = seq.length;
  for (let i = 0; i < len; i++) {
    const code = seq.charCodeAt(i);
    if (code >= 128 || !IS_ACGT[code]) return false;
  }
  return len > 0;
}

export function reverseComplement(seq) {
  const len = seq.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const code = seq.charCodeAt(len - 1 - i);
    out[i] = String.fromCharCode(code < 128 ? COMP_CODES[code] : 78);
  }
  return out.join('');
}

export const sha256 = text => createHash('sha256').update(text).digest('hex');

export function parseFasta(text, { minLength = 1 } = {}) {
  const records = [];
  let current = null;
  let seqChunks = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('>')) {
      if (current) {
        current.sequence = seqChunks.join('');
        records.push(current);
      }
      const header = line.slice(1).trim();
      if (!header) throw new Error('FASTA 包含空序列标题');
      current = { id: header.split(/\s+/)[0], header, sequence: '' };
      seqChunks = [];
    } else if (line.trim()) {
      if (!current) throw new Error('FASTA 必须以 >标题 开始');
      const bases = line.trim().replace(/\s/g, '').toUpperCase().replace(/U/g, 'T');
      if (!/^[ACGTRYSWKMBDHVN]+$/.test(bases)) throw new Error(`序列 ${current.id} 包含非 IUPAC 核苷酸字符`);
      seqChunks.push(bases);
    }
  }
  if (current) {
    current.sequence = seqChunks.join('');
    records.push(current);
  }
  if (!records.length) throw new Error('FASTA 中没有序列');
  const seen = new Set();
  for (const item of records) {
    if (item.sequence.length < minLength) throw new Error(`序列 ${item.id} 长度不足`);
    if (seen.has(item.id)) throw new Error(`FASTA 序列 ID 重复：${item.id}`);
    seen.add(item.id);
  }
  return records;
}

export function assemblyStats(records) {
  const lengths = records.map(r => r.sequence.length).sort((a, b) => b - a);
  const total = lengths.reduce((a, b) => a + b, 0);
  let cumulative = 0, n50 = 0;
  for (const length of lengths) {
    cumulative += length;
    if (cumulative >= total / 2) {
      n50 = length;
      break;
    }
  }
  let gc = 0, acgt = 0, ambiguous = 0;
  for (const { sequence } of records) {
    const len = sequence.length;
    for (let i = 0; i < len; i++) {
      const code = sequence.charCodeAt(i);
      if (code === 65 || code === 84) { // A or T
        acgt++;
      } else if (code === 71 || code === 67) { // G or C
        acgt++;
        gc++;
      } else {
        ambiguous++;
      }
    }
  }
  return {
    contigs: records.length,
    totalBp: total,
    n50,
    longest: lengths[0],
    gcPercent: acgt ? +(gc / acgt * 100).toFixed(2) : null,
    ambiguousBp: ambiguous,
    lengths
  };
}

export function parseTrnascan(text, contigs) {
  const known = new Map(contigs.map(c => [c.id, c.sequence.length]));
  const hits = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 9 || !known.has(fields[0]) || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2]) || !/^\d+$/.test(fields[3])) continue;
    const begin = Number(fields[2]), end = Number(fields[3]);
    if (Math.min(begin, end) < 1 || Math.max(begin, end) > known.get(fields[0])) throw new Error(`tRNA 坐标超出 ${fields[0]} 长度`);
    const score = Number(fields[8]);
    if (!Number.isFinite(score)) continue;
    hits.push({
      contig: fields[0],
      number: Number(fields[1]),
      start: Math.min(begin, end),
      end: Math.max(begin, end),
      strand: begin <= end ? '+' : '-',
      type: fields[4],
      anticodon: fields[5],
      intronStart: Number(fields[6]) || 0,
      intronEnd: Number(fields[7]) || 0,
      score
    });
  }
  if (!hits.length) throw new Error('未读到有效 tRNAscan-SE 结果；请检查序列 ID 和文件格式');
  return hits;
}

export function trnaSequence(hit, contigs) {
  const contig = contigs instanceof Map ? contigs.get(hit.contig) : contigs.find(c => c.id === hit.contig);
  if (!contig) throw new Error(`缺少 contig ${hit.contig}`);
  const seqStr = typeof contig === 'string' ? contig : contig.sequence;
  let seq = seqStr.slice(hit.start - 1, hit.end);
  if (hit.strand === '-') seq = reverseComplement(seq);
  return seq;
}

export function classifyTsrnaFragment(position, end, geneLength, isCcaTail = false) {
  const length = end - position + 1;
  const className = position === 1 ? '5′ 端候选' : (end === geneLength || isCcaTail) ? '3′ 端候选' : '内部候选';
  let subtype;
  if (position === 1) {
    if (length <= 13) subtype = '5′-tRF (tRF-5X, 10–13 nt)';
    else if (length <= 16) subtype = '5′-tRF (tRF-5a, 14–16 nt)';
    else if (length <= 21) subtype = '5′-tRF (17–21 nt)';
    else if (length <= 24) subtype = '5′-tRF (tRF-5b, 22–24 nt)';
    else if (length <= 27) subtype = '5′-tRF (25–27 nt)';
    else if (length <= 30) subtype = '5′-tRF (tRF-5c, 28–30 nt)';
    else subtype = '5′-tiRNA (5′ 半分子, ≥31 nt)';
  } else if (end === geneLength || isCcaTail) {
    if (length >= 30) subtype = isCcaTail ? '3′-tiRNA (CCA 成熟末端)' : '3′-tiRNA (3′ 半分子)';
    else if (length <= 18) subtype = isCcaTail ? '3′-tRF (tRF-3a, CCA 末端)' : '3′-tRF (tRF-3a, 10–18 nt)';
    else subtype = isCcaTail ? '3′-tRF (tRF-3b, CCA 末端)' : '3′-tRF (tRF-3b, 19–29 nt)';
  } else {
    subtype = 'i-tRF (内部片段)';
  }
  return { className, subtype };
}

const hairpinCache = new Map();

export function estimateHairpinStability(sequence) {
  const seq = String(sequence || '').toUpperCase().replace(/U/g, 'T');
  const cached = hairpinCache.get(seq);
  if (cached) return cached;

  const len = seq.length;
  if (len < 10) return { gcPercent: 0, maxStemPairs: 0, freeEnergy: 0, stableHairpin: false };
  let gc = 0;
  for (let i = 0; i < len; i++) {
    const c = seq.charCodeAt(i);
    if (c === 71 || c === 67) gc++;
  }
  const gcPercent = +(gc / len * 100).toFixed(1);
  let bestEnergy = 0;
  let bestPairs = 0;
  for (let center = 4; center <= len - 5; center++) {
    for (let loopSize = 3; loopSize <= 6; loopSize++) {
      let left = center - 1;
      let right = center + loopSize;
      let energy = 0;
      let pairs = 0;
      let consecutive = 0;
      while (left >= 0 && right < len) {
        const a = seq.charCodeAt(left);
        const b = seq.charCodeAt(right);
        let s = -1.5;
        if ((a === 71 && b === 67) || (a === 67 && b === 71)) s = 3.0;
        else if ((a === 65 && b === 84) || (a === 84 && b === 65)) s = 2.0;
        else if ((a === 71 && b === 84) || (a === 84 && b === 71)) s = 1.0;
        if (s > 0) {
          pairs++;
          consecutive++;
          energy -= s * (consecutive > 1 ? 1.15 : 0.9);
        } else {
          consecutive = 0;
          energy += 1.2;
        }
        left--;
        right++;
      }
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestPairs = pairs;
      }
    }
  }
  const freeEnergy = +(bestEnergy).toFixed(1);
  const stableHairpin = bestPairs >= Math.max(3, Math.floor(len / 6)) && freeEnergy <= -4.5 && gcPercent >= 45;
  const result = { gcPercent, maxStemPairs: bestPairs, freeEnergy, stableHairpin };
  if (hairpinCache.size < 50000) hairpinCache.set(seq, result);
  return result;
}

export function screenFragments(reads, hits, contigs, { minLength = 15, maxLength = 50, allowCca = true } = {}) {
  const output = [];
  const contigMap = new Map(contigs.map(c => [c.id, c.sequence]));
  const genes = hits.map(hit => {
    const sequence = trnaSequence(hit, contigMap);
    const hasCca = sequence.endsWith('CCA');
    const matureSequence = hasCca ? sequence : `${sequence}CCA`;
    return { ...hit, sequence, matureSequence, hasCca };
  });
  const lengths = [...new Set(reads.map(read => read.sequence.length).filter(length => length >= minLength && length <= maxLength))];
  const index = new Map();
  for (const gene of genes) {
    const geneSeq = gene.sequence;
    const geneLen = geneSeq.length;
    const pureGene = isPureAcgt(geneSeq);
    for (const length of lengths) {
      for (let start = 0; start + length <= geneLen; start++) {
        const sequence = geneSeq.slice(start, start + length);
        if (!pureGene && !isPureAcgt(sequence)) continue;
        let places = index.get(sequence);
        if (!places) {
          places = [];
          index.set(sequence, places);
        }
        places.push({ gene, start, isCcaTail: false });
      }
      if (allowCca && !gene.hasCca && length <= gene.matureSequence.length) {
        const matSeq = gene.matureSequence;
        const matLen = matSeq.length;
        for (let start = Math.max(0, geneLen - length + 1); start + length <= matLen; start++) {
          const sequence = matSeq.slice(start, start + length);
          if (!pureGene && !isPureAcgt(sequence)) continue;
          let places = index.get(sequence);
          if (!places) {
            places = [];
            index.set(sequence, places);
          }
          places.push({ gene, start, isCcaTail: true });
        }
      }
    }
  }
  for (const read of reads) {
    const seq = read.sequence;
    if (seq.length < minLength || seq.length > maxLength) continue;
    const places = index.get(seq);
    if (!places) continue;
    // Lazy evaluation: only compute secondary structure for reads that actually match a tRNA locus
    const structure = estimateHairpinStability(seq);
    for (const { gene, start, isCcaTail } of places) {
      const position = start + 1;
      const end = start + seq.length;
      const { className, subtype } = classifyTsrnaFragment(position, end, gene.sequence.length, isCcaTail);
      output.push({
        readId: read.id,
        sequence: seq,
        length: seq.length,
        contig: gene.contig,
        trnaNumber: gene.number,
        type: gene.type,
        anticodon: gene.anticodon,
        trnaStart: gene.start,
        trnaEnd: gene.end,
        strand: gene.strand,
        fragmentStart: position,
        fragmentEnd: end,
        className,
        subtype,
        isCcaTail,
        gcPercent: structure.gcPercent,
        freeEnergy: structure.freeEnergy,
        stableHairpin: structure.stableHairpin,
        score: gene.score
      });
    }
  }
  return output;
}

const fragmentSpaceCache = new Map();

export function theoreticalFragmentSpace(hits, contigs, { minLength = 15, maxLength = 50 } = {}) {
  const contigMap = contigs instanceof Map ? contigs : new Map(contigs.map(c => [c.id, c.sequence]));
  const sig = hits.map(h => `${h.contig}:${h.start}-${h.end}(${h.strand})`).join('|') + `|${minLength}-${maxLength}`;
  if (fragmentSpaceCache.has(sig)) return fragmentSpaceCache.get(sig);

  const distinct = new Set();
  const seqCounts = new Map();
  for (const hit of hits) {
    const sequence = trnaSequence(hit, contigMap);
    seqCounts.set(sequence, (seqCounts.get(sequence) || 0) + 1);
  }
  let loci = 0, fivePrime = 0, threePrime = 0, internal = 0;
  for (const [sequence, copies] of seqCounts.entries()) {
    const pure = isPureAcgt(sequence);
    const seqLen = sequence.length;
    const maxL = Math.min(maxLength, seqLen);
    for (let length = minLength; length <= maxL; length++) {
      for (let start = 0; start + length <= seqLen; start++) {
        const fragment = sequence.slice(start, start + length);
        if (!pure && !isPureAcgt(fragment)) continue;
        distinct.add(fragment);
        loci += copies;
        if (start === 0) fivePrime += copies;
        else if (start + length === seqLen) threePrime += copies;
        else internal += copies;
      }
    }
  }
  const res = { minLength, maxLength, distinctSequences: distinct.size, loci, fivePrime, threePrime, internal };
  if (fragmentSpaceCache.size < 200) fragmentSpaceCache.set(sig, res);
  return res;
}

export function exactMatches(queries, targets, { minLength = 15, maxHits = 10000 } = {}) {
  const matches = [];
  const preparedQueries = [];
  for (const query of queries) {
    if (query.sequence.length < minLength || !isPureAcgt(query.sequence)) continue;
    preparedQueries.push({
      id: query.id,
      plus: query.sequence,
      minus: reverseComplement(query.sequence),
      len: query.sequence.length
    });
  }
  for (const q of preparedQueries) {
    for (const target of targets) {
      const tSeq = target.sequence;
      for (const [strand, sequence] of [['+', q.plus], ['-', q.minus]]) {
        let from = 0, index;
        while ((index = tSeq.indexOf(sequence, from)) !== -1) {
          matches.push({
            query: q.id,
            target: target.id,
            start: index + 1,
            end: index + q.len,
            strand,
            identity: 100,
            coverage: 100,
            method: '完整序列精确匹配'
          });
          if (matches.length >= maxHits) return { matches, truncated: true };
          from = index + 1;
        }
      }
    }
  }
  return { matches, truncated: false };
}

export function parseBlastTabular(text, { minLength = 1 } = {}) {
  const rows = [];
  for (const line of text.trim().split('\n')) {
    if (!line) continue;
    const fields = line.split('\t');
    if (fields.length !== 11) throw new Error('BLAST+ 输出列数不符合预期');
    const [query, target, pident, length, qlen, qstart, qend, sstart, send, evalue, bitscore] = fields;
    const alignmentLength = Number(length), queryLength = Number(qlen), identity = Number(pident);
    const values = [alignmentLength, queryLength, identity, qstart, qend, sstart, send, evalue, bitscore].map(Number);
    if (values.some(value => !Number.isFinite(value)) || alignmentLength < 1 || queryLength < 1) throw new Error('BLAST+ 输出含无效数值');
    if (alignmentLength < minLength) continue;
    rows.push({
      query,
      target,
      queryStart: Number(qstart),
      queryEnd: Number(qend),
      targetStart: Number(sstart),
      targetEnd: Number(send),
      strand: Number(sstart) <= Number(send) ? '+' : '-',
      alignmentLength,
      queryLength,
      queryCoverage: +(Math.abs(Number(qend) - Number(qstart) + 1) / queryLength * 100).toFixed(2),
      identity,
      evalue: Number(evalue),
      bitscore: Number(bitscore),
      method: 'BLAST+ blastn'
    });
  }
  return rows;
}

export function csv(rows, keys) {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [keys.map(escape).join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n') + '\r\n';
}

export function parseSmallRna(text, filename = '') {
  const normalized = text.replace(/\r/g, '');
  const counts = new Map();
  const wholeCellCounts = new Map();
  const add = (sequence, count = 1, cellCount = null) => {
    const seq = sequence.trim().toUpperCase().replace(/U/g, 'T');
    if (!/^[ACGTRYSWKMBDHVN]+$/.test(seq)) throw new Error('small RNA 含有非 IUPAC 核苷酸字符');
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('reads 计数必须为正整数');
    counts.set(seq, (counts.get(seq) || 0) + count);
    if (cellCount !== null && Number.isFinite(cellCount) && cellCount >= 0) {
      wholeCellCounts.set(seq, (wholeCellCounts.get(seq) || 0) + Math.round(cellCount));
    }
  };
  if (filename.toLowerCase().endsWith('.fastq') || filename.toLowerCase().endsWith('.fq') || normalized.startsWith('@')) {
    const lines = normalized.trimEnd().split('\n');
    if (lines.length % 4) throw new Error('FASTQ 行数不是 4 的倍数；请先解压压缩文件');
    for (let i = 0; i < lines.length; i += 4) {
      if (!lines[i].startsWith('@') || !lines[i + 2].startsWith('+') || lines[i + 1].length !== lines[i + 3].length) throw new Error(`FASTQ 第 ${i + 1} 行附近结构无效`);
      add(lines[i + 1]);
    }
  } else if (normalized.startsWith('>')) {
    for (const record of parseFasta(normalized)) add(record.sequence, 1);
  } else {
    const delimiter = normalized.split('\n')[0].includes('\t') ? '\t' : ',';
    const records = parseCsv(normalized, { columns: true, skip_empty_lines: true, bom: true, delimiter, trim: true });
    if (!records.length) throw new Error('计数表没有数据行');
    const columns = Object.keys(records[0]);
    const seqCol = columns.find(x => ['sequence', 'seq', '序列'].includes(x.trim().toLowerCase()));
    const countCol = columns.find(x => ['count', 'reads', 'abundance', 'omv_count', 'omv_reads', '计数'].includes(x.trim().toLowerCase()));
    const log2Col = columns.find(x => ['omv log2 counts', 'omv_log2', 'log2_count'].includes(x.trim().toLowerCase()));
    const cellCol = columns.find(x => ['whole_cell_count', 'cell_count', 'bacteria_count', 'pa14_count'].includes(x.trim().toLowerCase()));
    const cellLog2Col = columns.find(x => ['pa14 log2 counts', 'cell_log2', 'whole_cell_log2'].includes(x.trim().toLowerCase()));
    if (!seqCol || (!countCol && !log2Col)) throw new Error('计数表需包含 sequence 和 count（或 OMV log2 counts）列');
    for (const record of records) {
      const rawCount = countCol ? Number(record[countCol]) : Math.round(2 ** Number(record[log2Col]));
      const rawCell = cellCol ? Number(record[cellCol]) : cellLog2Col ? Math.round(2 ** Number(record[cellLog2Col])) : null;
      add(record[seqCol], rawCount, rawCell);
    }
  }
  if (!counts.size) throw new Error('small RNA 文件没有可用 reads');
  return [...counts].map(([sequence, count], i) => {
    const wholeCellCount = wholeCellCounts.has(sequence) ? wholeCellCounts.get(sequence) : null;
    const log2Enrichment = wholeCellCount && wholeCellCount > 0 ? +Math.log2(count / wholeCellCount).toFixed(2) : null;
    return { id: `read_${i + 1}`, sequence, count, wholeCellCount, log2Enrichment };
  });
}

export async function parseSmallRnaFile(path, filename) {
  if (!/\.(fastq|fq)(\.gz)?$/i.test(filename)) {
    if (/\.gz$/i.test(filename)) {
      const chunks = [];
      for await (const chunk of createReadStream(path).pipe(createGunzip())) chunks.push(chunk);
      return parseSmallRna(Buffer.concat(chunks).toString('utf8'), filename.replace(/\.gz$/i, ''));
    }
    return parseSmallRna(await readFile(path, 'utf8'), filename);
  }
  const source = createReadStream(path);
  const stream = /\.gz$/i.test(filename) ? source.pipe(createGunzip()) : source;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const counts = new Map();
  let state = 0, header = '', sequence = '', quality = '', records = 0;
  try {
    for await (const line of lines) {
      if (state === 0) {
        if (!line.startsWith('@')) throw new Error(`FASTQ 第 ${records * 4 + 1} 行缺少 @ 标题`);
        header = line;
      } else if (state === 1) {
        sequence = line.toUpperCase().replace(/U/g, 'T');
        if (!/^[ACGTRYSWKMBDHVN]+$/.test(sequence)) throw new Error(`FASTQ ${header} 含有无效序列`);
      } else if (state === 2) {
        if (!line.startsWith('+')) throw new Error(`FASTQ ${header} 缺少 + 分隔行`);
      } else {
        quality = line;
        if (quality.length !== sequence.length) throw new Error(`FASTQ ${header} 的序列与质量值长度不一致`);
        counts.set(sequence, (counts.get(sequence) || 0) + 1);
        records++;
      }
      state = (state + 1) % 4;
    }
  } catch (error) {
    source.destroy();
    throw error;
  }
  if (state !== 0) throw new Error('FASTQ 最后一条记录不完整');
  if (!records) throw new Error('FASTQ 中没有 reads');
  return [...counts].map(([sequence, count], i) => ({ id: `read_${i + 1}`, sequence, count, wholeCellCount: null, log2Enrichment: null }));
}

export function screenExpressedFragments(reads, hits, contigs, options = {}) {
  const matches = screenFragments(reads, hits, contigs, options);
  const bySequence = new Map(reads.map(r => [r.sequence, r]));
  const totalReads = reads.reduce((sum, r) => sum + r.count, 0);
  const lociPerSequence = new Map();
  for (const match of matches) lociPerSequence.set(match.sequence, (lociPerSequence.get(match.sequence) || 0) + 1);

  const enrichedMatches = matches.map(match => {
    const readObj = bySequence.get(match.sequence);
    const readCount = readObj.count;
    const wholeCellCount = readObj.wholeCellCount ?? null;
    const log2Enrichment = readObj.log2Enrichment ?? (wholeCellCount && wholeCellCount > 0 ? +Math.log2(readCount / wholeCellCount).toFixed(2) : null);
    return {
      ...match,
      readCount,
      rpm: +(readCount / totalReads * 1e6).toFixed(2),
      lociCount: lociPerSequence.get(match.sequence),
      wholeCellCount,
      log2Enrichment
    };
  });

  // Summarize per tRNA locus (for Table 1 comparisons such as Koeppen et al. 2016)
  const locusMap = new Map();
  for (const m of enrichedMatches) {
    const key = `${m.contig}:${m.trnaStart}-${m.trnaEnd}(${m.strand})`;
    if (!locusMap.has(key)) {
      locusMap.set(key, {
        locusKey: key,
        contig: m.contig,
        trnaNumber: m.trnaNumber,
        type: m.type,
        anticodon: m.anticodon,
        trnaStart: m.trnaStart,
        trnaEnd: m.trnaEnd,
        strand: m.strand,
        totalOmvReads: 0,
        uniqueOmvReads: 0,
        fivePrimeOmvReads: 0,
        totalWholeCellReads: 0,
        fragmentCount: 0,
        topSequence: m.sequence,
        topSequenceReads: m.readCount
      });
    }
    const loc = locusMap.get(key);
    loc.totalOmvReads += m.readCount;
    if (m.lociCount === 1) loc.uniqueOmvReads += m.readCount;
    if (m.fragmentStart === 1) loc.fivePrimeOmvReads += m.readCount;
    if (m.wholeCellCount) loc.totalWholeCellReads += m.wholeCellCount;
    loc.fragmentCount++;
    if (m.readCount > loc.topSequenceReads) {
      loc.topSequence = m.sequence;
      loc.topSequenceReads = m.readCount;
    }
  }
  const locusSummaries = [...locusMap.values()]
    .map(loc => ({
      ...loc,
      locusLog2Enrichment: loc.totalWholeCellReads > 0 ? +Math.log2(loc.totalOmvReads / loc.totalWholeCellReads).toFixed(2) : null
    }))
    .sort((a, b) => b.totalOmvReads - a.totalOmvReads);

  return {
    totalReads,
    uniqueSequences: reads.length,
    matches: enrichedMatches,
    locusSummaries
  };
}

export function parseDifferential(text) {
  const firstLine = text.replace(/\r/g, '').split('\n')[0];
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, bom: true, delimiter: firstLine.includes('\t') ? '\t' : ',', relax_quotes: false, trim: true });
  if (!records.length) throw new Error('差异表达表没有数据行');
  const columns = Object.keys(records[0]);
  const find = aliases => columns.find(x => aliases.includes(x.toLowerCase()));
  const geneCol = find(['gene', 'gene_id', 'geneid', 'ensembl_gene_id', 'symbol', 'gene_name']);
  const lfcCol = find(['log2foldchange', 'log2fc', 'logfc', 'log2_fold_change']);
  const padjCol = find(['padj', 'fdr', 'adj.p.val', 'adjusted_p_value', 'qvalue', 'pvalue', 'p_value']);
  if (!geneCol || !lfcCol || !padjCol) throw new Error('差异表达表需要 gene_id/gene、log2FoldChange、padj/FDR 列');
  const rows = [], seen = new Set();
  for (const record of records) {
    const gene = record[geneCol].trim(), log2FC = Number(record[lfcCol]), padj = Number(record[padjCol]);
    if (!gene || !Number.isFinite(log2FC) || !Number.isFinite(padj) || padj < 0 || padj > 1) continue;
    if (seen.has(gene)) throw new Error(`差异表达表中基因 ID 重复：${gene}`);
    seen.add(gene);
    rows.push({ gene, log2FC, padj });
  }
  if (!rows.length) throw new Error('差异表达表没有有效的基因、log2FC 和 FDR 数值');
  return rows;
}

export function compareDifferential(hepg2, caco2, { fdr = 0.05, minAbsLog2FC = 1, labelA = '细胞系 1', labelB = '细胞系 2' } = {}) {
  const other = new Map(caco2.map(row => [row.gene, row]));
  const rows = [];
  for (const a of hepg2) {
    const b = other.get(a.gene);
    if (!b) continue;
    const aSig = a.padj <= fdr && Math.abs(a.log2FC) >= minAbsLog2FC;
    const bSig = b.padj <= fdr && Math.abs(b.log2FC) >= minAbsLog2FC;
    if (!aSig && !bSig) continue;
    const category = aSig && bSig
      ? Math.sign(a.log2FC) === Math.sign(b.log2FC)
        ? '两细胞系同向'
        : '两细胞系反向'
      : aSig
        ? `仅 ${labelA} 达阈值`
        : `仅 ${labelB} 达阈值`;
    const direction = aSig && bSig && Math.sign(a.log2FC) === Math.sign(b.log2FC)
      ? (a.log2FC < 0 ? '共同下调' : '共同上调')
      : category;
    rows.push({
      gene: a.gene,
      hepg2Log2FC: a.log2FC,
      hepg2Fdr: a.padj,
      caco2Log2FC: b.log2FC,
      caco2Fdr: b.padj,
      category,
      direction
    });
  }
  return rows.sort((a, b) => Math.min(a.hepg2Fdr, a.caco2Fdr) - Math.min(b.hepg2Fdr, b.caco2Fdr));
}

// Multi-Cell-Line Generalization: supports 1, 2, 3, or N custom-named host cell lines
export function compareMultiCells(cellDatasets, { fdr = 0.05, minAbsLog2FC = 1 } = {}) {
  if (!Array.isArray(cellDatasets) || !cellDatasets.length) {
    throw new Error('请至少提供 1 份宿主细胞差异表达表');
  }
  if (cellDatasets.length === 2) {
    const [first, second] = cellDatasets;
    const matches = compareDifferential(first.rows, second.rows, {
      fdr,
      minAbsLog2FC,
      labelA: first.label || '细胞系 1',
      labelB: second.label || '细胞系 2'
    }).map(row => ({
      ...row,
      cell_0_log2FC: row.hepg2Log2FC,
      cell_0_fdr: row.hepg2Fdr,
      cell_1_log2FC: row.caco2Log2FC,
      cell_1_fdr: row.caco2Fdr,
      cellSummary: `${first.label}: ${row.hepg2Log2FC} (FDR ${row.hepg2Fdr}) | ${second.label}: ${row.caco2Log2FC} (FDR ${row.caco2Fdr})`
    }));
    const secondSet = new Set(second.rows.map(r => r.gene));
    const sharedGeneCount = first.rows.filter(r => secondSet.has(r.gene)).length;
    return {
      cellLabels: [first.label || '细胞系 1', second.label || '细胞系 2'],
      sharedGeneCount,
      matches
    };
  }

  const n = cellDatasets.length;
  const maps = cellDatasets.map(d => new Map(d.rows.map(r => [r.gene, r])));
  const allGenes = new Set();
  for (const m of maps) for (const g of m.keys()) allGenes.add(g);

  let sharedGeneCount = 0;
  const rows = [];
  for (const gene of allGenes) {
    const present = maps.map((m, idx) => ({ label: cellDatasets[idx].label || `Cell_${idx + 1}`, row: m.get(gene), idx })).filter(x => x.row);
    if (present.length === n) sharedGeneCount++;
    // Require presence in all compared cell lines when n <= 2, or at least 1 significant across compared lines
    if (present.length < Math.min(2, n)) continue;

    const sigs = present.filter(x => x.row.padj <= fdr && Math.abs(x.row.log2FC) >= minAbsLog2FC);
    if (!sigs.length) continue;

    const downSigs = sigs.filter(x => x.row.log2FC < 0);
    const upSigs = sigs.filter(x => x.row.log2FC > 0);
    let category, direction;

    if (n === 1) {
      const only = sigs[0];
      category = only.row.log2FC < 0 ? `${only.label} 显著下调` : `${only.label} 显著上调`;
      direction = only.row.log2FC < 0 ? '共同下调' : '共同上调';
    } else if (sigs.length === n && (downSigs.length === n || upSigs.length === n)) {
      category = `全部 ${n} 细胞系同向`;
      direction = downSigs.length === n ? '共同下调' : '共同上调';
    } else if (sigs.length >= 2 && (downSigs.length === sigs.length || upSigs.length === sigs.length)) {
      category = `${sigs.length}/${n} 细胞系同向`;
      direction = downSigs.length === sigs.length ? '共同下调' : '共同上调';
    } else if (sigs.length >= 2) {
      category = '多细胞系反向';
      direction = '多细胞系反向';
    } else {
      category = `仅 ${sigs[0].label} 达阈值`;
      direction = category;
    }

    const firstRow = maps[0].get(gene) || present[0].row;
    const secondRow = (maps[1] && maps[1].get(gene)) || present[Math.min(1, present.length - 1)].row;
    const minFdr = Math.min(...present.map(x => x.row.padj));
    const entry = {
      gene,
      hepg2Log2FC: firstRow.log2FC,
      hepg2Fdr: firstRow.padj,
      caco2Log2FC: secondRow.log2FC,
      caco2Fdr: secondRow.padj,
      category,
      direction,
      minFdr,
      cellSummary: cellDatasets.map((d, i) => {
        const r = maps[i].get(gene);
        return r ? `${d.label}: ${r.log2FC} (FDR ${r.padj})` : `${d.label}: —`;
      }).join(' | ')
    };
    cellDatasets.forEach((_, i) => {
      const r = maps[i].get(gene);
      entry[`cell_${i}_log2FC`] = r ? r.log2FC : null;
      entry[`cell_${i}_fdr`] = r ? r.padj : null;
    });
    rows.push(entry);
  }
  rows.sort((a, b) => a.minFdr - b.minFdr);
  return {
    cellLabels: cellDatasets.map((d, i) => d.label || `Cell_${i + 1}`),
    sharedGeneCount,
    matches: rows
  };
}

export function parseTargetMap(text) {
  const firstLine = text.replace(/\r/g, '').split('\n')[0];
  const records = parseCsv(text, { columns: true, skip_empty_lines: true, bom: true, delimiter: firstLine.includes('\t') ? '\t' : ',', trim: true });
  if (!records.length) throw new Error('靶基因预测表没有数据行');
  const columns = Object.keys(records[0]);
  const pick = aliases => columns.find(column => aliases.includes(column.toLowerCase()));
  const seqCol = pick(['sequence', 'tsrna_sequence', 'trf_sequence']);
  const geneCol = pick(['gene_id', 'gene', 'target_gene']);
  const methodCol = pick(['method', 'tool', 'prediction_method']);
  const scoreCol = pick(['score', 'prediction_score']);
  const pathwayCol = pick(['pathway', 'function', 'description']);
  if (!seqCol || !geneCol || !methodCol) throw new Error('靶基因表需要 sequence、gene_id 和 method 列');
  const rows = [], seen = new Set();
  for (const record of records) {
    const sequence = record[seqCol].toUpperCase().replace(/U/g, 'T');
    const gene = record[geneCol].trim();
    const method = record[methodCol].trim();
    if (!isPureAcgt(sequence) || !gene || !method) continue;
    const key = `${sequence}\t${gene}\t${method}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreCol && record[scoreCol] !== '' ? Number(record[scoreCol]) : null;
    const pathway = pathwayCol && record[pathwayCol] ? record[pathwayCol].trim() : '';
    rows.push({ sequence, gene, method, score: Number.isFinite(score) ? score : null, pathway });
  }
  if (!rows.length) throw new Error('靶基因预测表无有效记录');
  return rows;
}

// Built-in Cross-Kingdom Host Target Reference Panel & Seed/Antisense Predictor
export const BUILTIN_HOST_PANEL = [
  { gene: 'MAP3K7', pathway: 'LPS-stimulated MAPK / NF-κB Signaling (TAK1)', motifs: ['CTACCAGACTGCTCCATCCCGCG', 'CCAGACTGCTCCATCCC', 'GCTCCATCCCGCG'] },
  { gene: 'MAP2K4', pathway: 'LPS-stimulated MAPK Signaling (MKK4)', motifs: ['GCTACCAGACTGCTCCATCCC', 'ACTGCTCCATCCCGCG'] },
  { gene: 'MAP2K2', pathway: 'LPS-stimulated MAPK Signaling (MEK2)', motifs: ['CTACCAGACTGCTCCATCC', 'TGCTCCATCCCGCG'] },
  { gene: 'MAP2K3', pathway: 'LPS-stimulated MAPK Signaling (MKK3)', motifs: ['GCTACCAGACTGCTCCA', 'TCCATCCCGCG'] },
  { gene: 'PIK3R2', pathway: 'PI3K / MAPK Innate Immune Signaling', motifs: ['CTACCAGACTGCTCCAT', 'CCATCCCGCG'] },
  { gene: 'CXCL8', pathway: 'Innate Immune Chemokine (IL-8)', motifs: ['GACTGCTCCATCCCGCG', 'CTCCATCCCGCG'] },
  { gene: 'MAP3K4', pathway: 'MAPK Stress & Proliferation Signaling (MEKK4)', motifs: ['GAGCTACAAGCCT', 'TCTAACCACCTGAGCTACAAGCCT', 'CTACAAGCCT'] },
  { gene: 'MKI67', pathway: 'Host Cell Proliferation (Ki-67)', motifs: ['GAGCTACAAGCCT', 'CTACAAGCCT'] },
  { gene: 'CCND1', pathway: 'Host Cell Cycle G1/S Transition (Cyclin D1)', motifs: ['GAGCTACAAGCCT', 'ACAAGCCT'] },
  { gene: 'TLR4', pathway: 'Pathogen Recognition / LPS Receptor', motifs: ['CAGGACTCGAACCTGCG', 'GACTCGAACCTGCG'] }
];

export function predictBuiltinTargets(sequences, customHostFasta = []) {
  const results = [];
  const uniqueSeqs = [...new Set(sequences.map(s => String(s).toUpperCase().replace(/U/g, 'T')))];

  // Build 8-mer inverted index on customHostFasta for O(1) seed-and-extend lookup
  const seed8Index = new Map();
  for (const hostRec of customHostFasta) {
    const tSeq = hostRec.sequence;
    const tLen = tSeq.length;
    const seenSeeds = new Set();
    for (let i = 0; i + 8 <= tLen; i++) {
      const kmer = tSeq.slice(i, i + 8);
      if (seenSeeds.has(kmer)) continue;
      seenSeeds.add(kmer);
      let list = seed8Index.get(kmer);
      if (!list) {
        list = [];
        seed8Index.set(kmer, list);
      }
      list.push(hostRec);
    }
  }

  for (const seq of uniqueSeqs) {
    if (seq.length < 10) continue;
    const rc = reverseComplement(seq);
    const seed8 = reverseComplement(seq.slice(0, 8));
    const seed7 = reverseComplement(seq.slice(1, 8));
    for (const item of BUILTIN_HOST_PANEL) {
      let matched = false;
      let score = 0;
      for (const motif of item.motifs) {
        if (rc.includes(motif) || motif.includes(rc)) {
          matched = true;
          score = Math.max(score, 165 + Math.min(rc.length, motif.length));
        } else if (motif.includes(seed8)) {
          matched = true;
          score = Math.max(score, 152);
        } else if (motif.includes(seed7)) {
          matched = true;
          score = Math.max(score, 140);
        }
      }
      if (matched) {
        results.push({
          sequence: seq,
          gene: item.gene,
          method: 'Built-in Seed/Antisense Scan',
          score,
          pathway: item.pathway
        });
      }
    }
    if (customHostFasta.length) {
      const candidateHosts = seed8Index.get(seed8) || [];
      for (const hostRec of candidateHosts) {
        const targetSeq = hostRec.sequence;
        if (targetSeq.includes(rc)) {
          results.push({
            sequence: seq,
            gene: hostRec.id,
            method: 'Full Reverse-Complement Match',
            score: 180,
            pathway: hostRec.header || 'Custom Host Transcript'
          });
        } else {
          results.push({
            sequence: seq,
            gene: hostRec.id,
            method: '8mer Seed Reverse-Complement',
            score: 145,
            pathway: hostRec.header || 'Custom Host Transcript'
          });
        }
      }
    }
  }
  return results;
}

export function prioritizeCandidates(tsrnaMatches, targets = [], hepg2 = [], caco2 = [], { fdr = 0.05, minAbsLog2FC = 1, regulationMode = 'both', cellDatasets = null } = {}) {
  const unique = new Map();
  for (const match of tsrnaMatches) {
    const item = unique.get(match.sequence);
    if (item) {
      item.trnaTypes.add(match.type);
      if (match.subtype) item.subtypes.add(match.subtype);
    } else {
      const structure = estimateHairpinStability(match.sequence);
      unique.set(match.sequence, {
        sequence: match.sequence,
        length: match.sequence.length,
        readCount: match.readCount,
        rpm: match.rpm,
        lociCount: match.lociCount,
        log2Enrichment: match.log2Enrichment ?? null,
        stableHairpin: match.stableHairpin ?? structure.stableHairpin,
        freeEnergy: match.freeEnergy ?? structure.freeEnergy,
        trnaTypes: new Set([match.type]),
        subtypes: new Set([match.subtype || match.className || '5′ 端候选'])
      });
    }
  }
  const bySeq = new Map();
  for (const target of targets) {
    const group = bySeq.get(target.sequence) || [];
    group.push(target);
    bySeq.set(target.sequence, group);
  }

  const activeCellSets = Array.isArray(cellDatasets) && cellDatasets.length
    ? cellDatasets.map(d => ({ label: d.label, map: new Map((d.rows || []).map(row => [row.gene, row])) }))
    : [
        ...(hepg2 && hepg2.length ? [{ label: 'Cell-1', map: new Map(hepg2.map(row => [row.gene, row])) }] : []),
        ...(caco2 && caco2.length ? [{ label: 'Cell-2', map: new Map(caco2.map(row => [row.gene, row])) }] : [])
      ];

  const a = activeCellSets[0]?.map || new Map();
  const b = activeCellSets[1]?.map || new Map();
  const direction = row => (!row || row.padj > fdr || Math.abs(row.log2FC) < minAbsLog2FC) ? 'none' : row.log2FC < 0 ? 'down' : 'up';
  const rows = [];
  for (const candidate of unique.values()) {
    const linked = bySeq.get(candidate.sequence) || [];
    const genes = new Set(linked.map(item => item.gene));
    const methods = new Set(linked.map(item => item.method));
    let hepg2Down = 0, hepg2Up = 0, caco2Down = 0, caco2Up = 0, bothDown = 0, bothUp = 0;
    const regulatedGenes = [];
    for (const gene of genes) {
      if (activeCellSets.length > 2) {
        const dirs = activeCellSets.map(cs => direction(cs.map.get(gene)));
        const downCount = dirs.filter(d => d === 'down').length;
        const upCount = dirs.filter(d => d === 'up').length;
        if (dirs[0] === 'down') hepg2Down++;
        if (dirs[0] === 'up') hepg2Up++;
        if (dirs.slice(1).some(d => d === 'down')) caco2Down += dirs.slice(1).filter(d => d === 'down').length;
        if (dirs.slice(1).some(d => d === 'up')) caco2Up += dirs.slice(1).filter(d => d === 'up').length;
        if (downCount >= 2 && upCount === 0) {
          bothDown++;
          regulatedGenes.push(`${gene}(${'↓'.repeat(downCount)})`);
        } else if (upCount >= 2 && downCount === 0) {
          bothUp++;
          regulatedGenes.push(`${gene}(${'↑'.repeat(upCount)})`);
        } else if (downCount > 0 || upCount > 0) {
          const arrows = dirs.map(d => d === 'down' ? '↓' : d === 'up' ? '↑' : '-').join('/');
          regulatedGenes.push(`${gene}(${arrows})`);
        }
      } else if (activeCellSets.length === 1) {
        const ad = direction(a.get(gene));
        if (ad === 'down') {
          hepg2Down++;
          bothDown++;
          regulatedGenes.push(`${gene}(↓)`);
        } else if (ad === 'up') {
          hepg2Up++;
          bothUp++;
          regulatedGenes.push(`${gene}(↑)`);
        }
      } else {
        const ad = direction(a.get(gene)), bd = direction(b.get(gene));
        if (ad === 'down') hepg2Down++;
        if (ad === 'up') hepg2Up++;
        if (bd === 'down') caco2Down++;
        if (bd === 'up') caco2Up++;
        if (ad === 'down' && bd === 'down') {
          bothDown++;
          regulatedGenes.push(`${gene}(↓↓)`);
        } else if (ad === 'up' && bd === 'up') {
          bothUp++;
          regulatedGenes.push(`${gene}(↑↑)`);
        } else if (ad !== 'none' || bd !== 'none') {
          regulatedGenes.push(`${gene}(${ad === 'down' ? '↓' : ad === 'up' ? '↑' : '-'}/${bd === 'down' ? '↓' : bd === 'up' ? '↑' : '-'})`);
        }
      }
    }
    const primaryConcordant = regulationMode === 'down' ? bothDown : regulationMode === 'up' ? bothUp : (bothDown + bothUp);
    const singleConcordant = regulationMode === 'down' ? (hepg2Down + caco2Down) : regulationMode === 'up' ? (hepg2Up + caco2Up) : (hepg2Down + caco2Down + hepg2Up + caco2Up);
    const evidenceScore = +(
      primaryConcordant * 40 +
      singleConcordant * 15 +
      Math.min(genes.size, 10) * 4 +
      (candidate.stableHairpin ? 8 : 0) +
      (candidate.log2Enrichment && candidate.log2Enrichment > 1 ? Math.min(candidate.log2Enrichment * 3, 15) : 0) +
      Math.log10(Math.max(1, candidate.readCount)) * 5
    ).toFixed(1);
    rows.push({
      ...candidate,
      trnaTypes: [...candidate.trnaTypes].join(', '),
      subtype: [...candidate.subtypes][0] || '5′ 端候选',
      predictedTargets: genes.size,
      targetGenes: regulatedGenes.length ? regulatedGenes.join(', ') : [...genes].slice(0, 6).join(', '),
      predictionMethods: [...methods].join(', '),
      hepg2Down,
      hepg2Up,
      caco2Down,
      caco2Up,
      bothDown,
      bothUp,
      evidenceScore
    });
  }
  return rows.sort((x, y) => {
    if (regulationMode === 'down') {
      return y.bothDown - x.bothDown || (y.hepg2Down + y.caco2Down) - (x.hepg2Down + x.caco2Down) || y.rpm - x.rpm || x.lociCount - y.lociCount;
    }
    if (regulationMode === 'up') {
      return y.bothUp - x.bothUp || (y.hepg2Up + y.caco2Up) - (x.hepg2Up + x.caco2Up) || y.rpm - x.rpm || x.lociCount - y.lociCount;
    }
    return (
      y.bothDown - x.bothDown ||
      y.bothUp - x.bothUp ||
      (y.hepg2Down + y.caco2Down + y.hepg2Up + y.caco2Up) - (x.hepg2Down + x.caco2Down + x.hepg2Up + x.caco2Up) ||
      y.rpm - x.rpm ||
      x.lociCount - y.lociCount
    );
  });
}

// Multi-Strain tRNA & Theoretical tsRNA Conservation Analysis (e.g. for WYCR559, ZRCR73616, ZRCR78927)
export function compareMultiStrainTrna(strainItems) {
  if (!Array.isArray(strainItems) || strainItems.length < 2) {
    throw new Error('请至少选择 2 份菌株的 tRNA 定位结果进行多菌株保守性对比');
  }
  const strainNames = strainItems.map(s => s.strainName);
  const byFullSeq = new Map();
  const byFivePrime13 = new Map();
  const byFivePrime24 = new Map();

  for (const item of strainItems) {
    const { strainName, hits, contigs } = item;
    const contigMap = new Map(contigs.map(c => [c.id, c.sequence]));
    for (const hit of hits) {
      const seq = trnaSequence(hit, contigMap);
      const label = `${hit.type}(${hit.anticodon})`;
      if (!byFullSeq.has(seq)) {
        byFullSeq.set(seq, {
          sequence: seq,
          length: seq.length,
          type: hit.type,
          anticodon: hit.anticodon,
          label,
          fivePrime13: seq.slice(0, 13),
          fivePrime24: seq.slice(0, 24),
          threePrime22: (seq.endsWith('CCA') ? seq : `${seq}CCA`).slice(-22),
          strains: new Map()
        });
      }
      const entry = byFullSeq.get(seq);
      entry.strains.set(strainName, (entry.strains.get(strainName) || 0) + 1);

      const fp13 = seq.slice(0, 13);
      if (!byFivePrime13.has(fp13)) byFivePrime13.set(fp13, { sequence: fp13, type: hit.type, anticodon: hit.anticodon, strains: new Set() });
      byFivePrime13.get(fp13).strains.add(strainName);

      const fp24 = seq.slice(0, 24);
      if (!byFivePrime24.has(fp24)) byFivePrime24.set(fp24, { sequence: fp24, type: hit.type, anticodon: hit.anticodon, strains: new Set() });
      byFivePrime24.get(fp24).strains.add(strainName);
    }
  }

  const rows = [...byFullSeq.values()].map(entry => {
    const presentStrains = [...entry.strains.keys()];
    const copySummary = strainNames.map(name => `${name}:${entry.strains.get(name) || 0}`).join(' | ');
    const conservation = presentStrains.length === strainNames.length
      ? '核心保守（全部菌株共有）'
      : presentStrains.length === 1
        ? `菌株特异（仅 ${presentStrains[0]}）`
        : `部分共有（${presentStrains.length}/${strainNames.length} 株）`;
    const structure24 = estimateHairpinStability(entry.fivePrime24);
    let knownHomolog = '—';
    if (entry.fivePrime13 === 'AGGCTTGTAGCTC') {
      knownHomolog = '100% 同源 E. coli OMV Ile-tRF-5X (Diallo et al. 2022, 靶向宿主 MAP3K4)';
    } else if (entry.fivePrime24 === 'CGCGGGATGGAGCAGTCTGGTAGC') {
      knownHomolog = '100% 同源 P. aeruginosa OMV sRNA52320 (Koeppen et al. 2016, 靶向宿主 MAP3K7/MAP2K4)';
    } else if (entry.fivePrime24 === 'CGCGGGGTGGAGCAGCCTGGTAGC' || entry.fivePrime24 === 'CGCGGGGTGGAGCAGTCTGGTAGC') {
      knownHomolog = '高度同源 (≥91.7%) P. aeruginosa OMV sRNA52320 / PA14_62790 5′-tRF-fMet';
    }
    return {
      type: entry.type,
      anticodon: entry.anticodon,
      length: entry.length,
      strainCount: presentStrains.length,
      conservation,
      copySummary,
      fivePrime13: entry.fivePrime13,
      fivePrime24: entry.fivePrime24,
      threePrime22: entry.threePrime22,
      hairpinFreeEnergy: structure24.freeEnergy,
      knownHomolog,
      sequence: entry.sequence
    };
  }).sort((a, b) => b.strainCount - a.strainCount || a.type.localeCompare(b.type));

  const coreCount = rows.filter(r => r.strainCount === strainNames.length).length;
  const specificCount = rows.filter(r => r.strainCount === 1).length;
  const conserved13Count = [...byFivePrime13.values()].filter(x => x.strains.size === strainNames.length).length;
  const conserved24Count = [...byFivePrime24.values()].filter(x => x.strains.size === strainNames.length).length;

  return {
    strainNames,
    totalDistinctTrnaSeqs: rows.length,
    coreConservedTrnaSeqs: coreCount,
    strainSpecificTrnaSeqs: specificCount,
    conserved13nt5Prime: conserved13Count,
    conserved24nt5Prime: conserved24Count,
    matches: rows
  };
}
