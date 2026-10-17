import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFasta,
  assemblyStats,
  parseTrnascan,
  screenFragments,
  theoreticalFragmentSpace,
  exactMatches,
  parseBlastTabular,
  reverseComplement,
  parseSmallRna,
  parseSmallRnaFile,
  screenExpressedFragments,
  parseDifferential,
  compareDifferential,
  compareMultiCells,
  parseTargetMap,
  predictBuiltinTargets,
  prioritizeCandidates,
  compareMultiStrainTrna,
  classifyTsrnaFragment,
  estimateHairpinStability
} from '../lib.mjs';
import { writeFile, unlink } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { figureSvg, secondaryFigureSvg } from '../figure.mjs';
import { buildDocxBuffer } from '../docx.mjs';

test('FASTA validation and assembly statistics', () => {
  const records = parseFasta('>a one\nACGTNN\n>b\nGCGC\n');
  assert.equal(assemblyStats(records).n50, 6);
  assert.equal(assemblyStats(records).gcPercent, 75);
  assert.throws(() => parseFasta('>x\nAC\n>x\nGT'), /重复/);
});
test('reverse-strand tRNA and exact fragment positioning', () => {
  const contigs = parseFasta('>c\nTTTACGTAACCC\n');
  const hits = parseTrnascan('c 1 10 4 Lys TTT 0 0 42.5\n', contigs);
  assert.equal(hits[0].strand, '-');
  assert.equal(reverseComplement('ACGTAAC'), 'GTTACGT');
  const result = screenFragments(parseFasta('>r\nGTTACGT\n'), hits, contigs, { minLength: 7, maxLength: 50 });
  assert.equal(result.length, 1);
  assert.equal(result[0].fragmentStart, 1);
});
test('exact matching searches both strands with 1-based coordinates', () => {
  const result = exactMatches(parseFasta('>q\nACG\n'), parseFasta('>target\nTTTCGTAAA\n'), { minLength: 3 });
  assert.deepEqual(result.matches.map(x => [x.start, x.end, x.strand]), [[4, 6, '-']]);
});
test('BLAST tabular parsing retains query coverage and reverse-strand coordinates', () => {
  const rows = parseBlastTabular('q1\tchr\t100\t24\t24\t1\t24\t100\t77\t2e-7\t48.1\nq2\tchr\t90\t12\t24\t3\t14\t200\t189\t1\t20\n', { minLength: 24 });
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].queryCoverage, rows[0].strand, rows[0].targetStart, rows[0].targetEnd], [100, '-', 100, 77]);
  assert.throws(() => parseBlastTabular('q1\tchr\tbad\t24'), /列数/);
});
test('FASTQ counts collapse and RPM uses all reads including unmatched', () => {
  const reads = parseSmallRna('@a\nGTTACGT\n+\nIIIIIII\n@b\nGTTACGT\n+\nIIIIIII\n@c\nAAAAAAA\n+\nIIIIIII\n', 'reads.fastq');
  const contigs = parseFasta('>c\nTTTACGTAACCC\n');
  const hits = parseTrnascan('c 1 10 4 Lys TTT 0 0 42.5\n', contigs);
  const result = screenExpressedFragments(reads, hits, contigs, { minLength: 7 });
  assert.equal(result.totalReads, 3);
  assert.equal(result.matches[0].readCount, 2);
  assert.equal(result.matches[0].rpm, 666666.67);
});
test('small RNA count table accepts quoted CSV fields and log2 columns', () => {
  const reads = parseSmallRna('sequence,count,note\n"ACGT","2","a,b"\n"ACGT","3","c,d"\n');
  assert.deepEqual(reads.map(({ sequence, count }) => [sequence, count]), [['ACGT', 5]]);
  const log2Reads = parseSmallRna('Sequence,OMV log2 counts,PA14 log2 counts\nCGCGGGATGGAGCAGTCTGGTAGC,6.768184325,5.714785435\n');
  assert.equal(log2Reads[0].count, 109);
  assert.equal(log2Reads[0].wholeCellCount, 53);
});
test('DE tables align by gene and support 1, 2, or N custom-named host cell lines', () => {
  const a = parseDifferential('gene_id,log2FoldChange,padj\nENSG1,-2,0.01\nENSG2,1.5,0.02\n');
  const b = parseDifferential('gene_id\tlog2FoldChange\tpadj\nENSG1\t-1.3\t0.03\nENSG2\t-0.2\t0.5\n');
  const rows = compareDifferential(a, b);
  assert.equal(rows[0].category, '两细胞系同向');
  assert.equal(rows[1].category, '仅 细胞系 1 达阈值');

  const c = parseDifferential('gene_id,log2FoldChange,padj\nENSG1,-1.8,0.005\nENSG2,1.1,0.4\n');
  const multi3 = compareMultiCells([
    { label: '细胞系 1', rows: a },
    { label: '细胞系 2', rows: b },
    { label: 'THP-1', rows: c }
  ], { fdr: 0.05, minAbsLog2FC: 1 });
  assert.deepEqual(multi3.cellLabels, ['细胞系 1', '细胞系 2', 'THP-1']);
  assert.equal(multi3.matches[0].category, '全部 3 细胞系同向');
  assert.equal(multi3.matches[0].direction, '共同下调');
});
test('compressed FASTQ is counted from a stream', async () => {
  const path = join(tmpdir(), `rna-test-${process.pid}.fastq.gz`);
  await writeFile(path, gzipSync('@a\nACGT\n+\nIIII\n@b\nACGT\n+\nIIII\n'));
  try {
    const reads = await parseSmallRnaFile(path, 'reads.fastq.gz');
    assert.equal(reads[0].count, 2);
  } finally {
    await unlink(path);
  }
});
test('candidate chain requires observed OMV read and links predicted human genes across custom cell lines', () => {
  const contigs = parseFasta('>c\nTTTACGTAACCCG\n');
  const hits = parseTrnascan('c 1 4 13 Lys TTT 0 0 40\n', contigs);
  assert.equal(theoreticalFragmentSpace(hits, contigs, { minLength: 7, maxLength: 7 }).loci, 4);
  const observed = screenExpressedFragments(parseSmallRna('sequence,count\nACGTAAC,5\nAAAAAAA,10'), hits, contigs, { minLength: 7, maxLength: 7, allowCca: false });
  const targets = parseTargetMap('sequence,gene_id,method\nACGTAAC,ENSG1,RNAhybrid\n');
  const a = parseDifferential('gene_id,log2FoldChange,padj\nENSG1,-2,0.01');
  const b = parseDifferential('gene_id,log2FoldChange,padj\nENSG1,-1.5,0.02');
  const rows = prioritizeCandidates(observed.matches, targets, a, b);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bothDown, 1);
  assert.equal(rows[0].readCount, 5);
});
test('3-prime CCA tail matching, tsRNA subtype classification, builtin target scan, and multi-strain conservation', () => {
  const sub13 = classifyTsrnaFragment(1, 13, 76, false);
  assert.equal(sub13.subtype, '5′-tRF (tRF-5X, 10–13 nt)');
  const sub24 = classifyTsrnaFragment(1, 24, 77, false);
  assert.equal(sub24.subtype, '5′-tRF (tRF-5b, 22–24 nt)');
  const hp = estimateHairpinStability('CGCGGGATGGAGCAGTCTGGTAGC');
  assert.ok(hp.freeEnergy < -4);

  const built = predictBuiltinTargets(['CGCGGGATGGAGCAGTCTGGTAGC', 'AGGCTTGTAGCTC']);
  assert.ok(built.some(t => t.sequence === 'CGCGGGATGGAGCAGTCTGGTAGC' && t.gene === 'MAP3K7'));
  assert.ok(built.some(t => t.sequence === 'AGGCTTGTAGCTC' && t.gene === 'MAP3K4'));

  const c1 = parseFasta('>s1\nAGGCTTGTAGCTCAGGTGGTTAGAGCGCACCCCTGATAAGGGTGAGGTCGGTGGTTCAAGTCCACTCAGGCCTACCA\n');
  const c2 = parseFasta('>s2\nAGGCTTGTAGCTCAGGTGGTTAGAGCGCACCCCTGATAAGGGTGAGGTCGGTGGTTCAAGTCCACTCAGGCCTACCA\n');
  const h1 = parseTrnascan('s1 1 1 77 Ile GAT 0 0 80.0\n', c1);
  const h2 = parseTrnascan('s2 1 1 77 Ile GAT 0 0 80.0\n', c2);
  const cmp = compareMultiStrainTrna([
    { strainName: 'StrainA', hits: h1, contigs: c1 },
    { strainName: 'StrainB', hits: h2, contigs: c2 }
  ]);
  assert.equal(cmp.coreConservedTrnaSeqs, 1);
  assert.match(cmp.matches[0].knownHomolog, /Ile-tRF-5X/);
});
test('SVG length distribution, secondary SVG, and Word (.docx) buffer generation', () => {
  const svg = figureSvg('tsrna', 'sample & one', [
    { sequence: 'ACGT', length: 4, readCount: 3 },
    { sequence: 'ACGT', length: 4, readCount: 3 },
    { sequence: 'TGCA', length: 4, readCount: 2 }
  ], { date: '2026-10-14 23:15:00' });
  assert.match(svg, /sample &amp; one/);
  assert.match(svg, /4 nt: 5/);
  assert.doesNotMatch(svg, /4 nt: 8/);
  assert.match(svg, /reads 数（单个文件）/);
  const svg2 = secondaryFigureSvg('cells', 'test', {
    cellLineA: '细胞系 1',
    cellLineB: '细胞系 2',
    matches: [{ gene: 'MAP3K7', hepg2Log2FC: -0.86, caco2Log2FC: -0.91, category: '两细胞系同向' }]
  });
  assert.match(svg2, /四象限散点图/);

  const docx = buildDocxBuffer({
    title: '测试报告',
    subtitle: 'Word 导出验证',
    metadata: [['步骤', '步骤1_tRNA扫描']],
    sections: [{ heading: '一、结果', paragraphs: ['验证通过'] }]
  });
  assert.equal(docx.slice(0, 2).toString('ascii'), 'PK');
  assert.ok(docx.length > 500);
});
test('SVG summarizes excess categories without losing counts', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ type: 'Type' + i }));
  const svg = figureSvg('trna', 'assembly', rows);
  assert.match(svg, /其他（4 类）/);
  assert.match(svg, /其他（4 类）: 4/);
  assert.match(svg, /n = 15 预测位点/);
});
