const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const shortLabel = value => [...String(value)].length > 26 ? [...String(value)].slice(0, 25).join('') + '…' : String(value);

function sanitizeHexColor(input, fallback) {
  const s = String(input || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

export function figureSvg(kind, name, rows, {
  date = '',
  processingStatus = 'unverified',
  mode = 'exact',
  cellLabels = [],
  primaryColor = '#1B4F72',
  accentColor = '#D95F02',
  colorMode = 'gene-vs-other',
  focusBarIndex = -1,
  fontFamily = 'Inter,Arial,Helvetica,sans-serif',
  showGrid = true,
  lang = 'zh'
} = {}) {
  const en = lang === 'en';
  const other = en ? 'Other' : '其他';
  const displayName = en ? String(name).replaceAll('tRNA 基因', 'tRNA gene').replaceAll('多菌株保守性对比', 'strain conservation comparison').replaceAll('候选 tsRNA 整合', 'candidate tsRNA integration') : name;
  const geneColor = sanitizeHexColor(primaryColor, '#1B4F72');
  const otherColor = sanitizeHexColor(accentColor, '#D95F02');
  const groups = new Map();
  const add = (label, count = 1) => groups.set(label, (groups.get(label) || 0) + count);
  let title, unit, note, denominator;
  if (kind === 'trna') {
    title = en ? 'Predicted tRNA locus type distribution' : '预测 tRNA 位点的类型分布';
    unit = en ? 'Predicted tRNA loci' : '预测 tRNA 位点数';
    denominator = en ? 'predicted loci' : '预测位点';
    note = en ? 'tRNAscan-SE genome prediction; not evidence of OMV tsRNA detection or expression.' : 'tRNAscan-SE 基因组预测；不表示 OMV 中 tsRNA 的检出或表达。';
    for (const row of rows) add(row.type);
  } else if (kind === 'tsrna') {
    title = en ? 'Length distribution of tRNA-matched sequences' : 'tRNA 区段匹配序列的长度分布';
    unit = en ? 'Reads (single file)' : 'reads 数（单个文件）';
    denominator = en ? 'locus-match records' : '位点匹配记录';
    note = (processingStatus === 'processed' ? (en ? 'Preprocessing declared by importer' : '预处理状态由导入者声明') : (en ? 'Preprocessing unverified' : '预处理状态未核实')) + (en ? '; each unique sequence is counted by reads; mature tsRNA identity is not established.' : '；同一序列按 reads 数计一次；不证明成熟 tsRNA 身份。');
    const unique = new Map();
    for (const row of rows) if (!unique.has(row.sequence)) unique.set(row.sequence, row);
    for (const row of unique.values()) add(String(row.length) + ' nt', row.readCount);
  } else if (kind === 'cells') {
    title = en ? (cellLabels.length > 2 ? `Descriptive categories across ${cellLabels.length} host-cell differential-expression tables` : cellLabels.length === 1 ? `Descriptive categories for ${cellLabels[0]}` : 'Descriptive categories for host-cell differential-expression tables') : (cellLabels.length > 2 ? `${cellLabels.length} 种宿主细胞系差异表达表的描述性分类` : cellLabels.length === 1 ? `${cellLabels[0]} 差异表达表的描述性分类` : '宿主细胞系差异表达表的描述性分类');
    unit = en ? 'Genes' : '基因数';
    denominator = en ? 'categorized genes' : '纳入分类的基因';
    note = en ? 'Differential-expression values were precomputed by the importer; replicates, batches and statistical tests were not revalidated here.' : '由导入者预先计算的差异表达表；本站未核验重复、批次或执行统计检验。';
    for (const row of rows) add(row.category);
  } else if (kind === 'priority') {
    title = en ? 'Evidence tiers for candidate sequences' : '候选序列的证据层级';
    unit = en ? 'Unique sequences' : '不同序列数';
    denominator = en ? 'unique sequences' : '不同序列';
    note = en ? 'Categories are mutually exclusive; concordant target prediction and transcriptome direction do not establish direct action or causality.' : '互斥归类；预测靶基因与转录组方向一致不证明直接作用或因果关系。';
    for (const row of rows) {
      add(
        row.bothDown > 0
          ? (en ? 'Concordant target downregulation' : '预测靶点同向下调')
          : row.bothUp > 0
            ? (en ? 'Concordant target upregulation' : '预测靶点同向上调')
            : (row.hepg2Down > 0 || row.caco2Down > 0 || row.hepg2Up > 0 || row.caco2Up > 0)
              ? (en ? 'Single-cell-line target regulation' : '单细胞系预测靶点调控')
              : row.predictedTargets > 0
                ? (en ? 'Has target prediction' : '有靶基因预测')
                : (en ? 'OMV sequence evidence only' : '仅 OMV 序列证据')
      );
    }
  } else if (kind === 'strains') {
    title = en ? 'tRNA sequence conservation across strains' : '多菌株基因组 tRNA 序列保守性分布';
    unit = en ? 'Unique tRNA sequences' : '不同 tRNA 序列数';
    denominator = en ? 'unique tRNA sequences' : '不同 tRNA 序列';
    note = en ? 'Compares fully conserved and strain-specific tRNA gene sequences across assemblies.' : '比较不同菌株组装中 tRNA 基因序列的完全保守性与菌株特异性。';
    for (const row of rows) add(row.conservation || '其他');
  } else {
    title = en ? (mode === 'blast' ? 'BLAST+ local alignment against a reference FASTA' : 'Full-length exact matching against a reference FASTA') : (mode === 'blast' ? '本地参考 FASTA 的 BLAST+ 局部比对' : '本地参考 FASTA 的完整序列精确匹配');
    unit = en ? (mode === 'blast' ? 'Local alignments' : 'Matches') : (mode === 'blast' ? '局部比对记录数' : '匹配记录数');
    denominator = en ? (mode === 'blast' ? 'local alignments' : 'matches') : (mode === 'blast' ? '局部比对记录' : '匹配记录');
    note = en ? (mode === 'blast' ? 'BLAST+ local similarity hits; not full-length matching, species identification or functional annotation.' : 'Only 100% full-length exact matches are allowed; this is not homology, species identification or functional annotation.') : (mode === 'blast' ? 'BLAST+ 局部相似性命中；不等于全长匹配、物种鉴定或功能注释。' : '仅允许 100% 全长精确匹配；不是 BLAST 同源性、物种鉴定或功能注释。');
    for (const row of rows) add(row.target);
  }
  const sorted = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const entries = sorted.length > 12 ? [...sorted.slice(0, 11), [en ? `Other (${sorted.length - 11} categories)` : '其他（' + (sorted.length - 11) + ' 类）', sorted.slice(11).reduce((sum, [, value]) => sum + value, 0)]] : sorted;
  const width = 1000, left = 300, plotWidth = 620, top = 130, rowHeight = 42;
  const baseline = top + Math.max(entries.length, 1) * rowHeight + 12;
  const height = baseline + 112;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const rawStep = max / 5, magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find(m => m * magnitude >= rawStep) || 10) * magnitude);
  const axisMax = step * Math.ceil(max / step);

  const ticks = Array.from({ length: Math.round(axisMax / step) + 1 }, (_, i) => i * step).map(value => {
    const x = left + value / axisMax * plotWidth;
    const gridStroke = showGrid ? '#e4e9e7' : 'none';
    return '<line class="svg-grid-line" x1="' + x + '" y1="' + (top - 9) + '" x2="' + x + '" y2="' + baseline + '" stroke="' + gridStroke + '"/><text x="' + x + '" y="' + (baseline + 20) + '" text-anchor="middle" font-size="13" fill="#344148">' + escape(value.toLocaleString('en-US')) + '</text>';
  }).join('');

  const hasOtherRow = entries.some(([label]) => String(label).startsWith(en ? 'Other' : '其他'));
  const totalBars = Math.max(1, entries.length);
  const bars = entries.map(([label, value], i) => {
    const y = top + i * rowHeight, barWidth = Math.max(2, value / axisMax * plotWidth);
    const isOther = String(label).startsWith(en ? 'Other' : '其他');
    let useGeneColor;
    if (Number.isInteger(focusBarIndex) && focusBarIndex >= 0) {
      useGeneColor = (i === focusBarIndex);
    } else if (colorMode === 'focus-first') {
      useGeneColor = (i === 0);
    } else if (hasOtherRow) {
      useGeneColor = !isOther;
    } else {
      useGeneColor = (i === 0);
    }
    const barColor = useGeneColor ? geneColor : otherColor;
    const role = isOther ? 'other' : 'gene';
    return '<g class="svg-bar-group" data-bar-index="' + i + '" style="cursor:pointer"><title>' + escape(label) + ': ' + escape(value) + (en ? ' (select to focus this category)' : '（点击可将该项设为焦点基因）') + '</title><text x="' + (left - 16) + '" y="' + (y + 21) + '" text-anchor="end" font-size="14" fill="#253139">' + escape(shortLabel(label)) + '</text><rect class="svg-bar" data-bar-index="' + i + '" data-bar-total="' + totalBars + '" data-bar-label="' + escape(label) + '" data-bar-role="' + role + '" x="' + left + '" y="' + (y + 5) + '" width="' + barWidth + '" height="24" rx="4" fill="' + barColor + '"/><text x="' + (width - 16) + '" y="' + (y + 22) + '" text-anchor="end" font-size="13" font-weight="600" fill="#253139">' + escape(value.toLocaleString('en-US')) + '</text></g>';
  }).join('');

  const plot = entries.length ? bars : '<text x="' + left + '" y="' + (top + 25) + '" font-size="15" fill="#68767a">无符合条件的记录</text>';
  const summary = escape(shortLabel(displayName)) + ' · ' + escape(date) + ' · n = ' + rows.length.toLocaleString('en-US') + ' ' + denominator;
  const tail = groups.size > 12 ? '<text x="40" y="' + (height - 15) + '" font-size="12" fill="#56666a">' + (en ? 'Remaining categories were merged into “Other”; see the analysis CSV for individual records.' : '其余类别已合并为“其他”；逐项结果见同一分析的 CSV。') + '</text>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="' + (height / width * 180).toFixed(1) + 'mm" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="figure-title figure-desc"><title id="figure-title">' + escape(title) + '</title><desc id="figure-desc">' + escape(displayName) + (en ? ' · ' : '；') + escape(note) + '</desc><rect width="100%" height="100%" fill="#fff"/><g class="svg-root-font" font-family="' + escape(fontFamily) + '"><text x="40" y="42" font-size="23" font-weight="700" fill="#17272e">' + escape(title) + '</text><text x="40" y="69" font-size="14" fill="#506068">' + summary + '</text>' + ticks + plot + '<line x1="' + left + '" y1="' + baseline + '" x2="' + (left + plotWidth) + '" y2="' + baseline + '" stroke="#27343a" stroke-width="1.5"/><text x="' + (left + plotWidth / 2) + '" y="' + (baseline + 48) + '" text-anchor="middle" font-size="15" fill="#253139">' + escape(unit) + '</text><text x="40" y="' + (height - 33) + '" font-size="12" fill="#56666a">' + escape(note) + '</text>' + tail + '</g></svg>';
}

export function secondaryFigureSvg(kind, name, result = {}, {
  primaryColor = '#1B4F72',
  accentColor = '#D95F02',
  fontFamily = 'Inter,Arial,sans-serif',
  showGrid = true,
  lang = 'zh'
} = {}) {
  const en = lang === 'en';
  const geneColor = sanitizeHexColor(primaryColor, '#1B4F72');
  const otherColor = sanitizeHexColor(accentColor, '#D95F02');
  const rows = result.hits || result.matches || [];
  if (kind === 'cells' && rows.length) {
    const width = 860, height = 520, cx = 430, cy = 260, scale = 90;
    const labels = Array.isArray(result.cellLabels) && result.cellLabels.length ? result.cellLabels : [result.cellLineA || '细胞系 1', result.cellLineB || '细胞系 2'];
    const labelA = labels[0] || '细胞系 1';
    const labelB = labels[1] || labels[0] || '细胞系 2';
    const titleSuffix = labels.length > 2 ? (en ? ` (${labels.length} cell lines: ${labels.join(' / ')})` : `（含 ${labels.join(' / ')} 共 ${labels.length} 细胞系）`) : '';
    const points = rows.slice(0, 120).map((r, idx) => {
      const x = Math.max(90, Math.min(770, cx + (Number(r.hepg2Log2FC) || 0) * scale));
      const y = Math.max(70, Math.min(440, cy - (Number(r.caco2Log2FC) || 0) * scale));
      const isTargetConcordant = r.direction === '共同下调' || r.direction === '共同上调' || String(r.category).includes('同向');
      const color = isTargetConcordant ? geneColor : otherColor;
      const role = isTargetConcordant ? 'gene' : 'other';
      const showText = idx < 12;
      return `<g><title>${escape(r.gene)}: ${escape(r.cellSummary || `${labelA} log2FC=${r.hepg2Log2FC}, ${labelB} log2FC=${r.caco2Log2FC}`)}</title><circle class="svg-point" data-bar-role="${role}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${color}" fill-opacity="0.88" stroke="#fff" stroke-width="1.5"/>${showText ? `<text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11.5" font-weight="600" fill="#1e293b">${escape(r.gene)}</text>` : ''}</g>`;
    }).join('');
    const gridStroke = showGrid ? '#64748b' : 'none';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#fff"/><g class="svg-root-font" font-family="${escape(fontFamily)}"><text x="36" y="38" font-size="19" font-weight="700" fill="#17272e">${escape(labelA)} vs ${escape(labelB)} ${en ? 'differential-expression quadrant scatter plot (log2FC)' : '差异表达四象限散点图 (log2FC)'}${escape(titleSuffix)}</text><text x="36" y="60" font-size="12.5" fill="#5b7083">${en ? 'Gene color: concordantly regulated predicted targets · Other colors: remaining differential genes' : '基因颜色：同向显著调控靶基因 · 其他基因颜色：其余差异基因'}</text><rect x="80" y="70" width="700" height="380" fill="#f8fafc" stroke="#cbd5e1"/><line class="svg-grid-line" x1="80" y1="${cy}" x2="780" y2="${cy}" stroke="${gridStroke}" stroke-dasharray="4 4"/><line class="svg-grid-line" x1="${cx}" y1="70" x2="${cx}" y2="450" stroke="${gridStroke}" stroke-dasharray="4 4"/><text x="430" y="485" text-anchor="middle" font-size="13" font-weight="600" fill="#334155">${escape(labelA)} log2FoldChange</text><text x="28" y="260" text-anchor="middle" font-size="13" font-weight="600" fill="#334155" transform="rotate(-90 28 260)">${escape(labelB)} log2FoldChange</text>${points}</g></svg>`;
  }
  if (kind === 'priority' && rows.length) {
    const topRows = rows.slice(0, 6);
    const width = 900, height = 110 + topRows.length * 64;
    const items = topRows.map((r, i) => {
      const y = 85 + i * 62;
      const isTarget = i === 0 || r.bothDown > 0 || r.bothUp > 0;
      const badgeColor = isTarget ? geneColor : otherColor;
      const role = isTarget ? 'gene' : 'other';
      const statusText = r.bothDown > 0 ? (en ? `Down ${r.bothDown} targets` : `同向下调 ${r.bothDown} 靶点`) : r.bothUp > 0 ? (en ? `Up ${r.bothUp} targets` : `同向上调 ${r.bothUp} 靶点`) : (en ? `${r.predictedTargets} predicted targets` : `预测靶点 ${r.predictedTargets}`);
      return `<g><rect x="36" y="${y}" width="290" height="46" rx="7" fill="#f8fafc" stroke="${geneColor}" stroke-width="1.4" class="svg-node-box" data-stroke-role="primary"/><text x="48" y="${y + 20}" font-size="12.5" font-weight="700" fill="#0f172a">${escape(shortLabel(r.sequence))} (${r.sequence.length} nt)</text><text x="48" y="${y + 37}" font-size="11" fill="#475569">${escape(r.trnaTypes)} · RPM ${escape(r.rpm)} · ΔG ${escape(r.freeEnergy ?? '—')}</text><line x1="326" y1="${y + 23}" x2="410" y2="${y + 23}" stroke="#64748b" stroke-width="2"/><polygon points="410,${y + 23} 402,${y + 18} 402,${y + 28}" fill="#64748b"/><rect class="svg-bar" data-bar-role="${role}" x="414" y="${y + 7}" width="150" height="32" rx="16" fill="${badgeColor}"/><text x="489" y="${y + 27}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${escape(statusText)}</text><line x1="564" y1="${y + 23}" x2="620" y2="${y + 23}" stroke="#64748b" stroke-width="2"/><rect x="624" y="${y}" width="240" height="46" rx="7" fill="#f8fafc" stroke="#cbd5e1"/><text x="636" y="${y + 20}" font-size="12" font-weight="700" fill="#1e293b">${en ? 'Host target genes: ' : '宿主靶基因：'}${escape(shortLabel(r.targetGenes || (en ? 'Not linked' : '待关联')))}</text><text x="636" y="${y + 37}" font-size="11" fill="#475569">${en ? 'Evidence score' : '综合证据得分'}: ${escape(r.evidenceScore)} (Rank #${i + 1})</text></g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#fff"/><g class="svg-root-font" font-family="${escape(fontFamily)}"><text x="36" y="38" font-size="19" font-weight="700" fill="#17272e">${en ? 'Top OMV tsRNA cross-kingdom regulatory evidence topology' : 'Top 候选 OMV tsRNA 跨界调控证据链拓扑图'}</text><text x="36" y="60" font-size="12.5" fill="#5b7083">${en ? 'Gene color: top-ranked candidates · Other colors: remaining candidates' : '基因颜色：核心锁定候选 · 其他基因颜色：其余候选条目'}</text>${items}</g></svg>`;
  }
  return '';
}
