const $ = id => document.getElementById(id);
let state = { uploads: [], analyses: [], tools: {} };

// The release build keeps Chinese as the source language and translates the
// rendered interface in place. This also covers HTML created by later refreshes.
const LANGUAGE_STORAGE_KEY = 'sequence-workbench-language';
let currentLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
const isEnglish = () => currentLanguage === 'en';
const t = (zh, en) => isEnglish() ? en : zh;
const displayCellName = (name, index) => isEnglish() && /^细胞系\s*\d+$/.test(String(name || '')) ? `Cell line ${index + 1}` : (name || t(`细胞系 ${index + 1}`, `Cell line ${index + 1}`));
const ENGLISH_TRANSLATIONS = {
  '序证工作台': 'Sequence Evidence Workbench',
  '序证工作台标志': 'Sequence Evidence Workbench logo',
  '主导航': 'Primary navigation',
  '工作台概览': 'Workbench Overview',
  '数据导入与质控': 'Data Import & QC',
  '基因组 tRNA 扫描': 'Genome tRNA Scanning',
  'OMV tsRNA 筛选': 'OMV tsRNA Screening',
  '宿主细胞转录组': 'Host Cell Transcriptomics',
  '候选 tsRNA 整合': 'Candidate tsRNA Integration',
  '序列比对工具': 'Sequence Alignment',
  '结果与图表导出': 'Results & Export',
  '下载与运行说明': 'Download & Run Guide',
  '本地多核高速生信引擎': 'Local multi-core bioinformatics engine',
  '支持任意细菌 · 自由添加与命名宿主细胞': 'Any bacterial species · Add and name host cell lines freely',
  '细菌基因组 tRNA 扫描 · OMV small RNA 富集筛选 · 多宿主细胞系转录组与候选 tsRNA 锁定': 'Bacterial genome tRNA scanning · OMV small RNA enrichment · Multi-host transcriptome integration',
  '覆盖“步骤 1：细菌基因组 tRNA 扫描与多菌株保守性分析 → 步骤 2：OMV small RNA 高速 k-mer 精确匹配、3′-CCA 识别与富集度计算 → 步骤 3：自由添加与命名任意数量宿主细胞系（1 至 N 个细胞系）进行转录组差异分析与跨界靶基因联合筛选”。执行过程中提供实时阶段进度与动态发现反馈。': 'Covers Stage 1: bacterial genome tRNA scanning and multi-strain conservation; Stage 2: high-speed OMV small RNA k-mer matching, 3′-CCA recognition and enrichment; and Stage 3: transcriptome differential analysis and cross-kingdom target integration across any number of named host cell lines. Live progress and discovery updates are shown during execution.',
  '管理细菌基因组、OMV 测序文件、自由命名与添加宿主细胞转录组及 FASTQ 接头剪切': 'Manage bacterial genomes, OMV sequencing files, freely named host-cell transcriptomes and FASTQ adapter trimming',
  '支持任意细菌基因组、OMV sRNA 及自由定义任意数量与名称的宿主细胞系': 'Supports any bacterial genome, OMV sRNA data and any number of named host cell lines',
  '.fa / .fasta / .fna（支持任意革兰氏阴性/阳性细菌）': '.fa / .fasta / .fna (Gram-negative or Gram-positive bacteria)',
  'FASTQ(.gz) / FASTA / CSV(含全菌对照或log2列)': 'FASTQ(.gz) / FASTA / CSV (including whole-cell controls or log2 columns)',
  '文本输出 .out / .txt': 'Text output .out / .txt',
  '用于 BLAST+ 或精确检索的 FASTA': 'FASTA for BLAST+ or exact searches',
  '3. 宿主细胞差异表达表导入（按需自由增减细胞个数与自定义名称）': '3. Host-cell differential-expression table import (add or remove named cell lines as needed)',
  '不预设固定细胞系；请根据实验设计自由设定宿主细胞个数（1 至 N 个），自定义每个细胞系名称并上传 CSV/TSV 差异表达表': 'No fixed cell lines are required. Set 1 to N host cell lines, name each one, and upload its CSV/TSV differential-expression table.',
  '对应菌株：': 'Strain:',
  'FastQC 0.13.0 · Cutadapt 5.2 多线程并行': 'FastQC 0.13.0 · Cutadapt 5.2 · Multi-threaded execution',
  '常用建库 3′ 接头预设': 'Common library 3′ adapter presets',
  '手动输入或选择常用试剂盒接头…': 'Enter manually or choose a common kit adapter…',
  '输入建库试剂盒真实 3′ 接头序列': 'Enter the true 3′ adapter sequence used by the library kit',
  '提示：选择预设会自动填入标准 3′ 接头序列；Cutadapt 多核并行剪切后保留 ≥10 nt 序列（覆盖 13 nt Ile-tRF-5X 等超短 tRF），并自动登记为已去接头样本。': 'Tip: a preset fills the standard 3′ adapter automatically. Multi-core Cutadapt retains sequences ≥10 nt, including short tRFs such as 13 nt Ile-tRF-5X, and records the sample as adapter-trimmed.',
  '未被下游分析引用的文件可直接删除': 'Files not referenced by downstream analyses can be deleted directly',
  '尚未导入细菌基因组组装，请点击右上角“导入实验数据”开始分析。': 'No bacterial genome assembly has been imported. Select “Import experimental data” to begin.',
  '0 个文件 · 0 项分析记录': '0 files · 0 analysis records',
  '步骤 1 · 基因组与 tRNA 预测': 'Stage 1 · Genome and tRNA prediction',
  '步骤 2 · OMV small RNA 筛选': 'Stage 2 · OMV small RNA screening',
  '步骤 3A · 宿主细胞转录组比较': 'Stage 3A · Host cell transcriptome comparison',
  '步骤 3B · 候选 tsRNA 证据链整合': 'Stage 3B · Candidate tsRNA evidence integration',
  '结合 OMV 富集度、二级结构、跨界靶基因预测与宿主响应锁定候选 tsRNA': 'Rank candidate tsRNA using OMV enrichment, secondary structure, cross-kingdom target prediction and host response',
  '输入自定义细胞系名称（自定义细胞名称，如 细胞系 1 / 巨噬细胞 / 上皮细胞）': 'Enter a custom cell line name (e.g. cell line 1 / macrophage / epithelial cell)',
  '＋ 添加细胞系': '＋ Add cell line',
  '就绪': 'Ready',
  '缺失': 'Missing',
  '核加速': '-core acceleration',
  'tRNA 基因': 'tRNA gene',
  '候选证据整合': 'candidate evidence integration',
  'OMV 序列清单': 'OMV sequence list',
  '待解析': 'Unparsed',
  '正在初始化生信分析流水线…': 'Initializing the bioinformatics pipeline…',
  '与': 'and',
  '含 CCA 成熟末端': 'mature CCA terminus',
  '（': '(',
  '）': ')',
  '，': ', ',
  '提示：选择预设会自动填入标准 3′ 接头序列；Cutadapt 多核并行剪切后保留 ≥10 nt 序列（覆盖 13 nt': 'Tip: a preset fills the standard 3′ adapter sequence automatically. Multi-core Cutadapt retains sequences ≥10 nt (including',
  '等超短 tRF），并自动登记为已去接头样本。': ' and other short tRFs) and records the sample as adapter-trimmed.',
  '检测工具中…': 'Checking tools…',
  '刷新': 'Refresh',
  '使用说明': 'User Guide',
  '关闭使用说明': 'Close user guide',
  '概览使用说明': 'Overview guide',
  '导入实验数据': 'Import experimental data',
  '从细菌基因组到跨界调控候选 tsRNA 的完整证据链': 'A complete evidence chain from bacterial genomes to cross-kingdom regulatory tsRNA candidates',
  '当前项目资产': 'Current project assets',
  '四阶段生信证据流水线状态': 'Four-stage evidence pipeline status',
  '点击任一阶段可直接跳转对应工作台页面': 'Select a stage to open its workbench',
  '科学严谨性边界：': 'Scientific scope: ',
  '科学严谨性边界：基因组 tRNA 定位属于计算预测；OMV 包装表达和宿主转录组响应须分别由对应测序数据支持，最终候选 tsRNA 调控机制需经独立分子实验验证。': 'Scientific scope: genome tRNA localization is a computational prediction; OMV packaging and host transcriptome responses require their respective sequencing evidence, and candidate tsRNA mechanisms require independent molecular validation.',
  '导入实验与参考文件': 'Import experimental and reference files',
  '已导入文件清单': 'Imported files',
  '文件名 / ID': 'File name / ID',
  '类型': 'Type',
  '统计摘要': 'Summary',
  '导入日期与时间': 'Imported at',
  '操作': 'Actions',
  '删除文件': 'Delete file',
  '删除分析记录': 'Delete analysis record',
  '清空全部分析记录': 'Clear all analysis records',
  '分析名称（点击查看详情与图表）': 'Analysis name (select to view details and figures)',
  '分析类型': 'Analysis type',
  '分析日期与时间': 'Analysis date and time',
  '一键导出': 'Export',
  '数据导入与质控': 'Data Import & QC',
  'OMV 来源菌株': 'OMV source strain',
  'OMV small RNA 文件状态': 'OMV small RNA processing status',
  '已完成接头去除、质量控制及污染过滤（可进入候选整合）': 'Adapter removal, QC and contaminant filtering completed (eligible for candidate integration)',
  '原始或预处理状态未核实（仅作探索性比对）': 'Raw or unverified preprocessing (exploratory matching only)',
  '1. 细菌基因组组装': '1. Bacterial genome assembly',
  '2. OMV small RNA 测序/计数': '2. OMV small RNA sequencing/counts',
  '4. 跨界靶基因预测表（可选）': '4. Cross-kingdom target prediction table (optional)',
  '5. 外部 tRNAscan-SE 结果（可选）': '5. External tRNAscan-SE output (optional)',
  '6. 本地参考序列库（可选）': '6. Local reference sequence database (optional)',
  '导入': 'Import',
  '宿主细胞差异表达表导入': 'Host-cell differential-expression table import',
  '细胞个数：': 'Cell lines:',
  '增加 1 个宿主细胞系': 'Add one host cell line',
  '减少 1 个宿主细胞系': 'Remove one host cell line',
  'FASTQ 质控与 3′ 接头多核剪切': 'FASTQ QC and multi-core 3′ adapter trimming',
  '运行 FastQC': 'Run FastQC',
  '运行 Cutadapt': 'Run Cutadapt',
  '3′ 接头序列': '3′ adapter sequence',
  '运行 tRNA 扫描': 'Run tRNA scan',
  '运行多菌株保守性对比': 'Compare strain conservation',
  '筛选 OMV tsRNA': 'Screen OMV tsRNA',
  '比较宿主细胞转录组': 'Compare host transcriptomes',
  '锁定候选 tsRNA': 'Rank candidate tsRNA',
  '开始序列比对': 'Run sequence alignment',
  '本机分析记录与发表级图表/Word 报告导出': 'Local analyses and publication-ready figure/Word export',
  '全长精确匹配': 'Full-length exact match',
  'BLAST+ 局部比对': 'BLAST+ local alignment',
  '全长精确匹配要求查询序列 100% 覆盖、无错配或缺口；BLAST+ 对 ≤50 nt 短序列自动启用多核': 'Exact matching requires 100% query coverage with no mismatches or gaps; BLAST+ uses the multi-core short-read mode for sequences ≤50 nt.',
  '请选择': 'Select',
  '待执行': 'Pending',
  '已就绪': 'Ready',
  '待导入': 'Awaiting import',
  '尚无数据。请选择上方卡片导入实验文件。': 'No data yet. Use the cards above to import experimental files.',
  '尚无分析记录': 'No analysis records yet',
  '导出 CSV': 'Export CSV',
  '导出 SVG': 'Export SVG',
  '导出专题 SVG': 'Export subject SVG',
  '导出报告': 'Export report',
  '实时筛选表格内容': 'Filter table contents in real time',
  '没有符合条件的命中。请核对输入、长度阈值和参考数据库。': 'No matching records. Check the inputs, length thresholds and reference database.',
  '发表级可编辑矢量图预览（SVG）': 'Publication-ready editable vector preview (SVG)',
  '专题科学视图（四象限散点 / 证据链拓扑）': 'Subject view (quadrant scatter / evidence topology)',
  '生成时间：': 'Generated: ',
  '下载、安装与 GitHub 上传说明': 'Download, installation & GitHub upload guide',
  '导出失败': 'Export failed',
  '导出 CSV 失败': 'CSV export failed',
  '导出 SVG 失败': 'SVG export failed',
  '已导出 Word 报告：': 'Word report exported: ',
  '已导出 CSV：': 'CSV exported: ',
  '已导出自定义配色 SVG 矢量图：': 'Custom-color SVG exported: ',
  '确定删除已导入文件': 'Delete imported file',
  '吗？': '?',
  '已删除文件': 'File deleted',
  '正在导入并解析文件': 'Importing and parsing file',
  '已成功导入': 'Imported successfully',
  '正在导入宿主细胞系': 'Importing host cell line',
  '差异表达表': 'differential-expression table',
  '细胞系': 'Cell line',
  '移除': 'Remove',
  '自定义显示名称：': 'Custom display name:',
  '选择细胞系': 'Select cell line',
  '导入差异表': 'Import differential table',
  '序列匹配': 'Sequence matching',
  '基因组组装': 'Genome assembly',
  '参考序列库': 'Reference sequence database',
  'tRNA 基因定位': 'tRNA gene annotation',
  '多菌株保守性对比': 'Multi-strain conservation',
  '差异表达表': 'Differential-expression table',
  '靶基因预测': 'Target prediction',
  '细胞转录组比较': 'Cell transcriptome comparison',
  '候选 tsRNA 整合': 'Candidate tsRNA Integration',
  '步骤 1': 'Stage 1',
  '步骤 2': 'Stage 2',
  '步骤 3A': 'Stage 3A',
  '步骤 3B': 'Stage 3B',
  '内置跨界种子区/反义互补预测引擎': 'Built-in cross-kingdom seed/antisense complement predictor',
  '双向综合': 'Bidirectional integration',
  '开启': 'On',
  '仅基因组': 'Genome only',
  '已关联': 'Linked',
  '未关联': 'Unlinked',
  '步骤 1：细菌基因组 tRNA 基因扫描与理论 tsRNA 建库': 'Stage 1: bacterial genome tRNA scanning and theoretical tsRNA library',
  'tRNAscan-SE 2.0 细菌模式 (-B) 多核并行 · 1-based 坐标': 'tRNAscan-SE 2.0 bacterial mode (-B) · Multi-core execution · 1-based coordinates',
  '选择细菌基因组组装': 'Select bacterial genome assembly',
  'tRNA 预测方式': 'tRNA prediction method',
  '直接调用本机 tRNAscan-SE (-B 细菌模式)': 'Run the local tRNAscan-SE bacterial mode (-B)',
  '自动识别细菌基因组全部 tRNA 位点、反密码子、正负链方向，并构建 10–50 nt 理论 tsRNA 候选空间（5′-tRF、3′-tRF、5′/3′-tiRNA、i-tRF），支持 SHA-256 签名高速缓存。': 'Identify bacterial genomic tRNA loci, anticodons and strand orientation, then build a 10–50 nt theoretical tsRNA candidate space (5′-tRF, 3′-tRF, 5′/3′-tiRNA and i-tRF) with SHA-256 signature caching.',
  '多菌株基因组 tRNA 与候选 tsRNA 保守性横向对比': 'Cross-strain conservation of genomic tRNA and candidate tsRNA sequences',
  '适用于多株同种或跨种细菌基因组横向比较': 'For comparative analysis across multiple strains or species',
  '对比当前已完成的全部菌株 tRNA 定位结果，自动筛出': 'Compare completed tRNA mappings and automatically identify',
  '所有菌株 100% 共有的核心保守 tRNA/tsRNA': 'core tRNA/tsRNA sequences shared by 100% of strains',
  '菌株特异性 tRNA': 'strain-specific tRNAs',
  '并自动比对文献已证实的功能性 OMV tsRNA 同源序列（如': 'and compare reported functional OMV tsRNA homologs such as',
  '步骤 2：OMV small RNA 测序匹配、tsRNA 亚型分类与富集度分析': 'Stage 2: OMV small RNA matching, tsRNA subtype classification and enrichment analysis',
  '高速 k-mer 哈希索引 · 支持成熟 tRNA 3′-CCA 尾匹配 · 自动计算 RPM 与 OMV/全菌 log2 富集比': 'High-speed k-mer index · Mature tRNA 3′-CCA tail matching · Automatic RPM and OMV/whole-cell log2 enrichment',
  '菌株 tRNA 定位结果': 'Strain tRNA mapping result',
  '同菌株 OMV small RNA 样本': 'Same-strain OMV small RNA sample',
  '最短 nt': 'Minimum length (nt)',
  '最长 nt': 'Maximum length (nt)',
  '3′-CCA 匹配': '3′-CCA matching',
  '自动将 OMV 序列精细分类为': 'Classify OMV sequences into',
  '、': ', ',
  '（含 CCA 成熟末端）': '(mature CCA terminus)',
  '，按需惰性计算二级结构茎环自由能（ΔG），并输出按 tRNA 基因位点汇总的 OMV 丰度排行表。': '; compute hairpin free energy (ΔG) on demand and report OMV abundance by tRNA locus.',
  '步骤 3A：转染后宿主细胞系转录组差异表达分析': 'Stage 3A: post-treatment host-cell transcriptome differential-expression analysis',
  '支持自由增减参与对比的宿主细胞个数（1 至 N 个细胞系）并自定义名称': 'Add or remove 1 to N host cell lines and assign custom names',
  '配置参与对比的宿主细胞系（可自由添加或删减细胞个数）': 'Configure host cell lines for comparison',
  '支持单细胞系独立筛选、双细胞系四象限对比，或 3 个及以上宿主细胞系联合同向/特异调控分析': 'Support single-cell-line screening, two-cell-line quadrant comparison, or concordant/specific regulation analysis across three or more lines',
  '对比细胞个数：': 'Cell lines compared:',
  '所属细菌菌株': 'Bacterial strain',
  '支持比较任意数量与任意命名的同菌株处理宿主细胞转录组/蛋白组差异表，自动识别在各细胞系中': 'Compare any number of named same-strain host transcriptome/proteome differential-expression tables and identify genes that are',
  '共同显著下调': 'significantly downregulated in common',
  '共同显著上调': 'significantly upregulated in common',
  '的宿主响应基因。': 'across the host cell lines.',
  '步骤 3B：跨界靶基因预测与候选功能性 tsRNA 证据链整合': 'Stage 3B: cross-kingdom target prediction and candidate functional tsRNA evidence integration',
  'OMV 富集 tsRNA × 二级结构稳定性 × 跨界靶基因预测 × 宿主细胞转录组响应': 'OMV-enriched tsRNA × secondary-structure stability × cross-kingdom target prediction × host transcriptome response',
  '本地参考序列匹配工具': 'Local reference sequence matching',
  '支持双链 100% 精确匹配与本地多核 BLAST+ (blastn-short / blastn)': 'Supports 100% double-strand exact matching and local multi-core BLAST+ (blastn-short / blastn)',
  '查询 FASTA 或 tsRNA 结果': 'Query FASTA or tsRNA result',
  '参考数据库 FASTA': 'Reference database FASTA',
  '全长精确匹配要求查询序列 100% 覆盖、无错配或缺口；BLAST+ 对 ≤50 nt 短序列自动启用多核 blastn-short。': 'Full-length exact matching requires 100% query coverage with no mismatches or gaps; BLAST+ uses multi-core blastn-short for sequences ≤50 nt.',
  '本机分析记录与发表级图表/Word 报告导出': 'Local analyses and publication-ready figures/Word reports',
  '统一按“跑的哪一步-名称-结果时间”命名导出 CSV 全表、可编辑 SVG 矢量图与 Word (.docx) 报告': 'Export complete CSV tables, editable SVG figures and Word (.docx) reports using stage, name and timestamp',
  '所有导入的分析记录和数据均保留在本机': 'All imported analyses and data remain local'
  ,'＋ 添加对比细胞系': '＋ Add comparison cell line',
  '或': 'or',
  'OMV tsRNA 筛选结果': 'OMV tsRNA screening result',
  '同菌株宿主细胞转录组比较': 'Same-strain host transcriptome comparison',
  '跨界靶基因来源': 'Cross-kingdom target source',
  '调控机制筛选模式': 'Regulatory mode',
  '暂不关联细胞结果': 'Do not link a cell result',
  '暂不关联靶基因预测': 'Do not link target predictions',
  '双向综合（下调抑制 + 上调促进）': 'Bidirectional integration (downregulation + upregulation)',
  '经典类 miRNA 靶基因下调（如 sRNA52320 → MAP3K7/MAP2K4）': 'Canonical miRNA-like target downregulation (e.g. sRNA52320 → MAP3K7/MAP2K4)',
  'miRNA 海绵竞争靶基因上调（如 Ile-tRF-5X → MAP3K4）': 'miRNA-sponge target upregulation (e.g. Ile-tRF-5X → MAP3K4)',
  '若尚未导入外部 miRanda / RNAhybrid 预测表，可直接选择': 'If no external miRanda/RNAhybrid target table is available, select',
  '自动扫描人类 MAPK / 先天免疫 / 细胞增殖核心通路靶点，并结合自定义的 1 至 N 个宿主细胞系差异表达数据输出最终候选 tsRNA 排名。': 'to scan core human MAPK, innate-immunity and cell-proliferation targets and rank candidates using the custom 1 to N host-cell differential-expression tables.',
  '人类 MAPK / 先天免疫 / 细胞增殖核心靶点库': 'human MAPK / innate-immunity / cell-proliferation target library',
  '（Human MAPK / 免疫 / 增殖核心靶点库）': '(Human MAPK / innate-immunity / cell-proliferation target library)',
  '下调抑制 + 上调促进': 'downregulation + upregulation',
  '精确匹配': 'Exact match',
  '局部比对': 'Local alignment'
  ,'匹配方式': 'Alignment mode',
  '最短比对 nt': 'Minimum alignment length (nt)',
  '。': '.',
  '删除': 'Delete',
  '确认': 'Confirm',
  '当前未同时提供': 'Not both provided',
  '导出文件前缀：': 'Export prefix: '
  , '找不到指定文件': 'File not found.'
  , '未知文件类型': 'Unknown file type.'
  , '请求失败': 'Request failed.'
  , '运行失败': 'Run failed.'
  , '请先完成 tRNA 基因定位': 'Complete the tRNA annotation first.'
  , '请先完成同一菌株的 OMV tsRNA 筛选': 'Complete OMV tsRNA screening for the same strain first.'
  , '请先选择查询 FASTA 或 tsRNA 筛选结果': 'Select a query FASTA or tsRNA screening result first.'
  , '请先选择参考数据库 FASTA': 'Select a reference FASTA database first.'
  , '请至少选择 1 份宿主细胞差异表达表': 'Select at least one host-cell differential-expression table.'
  , '请先填写该宿主细胞系的名称': 'Enter the host-cell line name first.'
  , '请先在“对应菌株”下拉框选择该转录组对应的细菌菌株': 'Select the bacterial strain for this transcriptome in the Strain menu first.'
  , '需要至少 2 株不同细菌的 tRNA 定位结果才能执行多菌株对比': 'At least two different bacterial tRNA annotations are required for strain comparison.'
  , 'OMV small RNA 文件与 tRNA 预测必须属于同一菌株': 'The OMV small RNA file and tRNA annotation must belong to the same strain.'
  , 'tsRNA 长度范围无效': 'The tsRNA length range is invalid.'
  , '所选宿主细胞差异表达表必须对应同一细菌菌株': 'Selected host-cell differential-expression tables must belong to the same bacterial strain.'
  , '此 OMV 文件的预处理状态未经确认；不能进入候选证据整合': 'This OMV file has unverified preprocessing and cannot enter candidate integration.'
  , '找不到细胞转录组比较结果': 'The host transcriptome comparison result was not found.'
  , 'OMV tsRNA 与细胞转录组必须对应同一菌株': 'The OMV tsRNA result and host transcriptome comparison must belong to the same strain.'
  , '运行中断：': 'Run interrupted: '
  , '失败 · ': 'Failed · '
  , '（6秒后自动收起）': ' (auto-hides in 6 seconds)'
  , '完成用时': 'completed in'
  , '已用时': 'elapsed'
  , '正在启动分析任务…': 'Starting analysis…'
  , '分析完成': 'Analysis complete'
  , '计算已完成并生成结果': 'Computation complete; results generated'
  , '已完成：': 'Completed: '
  , '至少保留 1 个宿主细胞系槽位': 'Keep at least one host-cell slot.'
  , '至少保留 1 个对比细胞系槽位': 'Keep at least one comparison cell-line slot.'
};
const TRANSLATION_PAIRS = Object.entries(ENGLISH_TRANSLATIONS).sort((a, b) => b[0].length - a[0].length);

function translateString(value) {
  if (currentLanguage === 'zh' || value == null) return String(value ?? '');
  let text = String(value);
  for (const [zh, en] of TRANSLATION_PAIRS) text = text.split(zh).join(en);
  text = text
    .replace(/宿主细胞系\s*#(\d+)\s*名称：/g, 'Host cell line #$1 name:')
    .replace(/宿主细胞系\s*#(\d+)\s*差异表/g, 'Host cell line #$1 differential table')
    .replace(/导入\s+([^：]+)\s+差异表/g, 'Import $1 differential table')
    .replace(/细胞系\s+#(\d+)/g, 'Cell line #$1')
    .replace(/（支持自由添加细胞个数与自定义命名）/g, '(add and name cell lines freely)')
    .replace(/（支持自由添加细胞个数与自定义名称）/g, '(add and name cell lines freely)')
    .replace(/（支持任意宿主细胞系数量与自定义名称）/g, '(any number of named host cell lines)');
  text = text
    .replace(/([A-Za-z][A-Za-z &]+)使用说明/g, '$1 · User Guide')
    .replace(/([A-Za-z][A-Za-z &]+)User Guide/g, '$1 · User Guide');
  text = text.replace(/(\d+)核加速/g, '$1-core acceleration');
  return text;
}

function localizeMessage(value, fallback = 'Operation failed. Check the selected inputs.') {
  const text = translateString(value == null ? '' : String(value));
  if (!isEnglish() || !/[\u3400-\u9fff]/.test(text)) return text;
  if (/找不到|不存在|未找到/.test(String(value))) return 'The requested file or record was not found.';
  if (/删除|清空/.test(String(value))) return 'The requested record could not be removed.';
  return fallback;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === 'en' ? 'en' : 'zh-CN';
  document.title = currentLanguage === 'en'
    ? 'Sequence Evidence Workbench | Microbial OMV tsRNA & Host Transcriptome'
    : '序证工作台｜Microbial OMV tsRNA & Host Transcriptome Workbench';
  const root = document.body;
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.parentElement || ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) return;
      if (node.parentElement.id === 'language-toggle') return;
      if (node.__zhText == null) node.__zhText = node.nodeValue;
      node.nodeValue = currentLanguage === 'en' ? translateString(node.__zhText) : node.__zhText;
    });
    root.querySelectorAll('input, textarea, select, button, a, img, nav, [aria-label]').forEach(el => {
      for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
        if (!el.hasAttribute(attr)) continue;
        const key = `zh${attr.replace(/[^a-z0-9]/gi, '').replace(/^./, c => c.toUpperCase())}`;
        if (el.dataset[key] == null) el.dataset[key] = el.getAttribute(attr);
        el.setAttribute(attr, currentLanguage === 'en' ? translateString(el.dataset[key]) : el.dataset[key]);
      }
    });
  }
  const toggle = $('language-toggle');
  if (toggle) {
    toggle.textContent = currentLanguage === 'en' ? '中' : 'EN';
    toggle.setAttribute('aria-label', currentLanguage === 'en' ? 'Switch to Chinese' : '切换到 English');
    toggle.title = currentLanguage === 'en' ? 'Switch to Chinese' : '切换到 English';
  }
}

function toggleLanguage() {
  currentLanguage = currentLanguage === 'en' ? 'zh' : 'en';
  localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  renderState();
  for (const [target, payload] of renderedAnalyses) {
    if ($(target)) renderAnalysis(payload, target);
  }
  showView(currentView);
  applyLanguage();
}

const renderedAnalyses = new Map();

const labels = {
  assembly: '基因组组装',
  reference: '参考序列库',
  reads: 'OMV small RNA',
  trna: 'tRNA 基因定位',
  strains: '多菌株保守性对比',
  tsrna: 'OMV tsRNA 筛选',
  match: '序列匹配',
  de: '差异表达表',
  cells: '细胞转录组比较',
  targets: '靶基因预测',
  priority: '候选 tsRNA 整合'
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmt = n => Number(n ?? 0).toLocaleString('zh-CN');

function formatDateTime(isoStr, fallbackDisplay = '') {
  if (fallbackDisplay && fallbackDisplay.length >= 16) return fallbackDisplay;
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr).slice(0, 19).replace('T', ' ');
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STEP_PREFIX_MAP = {
  trna: '步骤1_tRNA扫描',
  strains: '步骤1_多菌株保守性对比',
  tsrna: '步骤2_OMV_tsRNA筛选',
  cells: '步骤3A_宿主细胞转录组比较',
  priority: '步骤3B_候选tsRNA整合',
  match: '序列比对检索'
};

function ensureDownloadNames(kind, name, isoStr, existing = null) {
  if (!isEnglish() && existing && existing.report && existing.report.endsWith('.docx')) return existing;
  const stepLabel = isEnglish()
    ? ({ trna: 'stage1_trna_scan', strains: 'stage1_strain_conservation', tsrna: 'stage2_omv_tsrna_screening', cells: 'stage3a_host_transcriptome', priority: 'stage3b_candidate_tsrna', match: 'sequence_alignment' }[kind] || kind || 'analysis')
    : (STEP_PREFIX_MAP[kind] || kind || '分析');
  const cleanName = String(name || '未命名')
    .replace(/\s*·\s*(tRNA 基因|多菌株 tRNA 保守性对比|候选证据整合|OMV 序列清单|BLAST\+|精确匹配)/g, '')
    .replace(/\.(fa|fasta|fna|fastq|fq|csv|tsv|out|txt|gz)+$/gi, '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s*([·↔/|,，、])\s*/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[\u3400-\u9fff]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || '分析结果';
  const d = isoStr ? new Date(isoStr) : new Date();
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  const pad = n => String(n).padStart(2, '0');
  const fileTag = `${valid.getFullYear()}${pad(valid.getMonth() + 1)}${pad(valid.getDate())}_${pad(valid.getHours())}${pad(valid.getMinutes())}${pad(valid.getSeconds())}`;
  const base = `${stepLabel}-${cleanName || (isEnglish() ? 'analysis' : '分析结果')}-${fileTag}`;
  return {
    base,
    csv: `${base}.csv`,
    svg: `${base}.svg`,
    svg2: `${base}-${isEnglish() ? 'secondary-figure' : '专题图'}.svg`,
    report: `${base}.docx`
  };
}

function exportUrl(id, kind) {
  return `/api/analyses/${encodeURIComponent(id)}/${kind}?lang=${currentLanguage}`;
}

const pageHelp = {
  overview: {
    intro: '概览页展示从细菌基因组 tRNA 扫描到 OMV small RNA 筛选、多宿主细胞系转录组整合的全流程进度，并提供实时流式运行反馈。',
    steps: [
      '查看已导入细菌基因组组装的数量、累计长度与各阶段分析状态。',
      '点击四阶段流水线状态行可直接跳转到对应分析模块。',
      '点击右上角“导入实验数据”开始上传您自己的细菌基因组、OMV 测序与自定义的宿主细胞差异表达表。'
    ],
    limit: '“已就绪”表示已导入对应文件或完成计算，正式发表前仍须核验生物学重复、阴性对照与独立分子实验验证。'
  },
  imports: {
    intro: '在此统一管理任意细菌基因组、OMV small RNA 测序、自由添加与命名的宿主细胞系差异表达表以及靶基因预测文件。',
    steps: [
      '先导入细菌基因组组装 FASTA（.fa / .fasta / .fna）。',
      '导入 OMV small RNA 前先选择对应菌株与预处理状态；支持 FASTQ(.gz)、FASTA 或含 count / log2 计数的 CSV/TSV。',
      '对原始 FASTQ 可直接运行多核 FastQC，或选择常用试剂盒 3′ 接头预设运行多核 Cutadapt，实时观察剪切进度与保留 reads 数。',
      '在“3. 宿主细胞差异表达表导入”区域，可点击“+ 添加宿主细胞系”自由增加任意数量的细胞系槽位，自由命名每个细胞系（支持任意宿主细胞系数量与自定义名称）并上传对应 CSV/TSV。'
    ],
    limit: '未被下游分析引用的已导入文件可点击右侧垃圾桶按钮单条删除；列表均精确记录导入日期与时间（YYYY-MM-DD HH:mm:ss）。'
  },
  trna: {
    intro: '在细菌基因组中运行多核 tRNAscan-SE 2.0 细菌模式定位全部 tRNA 基因（支持 SHA-256 签名高速缓存），并支持多菌株横向保守性对比。',
    steps: [
      '选择已导入的细菌基因组，点击“运行 tRNA 扫描”，在上方实时进度看板观察 Contigs 校验、tRNA 位点定位数与理论 tsRNA 空间生成进度。',
      '当已完成至少 2 株细菌的 tRNA 扫描后，点击下方“运行多菌株保守性对比”，实时识别全部菌株 100% 保守的核心 tRNA/tsRNA 及已知功能性 OMV tsRNA 同源序列。'
    ],
    limit: '基因组 tRNA 定位与多菌株保守性属于基因组学预测，需结合后续 OMV small RNA 测序确认实际囊泡包装丰度。'
  },
  tsrna: {
    intro: '利用高速 k-mer 哈希索引将 OMV small RNA 测序序列精确匹配至同菌株基因组 tRNA 区段及成熟 3′-CCA 末端，进行精细亚型分类与富集度计算。',
    steps: [
      '选择同菌株的 tRNA 定位结果与 OMV small RNA 样本，设置片段长度范围（默认 10–50 nt，覆盖 13 nt 超短 tRF-5X）。',
      '开启“3′-CCA 匹配”可自动识别带转录后 CCA 尾的成熟 3′-tRF / 3′-tiRNA。',
      '运行过程中实时反馈匹配的 tsRNA 记录数与最高丰度基因座；结果同时提供精细亚型、茎环自由能（ΔG）、RPM、OMV/全菌 log2 富集比，以及按 tRNA 位点汇总的丰度表。'
    ],
    limit: '多位点同源匹配不会强行拆分 reads，表内同时标注位点唯一 reads 与总 reads 以便与不同文献统计口径精确对齐。'
  },
  cells: {
    intro: '自由添加、删减或命名 1 至 N 个同菌株处理的宿主细胞系差异表达表，筛选跨细胞系同向（共同下调 / 共同上调）或细胞特异调控基因。',
    steps: [
      '选择所属细菌菌株，在上方配置区点击“+ 添加对比细胞系”自由设定参与比较的细胞系数量（支持 1 个、2 个、3 个或更多细胞系）。',
      '为每一行选择已导入的差异表达表，并可随时自定义该细胞系的显示名称。',
      '设置 FDR 与 |log2FC| 阈值，点击“比较宿主细胞转录组”，实时查看共有基因对齐、同向显著下调/上调基因数及可视化散点图。'
    ],
    limit: '跨细胞系比较用于筛选一致响应的候选靶基因，不等同于原始计数的多因素交互检验。'
  },
  priority: {
    intro: '将 OMV 中检出的高丰度 tsRNA、二级结构稳定性、跨界靶基因预测与自定义的 1 至 N 个宿主细胞系转录组响应整合成最终候选 tsRNA 优先级排行榜。',
    steps: [
      '选择已确认预处理状态的 OMV tsRNA 结果与同菌株宿主细胞转录组比较结果。',
      '选择外部导入的靶基因预测表，或直接选用“内置跨界种子区/反义互补预测引擎”。',
      '根据研究假设选择调控模式（双向综合、经典靶基因下调抑制、或 miRNA 竞争靶基因上调），点击“锁定候选 tsRNA”并实时查看 Top #1 锁定候选序列。'
    ],
    limit: '候选整合用于锁定最具实验验证价值的 Top tsRNA 分子；建立最终因果关系仍需荧光素酶报告基因、Mimic/Inhibitor 转染或突变株验证。'
  },
  match: {
    intro: '使用本地参考 FASTA 数据库执行双链 100% 高速精确匹配或多核 BLAST+ 局部比对。',
    steps: [
      '选择查询 FASTA 或已生成的 OMV tsRNA 筛选结果，并选择本地参考数据库 FASTA。',
      '选择“全长精确匹配”或“BLAST+ 局部比对”，设置最短比对长度后开始检索，实时查看比对进度与命中数量。'
    ],
    limit: '短序列局部命中需结合查询覆盖度、错配位置与生物学背景综合判断。'
  },
  results: {
    intro: '集中浏览、搜索、可视化预览并按统一命名规范导出本机保存的所有分析记录（含精确到秒的分析时间与 Word 报告）。',
    steps: [
      '点击任意分析名称即可在下方查看交互式数据表（支持关键词实时筛选）与发表级 SVG 矢量图预览。',
      '每行右侧“一键导出”栏在一行内紧凑排列 CSV、SVG图与 Word报告三个下载入口；下载文件名自动命名为“跑的哪一步-名称-结果时间”（报告为排版精美的 .docx Word 文档）。'
    ],
    limit: '删除分析记录不会删除已导入的原始测序或基因组文件。'
  }
};

const runtimeHelp = {
  intro: '本软件可在任何安装有 Node.js (≥22) 的 macOS、Linux 或 Windows 电脑上本机独立高速运行，并内置一键启动程序。',
  steps: [
    'macOS 用户可直接双击文件夹中的“序证工作台.app”（带专属双链 Logo 图标）或“双击打开序证工作台.command”；Windows 用户可直接双击“双击打开序证工作台_Windows.bat”，首次运行会自动安装依赖并打开浏览器。',
    '所有计算步骤均内置多核并行加速、k-mer 哈希索引与 SHA-256 结果缓存，并在页面上方提供实时流式进度条与阶段性发现反馈。',
    '支持自由添加任意数量的宿主细胞系并自定义细胞名称；所有导出的 CSV、SVG 与 Word (.docx) 分析报告均统一命名为“跑的哪一步-名称-结果时间”。',
    '完整使用说明与 GitHub 上传教程已生成为 Word 文档：《用户程序下载安装配置与使用说明书（中英双语版）.docx》。'
  ],
  limit: '所有实验数据均保存在本地 data/ 目录，.gitignore 已自动排除私有数据，确保安全合规。'
};

const ENGLISH_HELP = {
  overview: {
    intro: 'The overview tracks the evidence workflow from bacterial genome tRNA annotation through OMV small RNA screening and host-cell transcriptome integration.',
    steps: ['Review imported assemblies, cumulative sequence length and completed analysis stages.', 'Select a pipeline stage to open its workbench.', 'Use Import experimental data to load genome, OMV and host-cell differential-expression files.'],
    limit: 'Ready means that the required file or computation is present. Confirm biological replicates, controls and independent validation before publication.'
  },
  imports: {
    intro: 'Manage bacterial genome assemblies, OMV small RNA data, host-cell differential-expression tables and optional target-prediction files in one place.',
    steps: ['Import a bacterial genome assembly in FASTA format.', 'Choose the OMV source strain and processing status before importing OMV data.', 'Add any number of named host cell lines and upload their CSV/TSV differential-expression tables.'],
    limit: 'Imported files that are not referenced by downstream analyses can be deleted individually. Import timestamps are recorded to the second.'
  },
  trna: {
    intro: 'Run multi-core tRNAscan-SE in bacterial mode to annotate tRNA genes and compare conservation across strains.',
    steps: ['Select an imported assembly and run the tRNA scan.', 'Review live progress, annotated loci and the theoretical tsRNA candidate space.', 'After at least two strains are scanned, run the multi-strain conservation comparison.'],
    limit: 'Genome tRNA annotation and conservation are computational predictions and require OMV small RNA evidence for biological interpretation.'
  },
  tsrna: {
    intro: 'Match OMV small RNA sequences to strain-specific tRNA loci and mature 3′-CCA ends, then classify subtypes and calculate enrichment.',
    steps: ['Select the matching tRNA annotation and OMV sample, then set the fragment-length range.', 'Enable 3′-CCA matching when mature 3′ fragments should be included.', 'Review subtype, RPM, enrichment, free energy and locus-level abundance summaries.'],
    limit: 'Multi-locus matches retain both unique-read and total-read counts so results can be aligned with different reporting conventions.'
  },
  cells: {
    intro: 'Compare one or more named host-cell differential-expression tables from the same bacterial strain.',
    steps: ['Add the required number of cell-line slots and select an imported table for each slot.', 'Edit the display name for each cell line when needed.', 'Set FDR and absolute log2FC thresholds, then run the comparison.'],
    limit: 'Cross-cell-line comparison identifies consistent responses; it is not a substitute for a multi-factor model on raw counts.'
  },
  priority: {
    intro: 'Integrate OMV abundance, structural stability, cross-kingdom target predictions and host responses into a ranked tsRNA candidate list.',
    steps: ['Select an OMV tsRNA result and the matching host-cell comparison.', 'Choose an imported target table or the built-in cross-kingdom predictor.', 'Select the regulatory mode and rank candidates for experimental follow-up.'],
    limit: 'Candidate ranking prioritizes molecules for validation. Causal claims require independent molecular experiments.'
  },
  match: {
    intro: 'Search a local FASTA reference database with full-length exact matching or multi-core BLAST+ local alignment.',
    steps: ['Select a query and a local reference database.', 'Choose exact or BLAST+ mode and set the minimum alignment length.', 'Review coverage, identity, strand and alignment coordinates.'],
    limit: 'Interpret short local hits together with coverage, mismatch position and biological context.'
  },
  results: {
    intro: 'Browse, filter, preview and export all locally stored analysis records using consistent timestamps and file names.',
    steps: ['Select an analysis name to open its table and publication-ready SVG figures.', 'Use the export links for CSV, SVG and Word reports.', 'Delete records from the table when they are no longer needed.'],
    limit: 'Deleting an analysis record does not remove the imported source files.'
  },
  runtime: {
    intro: 'The release runs locally on macOS, Linux or Windows with Node.js 22 or later.',
    steps: ['Install dependencies and launch the provided macOS, Windows or shell starter.', 'Use the workbench to import data, run analyses and export CSV, SVG or Word reports.', 'Keep private data in the local data directory and exclude it from public GitHub commits.'],
    limit: 'All imported data and analysis records remain on the local machine unless you explicitly publish them.'
  }
};

let currentView = 'overview';
let liveTimer = null;
let liveHideTimer = null;
let liveFadeTimer = null;
let alertHideTimer = null;
let alertFadeTimer = null;

// Dynamic state for GitHub edition customizable Host Cell Line slots
let importCellSlots = [
  { id: 'slot_1', name: '细胞系 1' }
];
let compareCellSlots = [
  { uploadId: '', label: '细胞系 1' }
];

function renderImportCellSlots() {
  if ($('import-cell-count')) $('import-cell-count').value = String(importCellSlots.length);
  const container = $('import-cell-slots');
  if (!container) return;
  container.innerHTML = importCellSlots.map((slot, idx) => `
    <div class="cell-slot-row" data-slot-index="${idx}">
      <label>${t(`宿主细胞系 #${idx + 1} 名称：`, `Host cell line #${idx + 1} name:`)}<input type="text" class="slot-cell-name" data-slot-index="${idx}" value="${esc(displayCellName(slot.name, idx))}" placeholder="${t('输入自定义细胞系名称（自定义细胞名称，如 细胞系 1 / 巨噬细胞 / 上皮细胞）', 'Enter a custom host cell line name (e.g. macrophage or epithelial cell)')}"></label>
      <label class="cell-slot-upload-btn" style="flex:0 0 auto">
        <span>${t('导入', 'Import')} ${esc(displayCellName(slot.name, idx))} ${t('差异表', 'differential table')} (CSV/TSV)</span>
        <input type="file" class="slot-cell-file" data-slot-index="${idx}" accept=".csv,.tsv,.txt">
      </label>
      ${importCellSlots.length > 1 ? `<button type="button" class="remove-cell-slot danger secondary" data-slot-index="${idx}">${t('移除', 'Remove')}</button>` : ''}
    </div>
  `).join('');
  applyLanguage();
}

function renderCompareCellSlots() {
  if ($('compare-cell-count')) $('compare-cell-count').value = String(compareCellSlots.length);
  const container = $('compare-cell-slots');
  if (!container) return;
  const strainId = $('cells-strain')?.value;
  const strainDe = state.uploads.filter(row => row.kind === 'de' && (!strainId || row.summary.strainId === strainId));

  if (strainDe.length > compareCellSlots.length && compareCellSlots.length === 1 && !compareCellSlots[0].uploadId) {
    while (compareCellSlots.length < strainDe.length) {
      compareCellSlots.push({ uploadId: '', label: `细胞系 ${compareCellSlots.length + 1}` });
    }
  }
  if ($('compare-cell-count')) $('compare-cell-count').value = String(compareCellSlots.length);
  // Auto-populate defaults if empty and matching uploads exist
  compareCellSlots.forEach((slot, idx) => {
    if (!slot.uploadId || !strainDe.some(u => u.id === slot.uploadId)) {
      const candidate = strainDe[idx] || strainDe[0] || null;
      slot.uploadId = candidate ? candidate.id : '';
      slot.label = candidate ? (candidate.summary.cellLine || candidate.name) : `细胞系 ${idx + 1}`;
    }
  });

  container.innerHTML = compareCellSlots.map((slot, idx) => `
    <div class="cell-slot-row" data-compare-index="${idx}">
      <label>${t(`选择细胞系 #${idx + 1} 差异表：`, `Select cell line #${idx + 1} differential table:`)}
        <select class="compare-cell-select" data-compare-index="${idx}">
          <option value="">${t('请选择已导入的差异表达表…', 'Select an imported differential-expression table…')}</option>
          ${strainDe.map(u => `<option value="${esc(u.id)}" ${u.id === slot.uploadId ? 'selected' : ''}>${esc(u.summary.cellLine)} · ${esc(u.name)} (${fmt(u.summary.genes)} ${t('基因', 'genes')})</option>`).join('')}
        </select>
      </label>
      <label style="flex:0 1 240px">${t('自定义显示名称：', 'Custom display name:')}
        <input type="text" class="compare-cell-label" data-compare-index="${idx}" value="${esc(displayCellName(slot.label, idx))}" placeholder="${t('输入自定义细胞系名称', 'Enter a custom cell line name')}">
      </label>
      ${compareCellSlots.length > 1 ? `<button type="button" class="remove-compare-slot danger secondary" data-compare-index="${idx}">${t('移除', 'Remove')}</button>` : ''}
    </div>
  `).join('');
  applyLanguage();
}

function scheduleAutoDismiss(el, type) {
  if (!el) return;
  if (type === 'live') {
    if (liveHideTimer) clearTimeout(liveHideTimer);
    if (liveFadeTimer) clearTimeout(liveFadeTimer);
    liveHideTimer = setTimeout(() => {
      el.classList.add('is-hiding');
      liveFadeTimer = setTimeout(() => {
        el.hidden = true;
        el.classList.remove('is-hiding', 'done', 'error', 'is-entering');
      }, 420);
    }, 6000);
  } else {
    if (alertHideTimer) clearTimeout(alertHideTimer);
    if (alertFadeTimer) clearTimeout(alertFadeTimer);
    alertHideTimer = setTimeout(() => {
      el.classList.add('is-hiding');
      alertFadeTimer = setTimeout(() => {
        el.hidden = true;
        el.classList.remove('is-hiding', 'is-entering');
      }, 420);
    }, 6000);
  }
}

function startLiveProgress(initialTitle) {
  const box = $('live-progress');
  if (!box) return;
  if (liveHideTimer) { clearTimeout(liveHideTimer); liveHideTimer = null; }
  if (liveFadeTimer) { clearTimeout(liveFadeTimer); liveFadeTimer = null; }
  box.hidden = false;
  box.className = 'live-progress is-entering';
  $('live-stage-text').textContent = localizeMessage(initialTitle || '正在启动分析任务…', 'Starting analysis…');
  $('live-bar-fill').style.width = '6%';
  $('live-log-list').innerHTML = '';
  const startMs = performance.now();
  let currentPercent = 6;
  const updateTimer = () => {
    const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);
    $('live-meta-text').textContent = isEnglish() ? `${currentPercent}% · elapsed ${elapsed}s` : `${currentPercent}% · 已用时 ${elapsed}s`;
  };
  updateTimer();
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(updateTimer, 100);
  return {
    update(ev) {
      currentPercent = Math.max(currentPercent, Number(ev.percent) || currentPercent);
      const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);
      const stage = localizeMessage(ev.stage || '', 'Analysis step');
      const message = localizeMessage(ev.message || '', 'Processing…');
      $('live-stage-text').textContent = `${stage}: ${message}`;
      $('live-meta-text').textContent = isEnglish() ? `${currentPercent}% · elapsed ${elapsed}s` : `${currentPercent}% · 已用时 ${elapsed}s`;
      $('live-bar-fill').style.width = `${Math.min(100, currentPercent)}%`;
      const li = document.createElement('li');
      li.className = 'live-log-item';
      li.innerHTML = `<span class="live-log-time">[${esc(ev.time || new Date().toTimeString().slice(0, 8))}]</span><span class="live-log-stage">${esc(stage)}</span><span>${esc(message)}</span>`;
      const list = $('live-log-list');
      list.appendChild(li);
      list.scrollTop = list.scrollHeight;
    },
    done(finalMsg) {
      if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
      currentPercent = 100;
      const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);
      box.className = 'live-progress done';
      $('live-bar-fill').style.width = '100%';
      if (finalMsg) $('live-stage-text').textContent = localizeMessage(finalMsg, 'Analysis complete.');
      $('live-meta-text').textContent = isEnglish() ? `100% · completed in ${elapsed}s (auto-hides in 6 seconds)` : `100% · 完成用时 ${elapsed}s（6秒后自动收起）`;
      scheduleAutoDismiss(box, 'live');
    },
    fail(errMsg) {
      if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
      const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);
      box.className = 'live-progress error';
      $('live-stage-text').textContent = `${isEnglish() ? 'Run interrupted: ' : '运行中断：'}${localizeMessage(errMsg)}`;
      $('live-meta-text').textContent = isEnglish() ? `Failed · ${elapsed}s (auto-hides in 6 seconds)` : `失败 · ${elapsed}s（6秒后自动收起）`;
      scheduleAutoDismiss(box, 'live');
    }
  };
}

async function request(path, options = {}, progressTitle = '') {
  if (options.method === 'POST' && progressTitle) {
    const tracker = startLiveProgress(progressTitle);
    try {
      const headers = { ...(options.headers || {}), 'X-Stream-Progress': '1' };
      const response = await fetch(path, { ...options, headers });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('ndjson')) {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(localizeMessage(payload.error || '请求失败'));
        tracker.update({ percent: 100, stage: '分析完成', message: payload.name ? `已完成：${payload.name}` : '计算已完成并生成结果' });
        tracker.done(payload.name ? `已完成：${payload.name}` : '计算已完成');
        return payload;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;
      const handleLine = line => {
        if (!line.trim()) return;
        const msg = JSON.parse(line);
        if (msg.type === 'progress') {
          tracker.update(msg);
        } else if (msg.type === 'error') {
          throw new Error(localizeMessage(msg.error || '运行失败'));
        } else if (msg.type === 'result') {
          finalResult = msg.data;
        } else if (msg && !msg.type) {
          finalResult = msg;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim()) handleLine(buffer.trim());
      tracker.done();
      return finalResult;
    } catch (err) {
      tracker.fail(err.message);
      throw err;
    }
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '请求失败');
  return payload;
}

function notify(message, success = false) {
  const el = $('alert');
  if (!el) return;
  if (alertHideTimer) { clearTimeout(alertHideTimer); alertHideTimer = null; }
  if (alertFadeTimer) { clearTimeout(alertFadeTimer); alertFadeTimer = null; }
  el.hidden = false;
  el.className = 'alert';
  void el.offsetWidth; // trigger reflow for smooth re-entry animation
  el.className = `alert${success ? ' success' : ''} is-entering`;
  el.textContent = localizeMessage(message);
  scheduleAutoDismiss(el, 'alert');
}

function showView(id) {
  if ($('help-dialog').open) $('help-dialog').close();
  currentView = id;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === id));
  document.querySelectorAll('.nav').forEach(el => el.classList.toggle('active', el.dataset.view === id));
  const names = isEnglish() ? {
    overview: ['Workbench Overview', 'Bacterial genome tRNA scanning · OMV small RNA enrichment · Multi-host transcriptome integration'],
    imports: ['Data Import & QC', 'Manage bacterial genomes, OMV sequencing files, host-cell tables and FASTQ adapter trimming'],
    trna: ['Genome tRNA Scanning', 'Multi-core bacterial genome tRNA mapping and strain conservation comparison'],
    tsrna: ['OMV tsRNA Screening', 'Fast k-mer matching, 3′-CCA recognition, subtype classification and enrichment'],
    cells: ['Host Cell Transcriptomics', 'Add, remove and name 1 to N host cell lines for transcriptome comparison'],
    priority: ['Candidate tsRNA Integration', 'Cross-kingdom target prediction and multi-host transcriptome evidence integration'],
    match: ['Sequence Alignment', 'Full-length exact matching and local multi-core BLAST+ (blastn-short) search'],
    results: ['Results & Export', 'Interactive tables · SVG previews · CSV and Word (.docx) export by stage, name and time']
  } : {
    overview: ['工作台概览', '细菌基因组 tRNA 扫描 · OMV small RNA 富集筛选 · 多宿主细胞系转录组与候选 tsRNA 锁定'],
    imports: ['数据导入与质控', '管理细菌基因组、OMV 测序文件、自由命名与添加宿主细胞转录组及 FASTQ 接头剪切'],
    trna: ['基因组 tRNA 扫描', '细菌基因组 tRNA 多核定位与多菌株保守性横向对比'],
    tsrna: ['OMV tsRNA 筛选', '高速 k-mer 精确比对、3′-CCA 识别、亚型分类与富集度计算'],
    cells: ['宿主细胞转录组', '自由添加/删减细胞系个数（1 至 N 个细胞系）并自定义名称进行转录组比较'],
    priority: ['候选 tsRNA 整合', '跨界靶基因预测与多宿主细胞转录组响应的证据链整合'],
    match: ['序列比对工具', '双链全长精确匹配与本地多核 BLAST+ (blastn-short) 检索'],
    results: ['结果与图表导出', '交互式表格筛选 · SVG 矢量图预览 · 按步骤-名称-时间导出 CSV 与 Word (.docx) 报告']
  };
  $('page-title').textContent = names[id][0];
  $('page-subtitle').textContent = names[id][1];
  Object.keys($('page-help').dataset).filter(key => key.toLowerCase().startsWith('zh')).forEach(key => delete $('page-help').dataset[key]);
  $('page-help').setAttribute('aria-label', `${names[id][0]}使用说明`);
  $('page-help').title = `${names[id][0]}使用说明`;
  history.replaceState(null, '', `#${id}`);
  applyLanguage();
}

function openHelp(help, title) {
  const helpKey = help === runtimeHelp ? 'runtime' : Object.keys(pageHelp).find(key => pageHelp[key] === help);
  const localizedHelp = currentLanguage === 'en' && helpKey && ENGLISH_HELP[helpKey] ? ENGLISH_HELP[helpKey] : help;
  $('help-title').textContent = currentLanguage === 'en' ? translateString(title) : title;
  $('help-intro').textContent = localizedHelp.intro;
  $('help-steps').replaceChildren(...localizedHelp.steps.map(step => {
    const item = document.createElement('li');
    item.textContent = currentLanguage === 'en' ? step : translateString(step);
    return item;
  }));
  $('help-limit').textContent = currentLanguage === 'en' ? localizedHelp.limit : translateString(localizedHelp.limit);
  $('help-dialog').showModal();
}

function openPageHelp() {
  openHelp(pageHelp[currentView], `${$('page-title').textContent} · 使用说明`);
}

function options(selectId, rows, placeholder = '请选择') {
  const select = $(selectId);
  if (!select) return;
  const old = select.value;
  select.innerHTML = `<option value="">${esc(placeholder)}</option>` + rows.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  if (rows.some(r => r.id === old)) select.value = old;
  else if (rows.length === 1 && placeholder === '请选择') select.value = rows[0].id;
}

function updateCellOptions() {
  renderCompareCellSlots();
}

function updateReadOptions() {
  const trna = state.analyses.find(row => row.id === $('tsrna-trna').value);
  options('tsrna-reads', state.uploads.filter(row => row.kind === 'reads' && row.summary.strainId === trna?.meta.assemblyId));
}

function updatePriorityOptions() {
  const tsrna = state.analyses.find(row => row.id === $('priority-tsrna').value);
  options('priority-cells', state.analyses.filter(row => row.kind === 'cells' && row.meta.strainId === tsrna?.meta.assemblyId), '暂不关联细胞结果');
}

function renderState() {
  $('dataset-count').textContent = t(`${state.uploads.length} 个文件 · ${state.analyses.length} 项分析记录`, `${state.uploads.length} files · ${state.analyses.length} analysis records`);
  const assemblies = state.uploads.filter(row => row.kind === 'assembly');
  const strainsAnalyses = state.analyses.filter(row => row.kind === 'strains');
  $('assembly-summary').innerHTML = assemblies.length
    ? `<span>${t('已登记', 'Registered')} <strong>${assemblies.length}</strong> ${t('份细菌基因组组装', 'bacterial genome assemblies')} (${assemblies.map(a => esc(a.name)).join(', ')})</span><span class="summary-separator">|</span><strong>${fmt(assemblies.reduce((sum, row) => sum + row.summary.totalBp, 0))} bp</strong><span>${t('累计组装长度', 'total assembly length')}</span>`
    : `<span>${t('尚未导入细菌基因组组装，请点击右上角“导入实验数据”开始分析。', 'No bacterial genome assembly has been imported. Select “Import experimental data” to begin.')}</span>`;

  const trnaCount = state.analyses.filter(row => row.kind === 'trna').length;
  const readsCount = state.uploads.filter(row => row.kind === 'reads').length;
  const checkedReads = state.uploads.filter(row => row.kind === 'reads' && row.summary.processingStatus === 'processed').length;
  const deUploads = state.uploads.filter(row => row.kind === 'de');
  const deCount = deUploads.length;
  const distinctCells = [...new Set(deUploads.map(u => u.summary.cellLine).filter(Boolean))];
  const tsrnaCount = state.analyses.filter(row => row.kind === 'tsrna').length;
  const priorityCount = state.analyses.filter(row => row.kind === 'priority').length;

  const stages = isEnglish() ? [
    ['Stage 1 · Genome and tRNA prediction', assemblies.length && trnaCount ? `${assemblies.length} assemblies imported; ${trnaCount} tRNA scans completed${strainsAnalyses.length ? ` and ${strainsAnalyses.length} strain comparisons` : ''}` : `${assemblies.length} assemblies; select to run tRNAscan-SE`, Boolean(trnaCount), 'trna'],
    ['Stage 2 · OMV small RNA screening', readsCount ? `${readsCount} OMV sequencing/count files imported; ${tsrnaCount} tsRNA screens completed` : 'Awaiting OMV small RNA sequencing data (FASTQ/FASTA/CSV)', Boolean(checkedReads || tsrnaCount), 'tsrna'],
    ['Stage 3A · Host transcriptome comparison', deCount ? `${deCount} host-cell differential-expression tables imported (${distinctCells.join(' / ')})` : 'Awaiting treated host-cell differential-expression tables', Boolean(deCount), 'cells'],
    ['Stage 3B · Candidate tsRNA evidence integration', priorityCount ? `${priorityCount} candidate tsRNA ranking reports generated` : 'Rank candidates using OMV enrichment, structure, target prediction and host response', Boolean(priorityCount), 'priority']
  ] : [
    ['步骤 1 · 基因组与 tRNA 预测', assemblies.length && trnaCount ? `已导入 ${assemblies.length} 份组装；已完成 ${trnaCount} 次 tRNA 定位${strainsAnalyses.length ? ` 与 ${strainsAnalyses.length} 次多菌株保守性对比` : ''}` : `${assemblies.length} 份组装；点击进入运行 tRNAscan-SE`, Boolean(trnaCount), 'trna'],
    ['步骤 2 · OMV small RNA 筛选', readsCount ? `已导入 ${readsCount} 份 OMV 测序/计数文件；已完成 ${tsrnaCount} 次 tsRNA 亚型与富集筛选` : '待导入 OMV small RNA 测序数据（支持 FASTQ/FASTA/CSV）', Boolean(checkedReads || tsrnaCount), 'tsrna'],
    ['步骤 3A · 宿主细胞转录组比较', deCount ? `已导入 ${deCount} 份宿主细胞差异表达表（${distinctCells.join(' / ')}）` : '待导入转染后宿主细胞差异表达表（支持自由添加细胞个数与自定义命名）', Boolean(deCount), 'cells'],
    ['步骤 3B · 候选 tsRNA 证据链整合', priorityCount ? `已生成 ${priorityCount} 份跨界调控候选 tsRNA 优先级榜单` : '结合 OMV 富集度、二级结构、跨界靶基因预测与宿主响应锁定候选 tsRNA', Boolean(priorityCount), 'priority']
  ];
  $('evidence-status').innerHTML = stages
    .map(([title, detail, ready, view]) => `<div class="evidence-row clickable-row" data-goto="${view}" role="button" tabindex="0"><span class="evidence-indicator ${ready ? 'available' : 'missing'}">${ready ? t('已就绪', 'Ready') : t('待执行', 'Pending')}</span><strong>${esc(title)}</strong><span>${esc(detail)} →</span></div>`)
    .join('');

  $('tool-status').textContent = `tRNAscan-SE ${state.tools.trnascan ? t('就绪', 'Ready') : t('缺失', 'Missing')} · Cutadapt ${state.tools.cutadapt ? t('就绪', 'Ready') : t('缺失', 'Missing')} · FastQC ${state.tools.fastqc ? t('就绪', 'Ready') : t('缺失', 'Missing')} · BLAST+ ${state.tools.blastn ? t('就绪', 'Ready') : t('缺失', 'Missing')}`;

  $('uploads-table').innerHTML = state.uploads.length
    ? state.uploads.map(row => {
        const s = row.summary;
        const desc = row.kind === 'assembly'
          ? `${fmt(s.totalBp)} bp · ${fmt(s.contigs)} contigs · N50 ${fmt(s.n50)} bp · GC ${s.gcPercent}%`
          : row.kind === 'reads'
            ? `${s.strain || '未关联菌株'} · ${fmt(s.totalReads)} reads · ${fmt(s.uniqueSequences)} 种序列 · ${s.hasWholeCell ? '含全菌对照富集比 · ' : ''}${s.processingStatus === 'processed' ? '已确认预处理' : '预处理未核实'}`
            : row.kind === 'reference'
              ? `${fmt(s.sequences)} 条参考序列 (${fmt(s.totalBp)} bp)`
              : row.kind === 'de'
                ? `${s.cellLine} · ${s.strain || '未指定菌株'} · ${fmt(s.genes)} 基因`
                : row.kind === 'targets'
                  ? `${fmt(s.predictions)} 条靶点预测 · ${s.methods.join(', ')}`
                  : '待解析';
        return `<tr><td><span class="filename">${esc(row.name)}</span><small>${esc(row.id.slice(0, 8))}</small></td><td><span class="tag">${esc(labels[row.kind] || row.kind)}</span></td><td>${esc(desc)}</td><td class="time-cell">${esc(formatDateTime(row.created_at, row.display_time))}</td><td><button class="delete-upload danger secondary" type="button" data-id="${row.id}" data-name="${esc(row.name)}" title="删除文件"></button></td></tr>`;
      }).join('')
    : `<tr><td class="empty" colspan="5">${t('尚无数据。请选择上方卡片导入实验文件。', 'No data yet. Use the cards above to import experimental files.')}</td></tr>`;

  options('trna-assembly', assemblies);
  options('de-strain', assemblies);
  options('reads-strain', assemblies);
  options('qc-reads', state.uploads.filter(r => r.kind === 'reads' && /\.(fastq|fq)(\.gz)?$/i.test(r.name)));
  options('cells-strain', assemblies);
  options('trna-annotation', state.uploads.filter(r => r.kind === 'trna'), '直接调用本机 tRNAscan-SE (-B 细菌模式)');
  options('tsrna-trna', state.analyses.filter(r => r.kind === 'trna'));
  updateReadOptions();
  options('match-query', [
    ...state.uploads.filter(r => ['assembly', 'reference'].includes(r.kind)),
    ...state.analyses.filter(r => r.kind === 'tsrna').map(r => ({ ...r, name: `[tsRNA] ${r.name}` }))
  ]);
  options('match-reference', state.uploads.filter(r => ['reference', 'assembly'].includes(r.kind)));
  renderImportCellSlots();
  updateCellOptions();
  options('priority-tsrna', state.analyses.filter(row => row.kind === 'tsrna'));
  updatePriorityOptions();

  const targetUploads = state.uploads.filter(row => row.kind === 'targets');
  options(
    'priority-targets',
    [{
      id: '__builtin__',
      name: t(
        '⚡ 内置跨界种子区/反义互补预测引擎（人类 MAPK / 先天免疫 / 细胞增殖核心靶点库）',
        '⚡ Built-in cross-kingdom seed/antisense complement predictor (human MAPK / innate-immunity / cell-proliferation target library)'
      )
    }, ...targetUploads],
    t('暂不关联靶基因预测', 'Do not link target predictions')
  );
  if (!$('priority-targets').value) $('priority-targets').value = '__builtin__';

  $('clear-results').disabled = !state.analyses.length;
  $('results-table').innerHTML = state.analyses.length
    ? state.analyses.map(row => {
        const dl = ensureDownloadNames(row.kind, row.name, row.created_at, row.downloadNames);
        return `<tr><td><button class="result-open secondary" data-id="${row.id}">${esc(row.name)}</button></td><td><span class="tag">${esc(isEnglish() ? ({ trna: 'tRNA gene mapping', strains: 'Strain conservation', tsrna: 'OMV tsRNA screening', match: 'Sequence alignment', cells: 'Host transcriptome comparison', priority: 'Candidate tsRNA integration' }[row.kind] || row.kind) : (labels[row.kind] || row.kind))}</span></td><td class="time-cell">${esc(formatDateTime(row.created_at, row.display_time))}</td><td class="export-col"><div class="export-links"><a href="${exportUrl(row.id, 'csv')}" data-export-id="${row.id}" data-export-kind="csv" download="${esc(dl.csv)}" title="${esc(dl.csv)}">${t('导出 CSV', 'Export CSV')}</a><a href="${exportUrl(row.id, 'svg')}" data-export-id="${row.id}" data-export-kind="svg" download="${esc(dl.svg)}" title="${esc(dl.svg)}">${t('导出 SVG', 'Export SVG')}</a><a href="${exportUrl(row.id, 'report')}" data-export-id="${row.id}" data-export-kind="report" download="${esc(dl.report)}" title="${esc(dl.report)}">${t('导出报告', 'Export report')}</a></div></td><td><button class="delete-result danger secondary" type="button" data-id="${row.id}" data-name="${esc(row.name)}" aria-label="${esc(t(`删除分析记录：${row.name}`, `Delete analysis record: ${row.name}`))}" title="${t('删除分析记录', 'Delete analysis record')}"></button></td></tr>`;
      }).join('')
    : `<tr><td class="empty" colspan="5">${t('尚无分析记录', 'No analysis records yet')}</td></tr>`;
  applyLanguage();
}

async function refresh() {
  state = await request('/api/state');
  renderState();
}

function resultTable(rows, columns, containerId) {
  if (!rows.length) return `<div class="caution">${t('没有符合条件的命中。请核对输入、长度阈值和参考数据库。', 'No matching records. Check the inputs, length thresholds and reference database.')}</div>`;
  const filterId = `${containerId}-filter`;
  return `
    <div class="table-toolbar">
      <input id="${filterId}" class="table-search" type="text" placeholder="${t('实时筛选表格内容（输入序列、基因名、tRNA 类型、反密码子或亚型）…', 'Filter table contents (sequence, gene, tRNA type, anticodon or subtype)…')}">
      <span class="section-meta">${t(`共 ${fmt(rows.length)} 条记录（页面展示前 200 条，CSV 导出含全部记录）`, `${fmt(rows.length)} records (first 200 shown; CSV contains all records)`)}</span>
    </div>
    <div class="table-wrap"><table data-filter-input="${filterId}"><thead><tr>${columns.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 200).map(row => `<tr>${columns.map(([key]) => `<td class="${key === 'sequence' || key === 'fivePrime13' || key === 'fivePrime24' ? 'mono-seq' : ''}">${esc(row[key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function bindTableSearch(targetId, allRows, columns) {
  const container = $(targetId);
  if (!container) return;
  const input = container.querySelector('.table-search');
  const tbody = container.querySelector('table[data-filter-input] tbody');
  if (!input || !tbody) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = q
      ? allRows.filter(row => columns.some(([k]) => String(row[k] ?? '').toLowerCase().includes(q)))
      : allRows;
    tbody.innerHTML = filtered.slice(0, 200).map(row => `<tr>${columns.map(([key]) => `<td class="${key === 'sequence' || key === 'fivePrime13' || key === 'fivePrime24' ? 'mono-seq' : ''}">${esc(row[key] ?? '—')}</td>`).join('')}</tr>`).join('');
  });
}

function renderAnalysis(payload, target) {
  const result = payload.result || payload;
  const id = payload.id;
  const kind = payload.kind || (result.hits ? 'trna' : result.strainNames ? 'strains' : result.totalReads !== undefined ? 'tsrna' : result.sharedGeneCount !== undefined ? 'cells' : result.linkedToTranscriptome !== undefined ? 'priority' : 'match');
  const dl = ensureDownloadNames(kind, payload.name || result.source || '分析结果', payload.createdAt || payload.created_at, payload.downloadNames);
  const timeStr = formatDateTime(payload.createdAt || payload.created_at, payload.display_time);
  const rows = result.hits || result.matches || [];
  let columns, metrics = '', extraBlock = '';

  if (kind === 'trna') {
    columns = isEnglish() ? [['contig', 'Contig'], ['number', '#'], ['start', 'Start (1-based)'], ['end', 'End'], ['strand', 'Strand'], ['type', 'Amino-acid type'], ['anticodon', 'Anticodon'], ['score', 'Cove score']] : [['contig', 'Contig'], ['number', '#'], ['start', '起点 (1-based)'], ['end', '终点'], ['strand', '链'], ['type', '氨基酸类型'], ['anticodon', '反密码子'], ['score', 'Cove 分数']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(rows.length)}</strong><span>${t('预测 tRNA 基因位点', 'Predicted tRNA loci')}</span></div><div class="metric"><strong>${fmt(new Set(rows.map(x => `${x.type}-${x.anticodon}`)).size)}</strong><span>${t('反密码子种类', 'Anticodon types')}</span></div><div class="metric"><strong>${fmt(new Set(rows.map(x => x.contig)).size)}</strong><span>${t('涉及 Contigs', 'Contigs covered')}</span></div><div class="metric"><strong>${fmt(result.candidateSpace?.distinctSequences || 0)}</strong><span>${t('理论 tsRNA 序列空间', 'Theoretical tsRNA sequence space')}</span></div></div>`;
  } else if (kind === 'strains') {
    columns = isEnglish() ? [['type', 'tRNA type'], ['anticodon', 'Anticodon'], ['conservation', 'Cross-strain conservation'], ['copySummary', 'Copies by strain'], ['fivePrime13', '5′-tRF-5X (13 nt)'], ['fivePrime24', '5′-tRF-5b (24 nt)'], ['hairpinFreeEnergy', '5′ ΔG (kcal/mol)'], ['knownHomolog', 'Known functional OMV tsRNA homolog']] : [['type', 'tRNA 类型'], ['anticodon', '反密码子'], ['conservation', '跨菌株保守性'], ['copySummary', '各菌株拷贝数'], ['fivePrime13', '5′-tRF-5X (13 nt)'], ['fivePrime24', '5′-tRF-5b (24 nt)'], ['hairpinFreeEnergy', '5′ ΔG (kcal/mol)'], ['knownHomolog', '已知功能性 OMV tsRNA 同源注释']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(result.strainNames?.length || 0)}</strong><span>${t('对比菌株数', 'Strains compared')} (${esc((result.strainNames || []).join(' / '))})</span></div><div class="metric"><strong>${fmt(result.coreConservedTrnaSeqs)}</strong><span>${t('全菌株 100% 保守 tRNA 序列', '100% conserved tRNA sequences')}</span></div><div class="metric"><strong>${fmt(result.strainSpecificTrnaSeqs)}</strong><span>${t('菌株特异 tRNA 序列', 'Strain-specific tRNA sequences')}</span></div><div class="metric"><strong>${fmt(result.conserved24nt5Prime)}</strong><span>${t('保守 24 nt 5′-tRF 候选', 'Conserved 24 nt 5′-tRF candidates')}</span></div></div>`;
  } else if (kind === 'tsrna') {
    columns = isEnglish() ? [['sequence', 'tsRNA sequence'], ['length', 'Length (nt)'], ['subtype', 'Subtype (tRF/tiRNA)'], ['type', 'tRNA type'], ['anticodon', 'Anticodon'], ['readCount', 'OMV reads'], ['rpm', 'RPM'], ['log2Enrichment', 'OMV/whole-cell log2 enrichment'], ['freeEnergy', 'Hairpin ΔG'], ['lociCount', 'Matched loci'], ['trnaStart', 'Locus start']] : [['sequence', 'tsRNA 序列'], ['length', '长度 nt'], ['subtype', '精细亚型 (tRF/tiRNA)'], ['type', 'tRNA 类型'], ['anticodon', '反密码子'], ['readCount', 'OMV reads'], ['rpm', 'RPM'], ['log2Enrichment', 'OMV/全菌 log2 比'], ['freeEnergy', '茎环 ΔG'], ['lociCount', '匹配位点数'], ['trnaStart', '位点起点']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(result.totalReads)}</strong><span>${t('样本总 reads', 'Total sample reads')}</span></div><div class="metric"><strong>${fmt(result.uniqueSequences)}</strong><span>${t('不同 sRNA 序列数', 'Unique sRNA sequences')}</span></div><div class="metric"><strong>${fmt(rows.length)}</strong><span>${t('tRNA 位点匹配记录', 'tRNA locus matches')}</span></div><div class="metric"><strong>${fmt(result.locusSummaries?.length || 0)}</strong><span>${t('检出表达的 tRNA 基因座', 'Expressed tRNA loci')}</span></div></div>`;
    if (result.locusSummaries?.length) {
      extraBlock = `<div class="locus-summary-box"><h4>${t('按 tRNA 基因位点汇总的 OMV 丰度排行（对应发表论文 Table 1 位点汇总口径）', 'OMV abundance by tRNA locus (Table 1-style summary)')}</h4><div class="table-wrap"><table><thead><tr>${(isEnglish() ? ['tRNA locus', 'Amino acid (anticodon)', 'Coordinates (strand)', 'Total OMV reads', 'Unique OMV reads', '5′-end OMV reads', 'Locus OMV/whole-cell log2 enrichment', 'Top sequence'] : ['tRNA 位点', '氨基酸(反密码子)', '坐标 (链)', '位点总 OMV reads', '唯一匹配 OMV reads', '5′ 端 OMV reads', '位点 OMV/全菌 log2 比', '最高丰度代表序列']).map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${result.locusSummaries.slice(0, 12).map(l => `<tr><td>tRNA#${esc(l.trnaNumber)}</td><td><strong>${esc(l.type)}(${esc(l.anticodon)})</strong></td><td>${fmt(l.trnaStart)}–${fmt(l.trnaEnd)} (${esc(l.strand)})</td><td><strong>${fmt(l.totalOmvReads)}</strong></td><td>${fmt(l.uniqueOmvReads)}</td><td>${fmt(l.fivePrimeOmvReads)}</td><td>${esc(l.locusLog2Enrichment ?? '—')}</td><td class="mono-seq">${esc(l.topSequence)} (${fmt(l.topSequenceReads)})</td></tr>`).join('')}</tbody></table></div></div>`;
    }
  } else if (kind === 'cells') {
    const cellLabels = Array.isArray(result.cellLabels) && result.cellLabels.length ? result.cellLabels : [result.cellLineA || '细胞系 1', result.cellLineB || '细胞系 2'];
    if (cellLabels.length > 2) {
      columns = [
        ['gene', t('宿主基因 ID', 'Host gene ID')],
        ...cellLabels.flatMap((lbl, idx) => [[`cell_${idx}_log2FC`, `${lbl} log2FC`], [`cell_${idx}_fdr`, `${lbl} FDR`]]),
        ['direction', t('调控方向与类别', 'Regulatory direction and category')]
      ];
    } else if (cellLabels.length === 1) {
      columns = [
        ['gene', t('宿主基因 ID', 'Host gene ID')],
        ['hepg2Log2FC', `${cellLabels[0]} log2FC`],
        ['hepg2Fdr', `${cellLabels[0]} FDR`],
        ['category', t('显著调控类别', 'Significant category')]
      ];
    } else {
      columns = [
        ['gene', t('宿主基因 ID', 'Host gene ID')],
        ['hepg2Log2FC', `${cellLabels[0]} log2FC`],
        ['hepg2Fdr', `${cellLabels[0]} FDR`],
        ['caco2Log2FC', `${cellLabels[1]} log2FC`],
        ['caco2Fdr', `${cellLabels[1]} FDR`],
        ['direction', t('调控方向与类别', 'Regulatory direction and category')]
      ];
    }
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(cellLabels.length)} ${t('个', '')} (${esc(cellLabels.join(' / '))})</strong><span>${t('参与比较宿主细胞系', 'Host cell lines compared')}</span></div><div class="metric"><strong>${fmt(result.sharedGeneCount)}</strong><span>${t('全细胞系共同检测基因', 'Genes detected across all cell lines')}</span></div><div class="metric"><strong>${fmt(rows.filter(r => r.direction === '共同下调').length)}</strong><span>${t('同向显著下调基因', 'Concordantly downregulated genes')}</span></div><div class="metric"><strong>${fmt(rows.filter(r => r.direction === '共同上调').length)}</strong><span>${t('同向显著上调基因', 'Concordantly upregulated genes')}</span></div></div>`;
  } else if (kind === 'priority') {
    columns = isEnglish() ? [['sequence', 'Candidate tsRNA sequence'], ['length', 'Length'], ['subtype', 'tsRNA subtype'], ['trnaTypes', 'Source tRNA'], ['readCount', 'OMV reads'], ['rpm', 'OMV RPM'], ['log2Enrichment', 'OMV enrichment log2'], ['freeEnergy', 'Hairpin ΔG'], ['predictedTargets', 'Predicted targets'], ['bothDown', 'Concordant down targets'], ['bothUp', 'Concordant up targets'], ['targetGenes', 'Key target genes and direction'], ['evidenceScore', 'Evidence score']] : [['sequence', '候选 tsRNA 序列'], ['length', '长度'], ['subtype', 'tsRNA 亚型'], ['trnaTypes', '来源 tRNA'], ['readCount', 'OMV reads'], ['rpm', 'OMV RPM'], ['log2Enrichment', 'OMV 富集 log2'], ['freeEnergy', '茎环 ΔG'], ['predictedTargets', '预测靶点数'], ['bothDown', '同向下调靶点'], ['bothUp', '同向上调靶点'], ['targetGenes', '关键响应靶基因与方向'], ['evidenceScore', '综合证据分']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(rows.length)}</strong><span>${t('评估 OMV tsRNA 候选', 'OMV tsRNA candidates assessed')}</span></div><div class="metric"><strong>${fmt(rows.filter(row => row.predictedTargets > 0).length)}</strong><span>${t('具跨界预测靶点', 'Candidates with cross-kingdom targets')}</span></div><div class="metric"><strong>${fmt(rows.filter(row => row.bothDown > 0 || row.bothUp > 0).length)}</strong><span>${t('宿主靶点同向显著响应', 'Concordant host target responses')}</span></div><div class="metric"><strong>${esc(rows[0]?.sequence?.slice(0, 16) || '—')}</strong><span>${t('Top #1 锁定候选序列', 'Top #1 ranked candidate')}</span></div></div>`;
  } else if (result.mode === 'blast') {
    columns = isEnglish() ? [['query', 'Query sequence'], ['target', 'Reference sequence'], ['alignmentLength', 'Alignment length (nt)'], ['queryCoverage', 'Query coverage %'], ['identity', 'Identity %'], ['targetStart', 'Reference start'], ['targetEnd', 'Reference end'], ['strand', 'Strand'], ['evalue', 'E-value'], ['bitscore', 'Bit score']] : [['query', '查询序列'], ['target', '参考序列'], ['alignmentLength', '比对长度 nt'], ['queryCoverage', '查询覆盖 %'], ['identity', '一致性 %'], ['targetStart', '参考起点'], ['targetEnd', '参考终点'], ['strand', '链'], ['evalue', 'E-value'], ['bitscore', 'bit score']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(rows.length)}</strong><span>${t('BLAST+ 局部比对记录', 'BLAST+ local alignments')}</span></div></div>`;
  } else {
    columns = isEnglish() ? [['query', 'Query sequence'], ['target', 'Reference sequence'], ['start', 'Start'], ['end', 'End'], ['strand', 'Strand'], ['identity', 'Identity %'], ['method', 'Method']] : [['query', '查询序列'], ['target', '参考序列'], ['start', '起点'], ['end', '终点'], ['strand', '链'], ['identity', '一致性 %'], ['method', '方法']];
    metrics = `<div class="metrics"><div class="metric"><strong>${fmt(rows.length)}</strong><span>${t('双链精确匹配记录', 'Full-length exact matches')}</span></div></div>`;
  }

  const caution = kind === 'tsrna' && result.processingStatus !== 'processed'
    ? `<div class="caution">${t('当前 OMV 文件标记为“预处理未核实”，仅供探索性比对；如需进入步骤 3B 候选整合，请在导入时确认已完成去接头与质控。', 'This OMV file is marked as unverified preprocessing and is for exploratory matching only. Confirm adapter trimming and QC before Stage 3B integration.')}</div>`
    : kind === 'priority' && !result.linkedToTranscriptome
      ? `<div class="caution">${t('当前未同时提供同菌株细胞转录组结果与靶基因预测，仅按 OMV 丰度与二级结构排序。', 'Host transcriptome and target predictions were not both supplied for the same strain; ranking uses OMV abundance and secondary structure only.')}</div>`
      : '';

  const svgHtml = `${renderSvgStyleStudioHtml()}<div class="svg-preview-grid"><div class="svg-card"><div class="svg-card-head"><span>${t('发表级可编辑矢量图预览（SVG）', 'Publication-ready editable vector preview (SVG)')}</span><a href="${exportUrl(id, 'svg')}" data-export-id="${id}" data-export-kind="svg" download="${esc(dl.svg)}">${t('导出 SVG', 'Export SVG')}</a></div><div class="svg-canvas svg-inline-host" data-svg-host="svg1"><img src="${exportUrl(id, 'svg')}" alt="${t('分析主图 SVG', 'Primary analysis SVG')}"></div></div>${['cells', 'priority'].includes(kind) ? `<div class="svg-card"><div class="svg-card-head"><span>${t('专题科学视图（四象限散点 / 证据链拓扑）', 'Secondary scientific view (quadrant scatter / evidence topology)')}</span><a href="${exportUrl(id, 'svg2')}" data-export-id="${id}" data-export-kind="svg2" download="${esc(dl.svg2)}">${t('导出专题 SVG', 'Export secondary SVG')}</a></div><div class="svg-canvas svg-inline-host" data-svg-host="svg2"><img src="${exportUrl(id, 'svg2')}" alt="${t('分析专题图 SVG', 'Secondary analysis SVG')}"></div></div>` : ''}</div>`;

  $(target).innerHTML = `<div class="result-heading"><div><h3>${esc(payload.name || result.source || t('分析结果', 'Analysis result'))}</h3><span class="section-meta">${t('生成时间：', 'Generated: ')}${esc(timeStr)}${dl.base ? ` · ${t('导出文件前缀：', 'Export prefix: ')}${esc(dl.base)}` : ''}</span></div><div class="export-links"><a href="${exportUrl(id, 'csv')}" data-export-id="${id}" data-export-kind="csv" download="${esc(dl.csv)}" title="${esc(dl.csv)}">${t('导出 CSV', 'Export CSV')}</a><a href="${exportUrl(id, 'svg')}" data-export-id="${id}" data-export-kind="svg" download="${esc(dl.svg)}" title="${esc(dl.svg)}">${t('导出 SVG', 'Export SVG')}</a>${['cells', 'priority'].includes(kind) ? `<a href="${exportUrl(id, 'svg2')}" data-export-id="${id}" data-export-kind="svg2" download="${esc(dl.svg2)}" title="${esc(dl.svg2)}">${t('导出专题 SVG', 'Export secondary SVG')}</a>` : ''}<a href="${exportUrl(id, 'report')}" data-export-id="${id}" data-export-kind="report" download="${esc(dl.report)}" title="${esc(dl.report)}">${t('导出报告', 'Export report')}</a></div></div>${caution}${metrics}${svgHtml}${extraBlock}${resultTable(rows, columns, target)}`;
  $(target).dataset.analysisId = id;
  bindTableSearch(target, rows, columns);
  mountInteractiveSvgs(target, id, kind);
  renderedAnalyses.set(target, payload);
  applyLanguage();
}

document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('evidence-status').addEventListener('click', e => {
  const row = e.target.closest('[data-goto]');
  if (row) showView(row.dataset.goto);
});
$('page-help').addEventListener('click', openPageHelp);
$('runtime-help').addEventListener('click', () => openHelp(runtimeHelp, '下载、安装与 GitHub 上传说明'));
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('open-imports').addEventListener('click', () => showView('imports'));
$('language-toggle').addEventListener('click', toggleLanguage);

if ($('adapter-preset')) {
  $('adapter-preset').addEventListener('change', e => {
    if (e.target.value) $('adapter-sequence').value = e.target.value;
  });
}

// Dynamic Host Cell Line import events
function setImportCellCount(targetCount) {
  const count = Math.max(1, Math.min(20, Number(targetCount) || 1));
  while (importCellSlots.length < count) {
    const n = importCellSlots.length + 1;
    importCellSlots.push({ id: `slot_${Date.now()}_${n}`, name: `细胞系 ${n}` });
  }
  if (importCellSlots.length > count) {
    importCellSlots.length = count;
  }
  renderImportCellSlots();
}
function setCompareCellCount(targetCount) {
  const count = Math.max(1, Math.min(20, Number(targetCount) || 1));
  while (compareCellSlots.length < count) {
    const n = compareCellSlots.length + 1;
    compareCellSlots.push({ uploadId: '', label: `细胞系 ${n}` });
  }
  if (compareCellSlots.length > count) {
    compareCellSlots.length = count;
  }
  renderCompareCellSlots();
}
if ($('import-cell-count')) {
  $('import-cell-count').addEventListener('change', e => setImportCellCount(e.target.value));
}
if ($('dec-import-cell-slot')) {
  $('dec-import-cell-slot').addEventListener('click', () => {
    if (importCellSlots.length <= 1) return notify('至少保留 1 个宿主细胞系槽位');
    setImportCellCount(importCellSlots.length - 1);
  });
}
if ($('compare-cell-count')) {
  $('compare-cell-count').addEventListener('change', e => setCompareCellCount(e.target.value));
}
if ($('dec-compare-cell-slot')) {
  $('dec-compare-cell-slot').addEventListener('click', () => {
    if (compareCellSlots.length <= 1) return notify('至少保留 1 个对比细胞系槽位');
    setCompareCellCount(compareCellSlots.length - 1);
  });
}
if ($('add-import-cell-slot')) {
  $('add-import-cell-slot').addEventListener('click', () => {
    importCellSlots.push({ id: `slot_${Date.now()}`, name: `CellLine_${importCellSlots.length + 1}` });
    renderImportCellSlots();
  });
}
if ($('import-cell-slots')) {
  $('import-cell-slots').addEventListener('input', e => {
    const input = e.target.closest('.slot-cell-name');
    if (!input) return;
    const idx = Number(input.dataset.slotIndex);
    if (importCellSlots[idx]) {
      importCellSlots[idx].name = input.value;
      const btnSpan = input.closest('.cell-slot-row')?.querySelector('.cell-slot-upload-btn span');
      if (btnSpan) btnSpan.textContent = `导入 ${input.value.trim() || `细胞系 #${idx + 1}`} 差异表 (CSV/TSV)`;
    }
  });
  $('import-cell-slots').addEventListener('click', e => {
    const removeBtn = e.target.closest('.remove-cell-slot');
    if (!removeBtn || importCellSlots.length <= 1) return;
    const idx = Number(removeBtn.dataset.slotIndex);
    importCellSlots.splice(idx, 1);
    renderImportCellSlots();
  });
  $('import-cell-slots').addEventListener('change', async e => {
    const fileInput = e.target.closest('.slot-cell-file');
    if (!fileInput) return;
    const file = fileInput.files?.[0];
    if (!file) return;
    const idx = Number(fileInput.dataset.slotIndex);
    const chosenCell = (importCellSlots[idx]?.name || '').trim();
    try {
      if (!chosenCell) throw new Error('请先填写该宿主细胞系的名称');
      const strainValue = $('de-strain').value;
      if (!strainValue) throw new Error('请先在“对应菌株”下拉框选择该转录组对应的细菌菌株');
      notify(`正在导入宿主细胞系 ${chosenCell} 差异表达表 ${file.name}…`, true);
      const result = await request(`/api/upload?kind=de&name=${encodeURIComponent(file.name)}&cellLine=${encodeURIComponent(chosenCell)}&strainId=${encodeURIComponent(strainValue)}`, { method: 'POST', body: file });
      await refresh();
      notify(`已成功导入宿主细胞系 ${chosenCell} 文件：${result.name}`, true);
    } catch (err) {
      notify(err.message);
    } finally {
      fileInput.value = '';
    }
  });
}

// Dynamic Host Cell Line comparison builder events
if ($('add-compare-cell-slot')) {
  $('add-compare-cell-slot').addEventListener('click', () => {
    compareCellSlots.push({ uploadId: '', label: `细胞系 ${compareCellSlots.length + 1}` });
    renderCompareCellSlots();
  });
}
if ($('compare-cell-slots')) {
  $('compare-cell-slots').addEventListener('change', e => {
    const sel = e.target.closest('.compare-cell-select');
    if (!sel) return;
    const idx = Number(sel.dataset.compareIndex);
    const u = state.uploads.find(x => x.id === sel.value);
    if (compareCellSlots[idx]) {
      compareCellSlots[idx].uploadId = sel.value;
      if (u && u.summary?.cellLine) {
        compareCellSlots[idx].label = u.summary.cellLine;
        const lblInput = sel.closest('.cell-slot-row')?.querySelector('.compare-cell-label');
        if (lblInput) lblInput.value = u.summary.cellLine;
      }
    }
  });
  $('compare-cell-slots').addEventListener('input', e => {
    const lblInput = e.target.closest('.compare-cell-label');
    if (!lblInput) return;
    const idx = Number(lblInput.dataset.compareIndex);
    if (compareCellSlots[idx]) compareCellSlots[idx].label = lblInput.value;
  });
  $('compare-cell-slots').addEventListener('click', e => {
    const rmBtn = e.target.closest('.remove-compare-slot');
    if (!rmBtn || compareCellSlots.length <= 1) return;
    const idx = Number(rmBtn.dataset.compareIndex);
    compareCellSlots.splice(idx, 1);
    renderCompareCellSlots();
  });
}

document.querySelectorAll('.upload input[type=file]').forEach(input => input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const strainValue = input.dataset.kind === 'reads' ? $('reads-strain').value : '';
    const strainId = strainValue ? `&strainId=${encodeURIComponent(strainValue)}` : '';
    const processingStatus = input.dataset.kind === 'reads' ? `&processingStatus=${encodeURIComponent($('reads-processing').value)}` : '';
    if (input.dataset.kind === 'reads' && !strainValue) throw new Error('请先在上方下拉框选择数据对应的细菌菌株');
    notify(`正在导入并解析文件 ${file.name}…`, true);
    const result = await request(`/api/upload?kind=${input.dataset.kind}&name=${encodeURIComponent(file.name)}${strainId}${processingStatus}`, { method: 'POST', body: file });
    await refresh();
    notify(`已成功导入 ${result.name}`, true);
  } catch (error) {
    notify(error.message);
  } finally {
    input.value = '';
  }
}));

$('uploads-table').addEventListener('click', async event => {
  const btn = event.target.closest('.delete-upload');
  if (!btn) return;
  if (!window.confirm(t(`确定删除已导入文件“${btn.dataset.name}”吗？`, `Delete the imported file “${btn.dataset.name}”?`))) return;
  btn.disabled = true;
  try {
    await request(`/api/uploads/${btn.dataset.id}`, { method: 'DELETE' });
    await refresh();
    notify('已删除文件', true);
  } catch (e) {
    notify(e.message);
    btn.disabled = false;
  }
});

$('run-fastqc').addEventListener('click', async () => {
  const btn = $('run-fastqc');
  btn.disabled = true;
  try {
    const result = await request('/api/fastqc', { method: 'POST', body: JSON.stringify({ readsId: $('qc-reads').value }) }, '正在执行 FastQC 多核质量控制…');
    $('qc-output').innerHTML = `<div class="caution">FastQC 质量评估已完成。 <a href="${result.zipUrl}">点击下载 FastQC ZIP 报告</a></div>`;
    notify('FastQC 报告已生成', true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

$('run-cutadapt').addEventListener('click', async () => {
  const btn = $('run-cutadapt');
  btn.disabled = true;
  try {
    const result = await request('/api/cutadapt', { method: 'POST', body: JSON.stringify({ readsId: $('qc-reads').value, adapter: $('adapter-sequence').value, markProcessed: true }) }, '正在运行 Cutadapt 多核 3′ 接头剪切…');
    await refresh();
    $('qc-output').innerHTML = `<div class="alert success">已生成剪切后文件 <strong>${esc(result.name)}</strong>；保留 ${fmt(result.summary.totalReads)} 条高质量 reads（${fmt(result.summary.uniqueSequences)} 种不同序列），可直接用于 OMV tsRNA 筛选与候选整合。</div>`;
    notify('Cutadapt 接头剪切已完成', true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

$('run-trna').addEventListener('click', async () => {
  const btn = $('run-trna');
  btn.disabled = true;
  try {
    const result = await request('/api/trna', { method: 'POST', body: JSON.stringify({ assemblyId: $('trna-assembly').value, annotationId: $('trna-annotation').value }) }, '正在运行步骤 1：细菌基因组 tRNA 扫描…');
    await refresh();
    renderAnalysis(result, 'trna-output');
    notify(`成功定位到 ${result.hits.length} 个 tRNA 基因位点`, true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

if ($('run-compare-strains')) {
  $('run-compare-strains').addEventListener('click', async () => {
    const btn = $('run-compare-strains');
    btn.disabled = true;
    try {
      const result = await request('/api/compare-strains', { method: 'POST', body: JSON.stringify({}) }, '正在运行多菌株 tRNA 与理论 tsRNA 保守性横向比对…');
      await refresh();
      renderAnalysis(result, 'strains-output');
      notify(`多菌株对比完成：识别出 ${result.coreConservedTrnaSeqs} 条全菌株核心保守 tRNA 序列`, true);
    } catch (e) {
      notify(e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

$('run-tsrna').addEventListener('click', async () => {
  const btn = $('run-tsrna');
  btn.disabled = true;
  try {
    const result = await request('/api/tsrna', {
      method: 'POST',
      body: JSON.stringify({
        trnaId: $('tsrna-trna').value,
        readsId: $('tsrna-reads').value,
        minLength: $('min-length').value,
        maxLength: $('max-length').value,
        allowCca: $('allow-cca').value === 'true'
      })
    }, '正在运行步骤 2：OMV small RNA 精确匹配与亚型分类…');
    await refresh();
    renderAnalysis(result, 'tsrna-output');
    notify(`OMV tsRNA 筛选完成：${result.matches.length} 条匹配记录（覆盖 ${result.locusSummaries?.length || 0} 个 tRNA 位点）`, true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

document.querySelectorAll('input[name="match-mode"]').forEach(input => input.addEventListener('change', () => {
  if (input.checked) {
    $('match-note').textContent = input.value === 'blast'
      ? 'BLAST+ 在本机 FASTA 库中进行多核局部相似性检索；≤50 nt 自动启用 blastn-short。'
      : '全长精确匹配要求查询序列 100% 覆盖、无错配或缺口。';
  }
}));

$('run-match').addEventListener('click', async () => {
  const btn = $('run-match');
  btn.disabled = true;
  try {
    const mode = document.querySelector('input[name="match-mode"]:checked').value;
    const result = await request('/api/match', { method: 'POST', body: JSON.stringify({ queryId: $('match-query').value, referenceId: $('match-reference').value, minLength: Number($('match-min').value), mode }) }, `正在运行${mode === 'blast' ? ' BLAST+ 多核局部' : '双链全长精确'}序列比对…`);
    await refresh();
    renderAnalysis(result, 'match-output');
    notify(`${mode === 'blast' ? 'BLAST+' : '精确匹配'}完成：${result.matches.length} 条记录`, true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

$('run-cells').addEventListener('click', async () => {
  const btn = $('run-cells');
  btn.disabled = true;
  try {
    const activeItems = compareCellSlots.filter(s => s.uploadId).map(s => ({ id: s.uploadId, label: (s.label || '').trim() }));
    if (!activeItems.length) throw new Error('请至少选择 1 份已导入的宿主细胞差异表达表');
    const result = await request('/api/compare-cells', {
      method: 'POST',
      body: JSON.stringify({
        cellLineItems: activeItems,
        hepg2Id: activeItems[0]?.id || '',
        caco2Id: activeItems[1]?.id || activeItems[0]?.id || '',
        fdr: $('cells-fdr').value,
        minAbsLog2FC: $('cells-lfc').value
      })
    }, '正在运行步骤 3A：多宿主细胞系转录组差异表达比较…');
    await refresh();
    renderAnalysis(result, 'cells-output');
    notify(`宿主细胞转录组比较完成：${result.matches.length} 个显著响应基因`, true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

$('cells-strain').addEventListener('change', updateCellOptions);
$('tsrna-trna').addEventListener('change', updateReadOptions);
$('priority-tsrna').addEventListener('change', updatePriorityOptions);

$('run-priority').addEventListener('click', async () => {
  const btn = $('run-priority');
  btn.disabled = true;
  try {
    const result = await request('/api/prioritize', {
      method: 'POST',
      body: JSON.stringify({
        tsrnaId: $('priority-tsrna').value,
        cellsId: $('priority-cells').value,
        targetsId: $('priority-targets').value,
        regulationMode: $('priority-mode').value
      })
    }, '正在运行步骤 3B：跨界靶基因预测与候选 tsRNA 证据链整合…');
    await refresh();
    renderAnalysis(result, 'priority-output');
    notify(`候选 tsRNA 证据链整合完成：Top #1 为 ${result.matches[0]?.sequence || '无'}`, true);
  } catch (e) {
    notify(e.message);
  } finally {
    btn.disabled = false;
  }
});

$('results-table').addEventListener('click', async event => {
  const openButton = event.target.closest('.result-open');
  if (openButton) {
    const detail = await request(`/api/analyses/${openButton.dataset.id}`);
    renderAnalysis(detail, 'result-detail');
    return;
  }
  const deleteButton = event.target.closest('.delete-result');
  if (!deleteButton) return;
  if (!window.confirm(t(`确定删除分析记录“${deleteButton.dataset.name}”吗？`, `Delete the analysis record “${deleteButton.dataset.name}”?`))) return;
  deleteButton.disabled = true;
  try {
    const id = deleteButton.dataset.id;
    await request(`/api/analyses/${id}`, { method: 'DELETE' });
    if ($('result-detail').dataset.analysisId === id) {
      $('result-detail').innerHTML = '';
      delete $('result-detail').dataset.analysisId;
    }
    await refresh();
    notify('已删除分析记录', true);
  } catch (e) {
    notify(e.message);
    deleteButton.disabled = false;
  }
});

$('clear-results').addEventListener('click', async () => {
  if (!state.analyses.length) return;
  if (!window.confirm(t(`确定清空全部 ${state.analyses.length} 项分析记录吗？此操作不会删除已导入的原始文件。`, `Clear all ${state.analyses.length} analysis records? Imported source files will not be deleted.`))) return;
  $('clear-results').disabled = true;
  try {
    const result = await request('/api/analyses', { method: 'DELETE' });
    $('result-detail').innerHTML = '';
    delete $('result-detail').dataset.analysisId;
    await refresh();
    notify(`已清空 ${result.deleted} 项分析记录`, true);
  } catch (e) {
    notify(e.message);
    $('clear-results').disabled = !state.analyses.length;
  }
});

const initialView = location.hash.replace('#', '');
if (['overview', 'imports', 'trna', 'tsrna', 'cells', 'priority', 'match', 'results'].includes(initialView)) showView(initialView);
applyLanguage();
refresh().catch(e => notify(e.message));

// === SVG Academic Palettes, Live Spectrum Picker & Client-side SVG Re-styler ===
const SVG_PALETTE_PRESETS = [
  { id: 'nature', label: 'Nature 蓝 + 灰蓝', primary: '#1B4F72', accent: '#94A3B8' },
  { id: 'science', label: 'Science 深青 + 浅灰青', primary: '#0F4C81', accent: '#8FA8BE' },
  { id: 'contrast', label: '顶刊蓝 + 暖橙', primary: '#1B4F72', accent: '#D95F02' },
  { id: 'cell', label: 'Cell 黛紫 + 雾灰紫', primary: '#3B2F63', accent: '#A59BB8' },
  { id: 'lancet', label: 'Lancet 绯红 + 暖灰', primary: '#B91C1C', accent: '#9CA3AF' },
  { id: 'nejm', label: 'NEJM 森林绿 + 浅灰绿', primary: '#1B4332', accent: '#95B8A6' },
  { id: 'mono', label: '投稿纯黑 + 浅灰', primary: '#1E293B', accent: '#CBD5E1' }
];

const svgStyleState = {
  presetId: 'nature',
  primaryColor: '#1B4F72', // 基因颜色
  accentColor: '#94A3B8',  // 其他基因颜色
  activeTarget: 'primary', // 'primary' (基因颜色) | 'accent' (其他基因颜色)
  colorMode: 'gene-vs-other', // 'gene-vs-other' (基因 vs 其他合并项) | 'focus-single' (指定单基因 vs 其他所有基因)
  focusBarIndex: -1,
  fontFamily: 'Inter,Arial,Helvetica,sans-serif',
  showGrid: true
};

function restyleSvgElement(svgEl) {
  if (!svgEl) return;
  const { primaryColor, accentColor, colorMode, focusBarIndex, fontFamily, showGrid } = svgStyleState;
  svgEl.querySelectorAll('.svg-root-font, g[font-family]').forEach(g => {
    g.setAttribute('font-family', fontFamily);
  });
  svgEl.querySelectorAll('.svg-grid-line').forEach(line => {
    line.setAttribute('stroke', showGrid ? (line.getAttribute('stroke-dasharray') ? '#64748b' : '#e4e9e7') : 'none');
  });
  svgEl.querySelectorAll('.svg-node-box').forEach(box => {
    box.setAttribute('stroke', primaryColor);
  });

  // Handle points in secondary scatter plot (strictly 2 colors: geneColor vs otherColor)
  svgEl.querySelectorAll('.svg-point').forEach(pt => {
    const role = pt.dataset.barRole || 'other';
    pt.setAttribute('fill', role === 'gene' || role === 'accent' ? primaryColor : accentColor);
    pt.setAttribute('fill-opacity', '0.88');
  });

  // Handle bars in main bar chart & secondary topology chart (strictly 2 colors: 基因颜色 vs 其他基因颜色)
  const bars = [...svgEl.querySelectorAll('rect.svg-bar')];
  if (bars.length) {
    // Check if this SVG has an "其他（...）" bar
    const labels = bars.map((el, idx) => {
      if (el.dataset.barLabel) return el.dataset.barLabel;
      const titleEl = el.parentElement?.querySelector('title');
      return titleEl ? titleEl.textContent.split(':')[0].trim() : `条目 #${idx + 1}`;
    });
    const hasOtherRow = labels.some(l => l.startsWith('其他'));

    bars.forEach((el, idx) => {
      const label = labels[idx] || '';
      const isOtherRow = label.startsWith('其他') || el.dataset.barRole === 'other' || el.dataset.barRole === 'muted';
      let isGeneColor;
      if (focusBarIndex >= 0 && focusBarIndex < bars.length) {
        // User selected a specific gene bar: that gene uses 基因颜色, all other bars use 其他基因颜色
        isGeneColor = (idx === focusBarIndex);
      } else if (colorMode === 'focus-single') {
        isGeneColor = (idx === 0);
      } else if (hasOtherRow) {
        // Default: all named genes use 基因颜色, and the "其他" bar uses 其他基因颜色
        isGeneColor = !isOtherRow;
      } else {
        isGeneColor = (idx === 0);
      }
      el.setAttribute('fill', isGeneColor ? primaryColor : accentColor);
      el.setAttribute('fill-opacity', '1');
    });
  } else {
    // Fallback for legacy cached SVGs without .svg-bar class
    const rects = [...svgEl.querySelectorAll('rect')].filter(r => r.getAttribute('width') !== '100%' && Number(r.getAttribute('height')) <= 48);
    const labels = rects.map((el, idx) => {
      const titleEl = el.parentElement?.querySelector('title');
      return titleEl ? titleEl.textContent.split(':')[0].trim() : `条目 #${idx + 1}`;
    });
    const hasOtherRow = labels.some(l => l.startsWith('其他'));
    rects.forEach((el, idx) => {
      const isOtherRow = (labels[idx] || '').startsWith('其他');
      const isGeneColor = (focusBarIndex >= 0 && focusBarIndex < rects.length)
        ? (idx === focusBarIndex)
        : (colorMode === 'focus-single')
          ? (idx === 0)
          : hasOtherRow
            ? !isOtherRow
            : (idx === 0);
      el.setAttribute('fill', isGeneColor ? primaryColor : accentColor);
      el.setAttribute('fill-opacity', '1');
    });
  }
}

function restyleSvgMarkupString(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return svgText;
  restyleSvgElement(svgEl);
  return new XMLSerializer().serializeToString(svgEl);
}

function renderSvgStyleStudioHtml() {
  const presetsHtml = SVG_PALETTE_PRESETS.map(p => `
    <button type="button" class="palette-pill ${svgStyleState.presetId === p.id ? 'active' : ''}" data-preset-id="${p.id}" data-primary="${p.primary}" data-accent="${p.accent}">
      <span class="swatch-pair"><span class="swatch-dot" style="background:${p.primary}"></span><span class="swatch-dot" style="background:${p.accent}"></span></span>
      <span>${esc(p.label)}</span>
    </button>
  `).join('');

  return `
    <div class="svg-style-studio" aria-label="SVG 图表配色与格式工作台">
      <div class="svg-studio-row">
        <span class="svg-studio-title">🎨 SVG 双色学术配色（基因一种颜色 · 其他基因一种颜色）：</span>
        <div class="palette-presets">${presetsHtml}</div>
        <div class="svg-format-controls">
          <label>焦点基因选择
            <select class="svg-focus-select">
              <option value="-1">各基因统一色 vs “其他”合并项异色（默认）</option>
              <option value="0">首项 Top #1 基因 vs 其他所有基因</option>
            </select>
          </label>
          <label>字体
            <select class="svg-font-select">
              <option value="Inter,Arial,Helvetica,sans-serif" ${svgStyleState.fontFamily.startsWith('Inter') ? 'selected' : ''}>无衬线 (Arial / Inter)</option>
              <option value="'Times New Roman',Times,serif" ${svgStyleState.fontFamily.includes('Times') ? 'selected' : ''}>衬线投稿风 (Times New Roman)</option>
            </select>
          </label>
          <label><input type="checkbox" class="svg-grid-toggle" ${svgStyleState.showGrid ? 'checked' : ''} style="width:auto;min-height:auto"> 网格线</label>
        </div>
      </div>
      <div class="spectrum-picker-box">
        <div class="spectrum-target-group">
          <span>选择要更改的颜色并在右侧色谱图取色：</span>
          <button type="button" class="spectrum-target-btn ${svgStyleState.activeTarget === 'primary' ? 'active' : ''}" data-color-target="primary">
            <span class="swatch-dot" data-swatch-role="primary" style="background:${svgStyleState.primaryColor}"></span> 基因颜色
          </button>
          <input type="color" class="spectrum-color-input" data-color-picker="primary" value="${svgStyleState.primaryColor}" title="更改基因颜色">
          <button type="button" class="spectrum-target-btn ${svgStyleState.activeTarget === 'accent' ? 'active' : ''}" data-color-target="accent">
            <span class="swatch-dot" data-swatch-role="accent" style="background:${svgStyleState.accentColor}"></span> 其他基因颜色
          </button>
          <input type="color" class="spectrum-color-input" data-color-picker="accent" value="${svgStyleState.accentColor}" title="更改其他基因颜色">
        </div>
        <div class="spectrum-canvas-wrap">
          <canvas class="svg-spectrum-canvas" width="240" height="30" title="在色谱图上点击或拖动，实时修改当前选中的【基因颜色】或【其他基因颜色】"></canvas>
          <span class="spectrum-hex-badge">基因 ${svgStyleState.primaryColor} · 其他 ${svgStyleState.accentColor}</span>
        </div>
      </div>
    </div>
  `;
}

function drawSpectrumCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const hueGrad = ctx.createLinearGradient(0, 0, w, 0);
  hueGrad.addColorStop(0, '#ff0000');
  hueGrad.addColorStop(0.17, '#ffff00');
  hueGrad.addColorStop(0.33, '#00ff00');
  hueGrad.addColorStop(0.50, '#00ffff');
  hueGrad.addColorStop(0.67, '#0000ff');
  hueGrad.addColorStop(0.83, '#ff00ff');
  hueGrad.addColorStop(1, '#ff0000');
  ctx.fillStyle = hueGrad;
  ctx.fillRect(0, 0, w, h);

  const lightGrad = ctx.createLinearGradient(0, 0, 0, h);
  lightGrad.addColorStop(0, 'rgba(255,255,255,0.42)');
  lightGrad.addColorStop(0.45, 'rgba(255,255,255,0)');
  lightGrad.addColorStop(1, 'rgba(10,20,35,0.62)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, w, h);
}

function pickColorFromSpectrum(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((clientX - rect.left) / rect.width * canvas.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((clientY - rect.top) / rect.height * canvas.height)));
  const pixel = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  const toHex = n => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
}

async function mountInteractiveSvgs(containerId, id, kind) {
  const container = $(containerId);
  if (!container) return;
  svgStyleState.focusBarIndex = -1;

  const canvas = container.querySelector('.svg-spectrum-canvas');
  if (canvas) {
    drawSpectrumCanvas(canvas);
    let dragging = false;
    const applyFromEvent = e => {
      const hex = pickColorFromSpectrum(canvas, e.clientX, e.clientY);
      svgStyleState.presetId = 'custom';
      if (svgStyleState.activeTarget === 'accent') {
        svgStyleState.accentColor = hex;
      } else {
        svgStyleState.primaryColor = hex;
      }
      syncStudioUiAndSvgs(container);
    };
    canvas.addEventListener('pointerdown', e => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      applyFromEvent(e);
    });
    canvas.addEventListener('pointermove', e => {
      if (dragging) applyFromEvent(e);
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
  }

  const studio = container.querySelector('.svg-style-studio');
  if (studio) {
    studio.addEventListener('click', e => {
      const pill = e.target.closest('.palette-pill');
      if (pill) {
        svgStyleState.presetId = pill.dataset.presetId;
        svgStyleState.primaryColor = pill.dataset.primary;
        svgStyleState.accentColor = pill.dataset.accent;
        syncStudioUiAndSvgs(container);
        return;
      }
      const targetBtn = e.target.closest('.spectrum-target-btn');
      if (targetBtn) {
        svgStyleState.activeTarget = targetBtn.dataset.colorTarget;
        syncStudioUiAndSvgs(container);
      }
    });
    studio.addEventListener('input', e => {
      const picker = e.target.closest('.spectrum-color-input');
      if (picker) {
        svgStyleState.presetId = 'custom';
        const val = picker.value.toUpperCase();
        if (picker.dataset.colorPicker === 'accent') {
          svgStyleState.activeTarget = 'accent';
          svgStyleState.accentColor = val;
        } else {
          svgStyleState.activeTarget = 'primary';
          svgStyleState.primaryColor = val;
        }
        syncStudioUiAndSvgs(container);
      }
    });
    studio.addEventListener('change', e => {
      if (e.target.classList.contains('svg-focus-select')) {
        const val = Number(e.target.value);
        svgStyleState.focusBarIndex = val;
        svgStyleState.colorMode = val >= 0 ? 'focus-single' : 'gene-vs-other';
        syncStudioUiAndSvgs(container);
      } else if (e.target.classList.contains('svg-font-select')) {
        svgStyleState.fontFamily = e.target.value;
        syncStudioUiAndSvgs(container);
      } else if (e.target.classList.contains('svg-grid-toggle')) {
        svgStyleState.showGrid = e.target.checked;
        syncStudioUiAndSvgs(container);
      }
    });
  }

  const host1 = container.querySelector('[data-svg-host="svg1"]');
  if (host1) {
    try {
      const res1 = await fetch(exportUrl(id, 'svg'));
      if (res1.ok) {
        host1.innerHTML = await res1.text();
        const svgEl = host1.querySelector('svg');
        if (svgEl) {
          // Populate focus selector options with the actual gene/bar names in this chart
          const focusSel = container.querySelector('.svg-focus-select');
          const bars = [...svgEl.querySelectorAll('rect.svg-bar')];
          const fallbackRects = bars.length ? bars : [...svgEl.querySelectorAll('rect')].filter(r => r.getAttribute('width') !== '100%' && Number(r.getAttribute('height')) <= 48);
          if (focusSel && fallbackRects.length) {
            const barNames = fallbackRects.map((r, idx) => {
              if (r.dataset.barLabel) return r.dataset.barLabel;
              const t = r.parentElement?.querySelector('title');
              return t ? t.textContent.split(':')[0].trim() : `条目 #${idx + 1}`;
            });
            focusSel.innerHTML = `<option value="-1">各基因统一色 vs “其他”合并项异色（默认）</option>` +
              barNames.map((n, idx) => `<option value="${idx}">仅【${esc(n)}】用基因色 vs 其余用其他基因色</option>`).join('');
          }
          // Allow clicking any bar directly on the SVG to highlight that gene vs other genes
          svgEl.addEventListener('click', ev => {
            const rect = ev.target.closest('rect');
            if (!rect || rect.getAttribute('width') === '100%') return;
            const idx = fallbackRects.indexOf(rect);
            if (idx !== -1) {
              svgStyleState.focusBarIndex = svgStyleState.focusBarIndex === idx ? -1 : idx;
              if (focusSel) focusSel.value = String(svgStyleState.focusBarIndex);
              syncStudioUiAndSvgs(container);
            }
          });
          restyleSvgElement(svgEl);
        }
      }
    } catch {}
  }
  const host2 = container.querySelector('[data-svg-host="svg2"]');
  if (host2 && ['cells', 'priority'].includes(kind)) {
    try {
      const res2 = await fetch(exportUrl(id, 'svg2'));
      if (res2.ok) {
        host2.innerHTML = await res2.text();
        restyleSvgElement(host2.querySelector('svg'));
      }
    } catch {}
  }
}

function syncStudioUiAndSvgs(container) {
  if (!container) return;
  container.querySelectorAll('.palette-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.presetId === svgStyleState.presetId);
  });
  container.querySelectorAll('.spectrum-target-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.colorTarget === svgStyleState.activeTarget);
  });
  const pDot = container.querySelector('[data-swatch-role="primary"]');
  if (pDot) pDot.style.background = svgStyleState.primaryColor;
  const aDot = container.querySelector('[data-swatch-role="accent"]');
  if (aDot) aDot.style.background = svgStyleState.accentColor;
  const pInput = container.querySelector('[data-color-picker="primary"]');
  if (pInput) pInput.value = svgStyleState.primaryColor;
  const aInput = container.querySelector('[data-color-picker="accent"]');
  if (aInput) aInput.value = svgStyleState.accentColor;
  const badge = container.querySelector('.spectrum-hex-badge');
  if (badge) badge.textContent = `基因 ${svgStyleState.primaryColor} · 其他 ${svgStyleState.accentColor}`;
  container.querySelectorAll('.svg-inline-host svg').forEach(svgEl => restyleSvgElement(svgEl));
}

// === Client-side DEFLATE Word (.docx) Generator & Blob Download Interceptor ===
const crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function calcCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crc32Table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRawBytes(dataBytes) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(dataBytes);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return { compressed: out, method: 8 };
  }
  return { compressed: dataBytes, method: 0 };
}

async function createZipBlobBytesAsync(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 15;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const rawBytes = entry.data instanceof Uint8Array ? entry.data : enc.encode(String(entry.data));
    const crc = calcCrc32(rawBytes);
    const { compressed, method } = await deflateRawBytes(rawBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, rawBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localParts.push(local, compressed);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, rawBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const totalLen = offset + centralSize + 22;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of [...localParts, ...centralParts, eocd]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

const docxXmlEsc = str =>
  String(str ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function docxRunXml(text, { bold = false, italic = false, color = "1E293B", size = 21, mono = false } = {}) {
  const font = mono ? "Consolas" : "PingFang SC";
  const asciiFont = mono ? "Consolas" : "Arial";
  const sz = Math.round(Number(size) || 21);
  return `<w:r><w:rPr><w:rFonts w:ascii="${asciiFont}" w:hAnsi="${asciiFont}" w:eastAsia="${font}" w:cs="${asciiFont}"/>${bold ? "<w:b/><w:bCs/>" : ""}${italic ? "<w:i/><w:iCs/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${docxXmlEsc(text)}</w:t></w:r>`;
}

function docxParagraphXml(runsOrText, { spaceBefore = 80, spaceAfter = 120, line = 320, align = "left", borderBottom = false, shading = null, leftIndent = 0 } = {}) {
  const runs = Array.isArray(runsOrText) ? runsOrText.join("") : docxRunXml(runsOrText);
  const pBdr = borderBottom ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="1263A6"/></w:pBdr>` : "";
  const shd = shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : "";
  const spacing = `<w:spacing w:before="${Math.round(spaceBefore)}" w:after="${Math.round(spaceAfter)}" w:line="${Math.round(line)}" w:lineRule="auto"/>`;
  const ind = leftIndent ? `<w:ind w:left="${Math.round(leftIndent)}"/>` : "";
  const jc = `<w:jc w:val="${align}"/>`;
  return `<w:p><w:pPr>${pBdr}${shd}${spacing}${ind}${jc}</w:pPr>${runs}</w:p>`;
}

function docxCalloutXml(title, text) {
  const runs = [
    docxRunXml(title ? `${title}：` : "", { bold: true, color: "0F2942", size: 21 }),
    docxRunXml(text, { color: "1E293B", size: 20 })
  ];
  return `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="DBEAFE"/><w:left w:val="single" w:sz="24" w:space="10" w:color="1263A6"/><w:bottom w:val="single" w:sz="4" w:space="6" w:color="DBEAFE"/><w:right w:val="single" w:sz="4" w:space="10" w:color="DBEAFE"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EFF6FF"/><w:spacing w:before="140" w:after="140" w:line="310" w:lineRule="auto"/><w:ind w:left="160" w:right="160"/></w:pPr>${runs.join("")}</w:p>`;
}

function docxTableXml(headers, rows) {
  if (!headers || !headers.length) return "";
  const colWidth = Math.floor(9200 / headers.length);
  const gridCols = headers.map(() => `<w:gridCol w:w="${colWidth}"/>`).join("");
  const headerCells = headers.map(h =>
    `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="103454"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${docxParagraphXml([docxRunXml(h, { bold: true, color: "FFFFFF", size: 19 })], { spaceBefore: 20, spaceAfter: 20, line: 260 })}</w:tc>`
  ).join("");
  const bodyRows = rows.map((row, idx) => {
    const fill = idx % 2 === 1 ? "F8FAFC" : "FFFFFF";
    const cells = headers.map((_, colIdx) => {
      const val = Array.isArray(row) ? row[colIdx] : row[headers[colIdx]];
      return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${docxParagraphXml([docxRunXml(String(val ?? "—"), { color: "1E293B", size: 18, bold: colIdx === 0 })], { spaceBefore: 20, spaceAfter: 20, line: 250 })}</w:tc>`;
    }).join("");
    return `<w:tr>${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/><w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells}</w:tr>${bodyRows}</w:tbl>`;
}

async function buildClientReportDocxBytes(detailPayload) {
  const result = detailPayload.result || detailPayload;
  const kind = detailPayload.kind || (result.hits ? "trna" : result.strainNames ? "strains" : result.totalReads !== undefined ? "tsrna" : result.sharedGeneCount !== undefined ? "cells" : result.linkedToTranscriptome !== undefined ? "priority" : "match");
  const name = detailPayload.name || result.source || "分析结果";
  const timeStr = formatDateTime(detailPayload.createdAt || detailPayload.created_at, detailPayload.display_time);
  const stepName = STEP_PREFIX_MAP[kind] || kind;
  const rows = result.hits || result.matches || [];

  const methods = {
    trna: "调用 tRNAscan-SE 2.0 细菌模式 (-B) 或解析外部导入的 tRNAscan-SE 输出；基因组坐标采用 1-based 闭区间，并构建 10–50 nt 理论 tsRNA 候选空间。",
    strains: "跨多株细菌基因组组装横向比对预测的 tRNA 基因全长序列及 5′/3′ 理论 tsRNA 候选序列，自动识别全部菌株 100% 共有的核心保守位点与菌株特异位点。",
    tsrna: "采用高速 k-mer 哈希索引将观测到的 OMV small RNA 序列精确匹配到同菌株预测的基因组 tRNA 区段及成熟 3′-CCA 末端；精细划分为 5′-tRF (tRF-5X/5a/5b/5c)、5′-tiRNA、3′-tRF、3′-tiRNA 与 i-tRF，并计算二级结构茎环自由能（ΔG）、RPM 与全菌富集比。",
    match: result.mode === "blast" ? "对本地参考 FASTA 建立 BLAST+ 核酸索引库，再执行 blastn / blastn-short 多核局部相似性检索；坐标采用 1-based。" : "对参考 FASTA 正负双链进行 100% 全长精确匹配；不允许错配或缺口。",
    cells: "按同源基因 ID 对齐同一菌株处理的宿主细胞系差异表达表，并分别应用 FDR 与 |log2FC| 阈值筛选跨细胞系同向或特异调控基因。",
    priority: "以已核实预处理的 OMV tRNA 衍生序列为候选；联合 RNA 二级结构稳定性、OMV 表达丰度（RPM 及富集度）、跨界靶基因预测（外部预测表或内置 8mer/7mer 种子区与反义互补扫描）及宿主细胞转录组差异响应方向进行综合证据链评分排序。"
  };
  const limits = {
    trna: "基因组 tRNA 定位属于计算预测，不等同于外膜囊泡（OMV）中的实际转录或选择性包装表达证据。",
    strains: "多菌株基因组层面的序列保守性仅反映基因座同源性，实际 OMV 包装丰度仍需各菌株 OMV small RNA 测序验证。",
    tsrna: "网站支持运行 FastQC 和 Cutadapt，但须提供真实建库接头并人工审阅质控报告；多位点同源命中不强行拆分 reads；序列匹配结果需结合独立实验证明囊泡内定位与生物学功能。",
    match: result.mode === "blast" ? "BLAST+ 的局部命中、短序列 E-value 和有限查询覆盖度均不能单独证明物种来源、成熟 tsRNA 身份或靶基因因果调控。" : "全长精确匹配不等同于局部同源检索或功能注释；无命中亦不排除存在含错配的同源序列。",
    cells: "本模块对导入的差异表达统计表进行跨细胞系对齐与描述性归类，未对原始计数矩阵重新运行 DESeq2 或双因素交互效应检验。",
    priority: "综合证据评分用于排列分子生物学实验验证优先级。即使靶基因预测与宿主转录组变化方向完全一致，仍须通过双荧光素酶报告基因、Mimic/Inhibitor 转染、Ago2-RIP 或细菌基因敲除突变株实验建立因果机制。"
  };
  const figureMeaning = {
    trna: "主图柱形展示各氨基酸反密码子类型的预测基因组 tRNA 位点数（n 为预测位点数）。",
    strains: "主图柱形展示不同跨菌株保守性等级（核心保守、部分共有、菌株特异）的 tRNA 序列数量。",
    tsrna: "主图柱形展示各长度（nt）匹配的 OMV reads 分布（同一唯一序列按 reads 数计一次）。",
    cells: "主图柱形展示各调控分类的显著差异基因数；专题图展示跨细胞系 log2FoldChange 四象限分布。",
    priority: "主图柱形展示各互斥证据层级中的候选 tsRNA 序列数；专题图展示 Top 候选序列的跨界调控证据链拓扑关系。",
    match: result.mode === "blast" ? "主图柱形展示各参考序列的 BLAST+ 局部比对命中记录数。" : "主图柱形展示各参考序列的双链全长精确匹配记录数。"
  };
  const literature = {
    trna: "Chan PP et al. tRNAscan-SE 2.0: improved detection and functional classification of transfer RNA genes. Nucleic Acids Research (2021), DOI: 10.1093/nar/gkab688.",
    strains: "Chan PP et al. tRNAscan-SE 2.0, Nucleic Acids Research (2021), DOI: 10.1093/nar/gkab688; Wyres KL et al. Population genomics of Klebsiella pneumoniae. Nature Reviews Microbiology (2020).",
    tsrna: "Koeppen K et al. PLoS Pathogens (2016), DOI: 10.1371/journal.ppat.1005672; Diallo I et al. PLoS Pathogens (2022), DOI: 10.1371/journal.ppat.1010827; Welsh JA et al. MISEV2023, DOI: 10.1002/jev2.12404.",
    cells: "Love MI et al. Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. Genome Biology (2014), DOI: 10.1186/s13059-014-0550-8.",
    priority: "Koeppen K et al. PLoS Pathogens (2016), DOI: 10.1371/journal.ppat.1005672; Diallo I et al. PLoS Pathogens (2022), DOI: 10.1371/journal.ppat.1010827; Welsh JA et al. MISEV2023, DOI: 10.1002/jev2.12404.",
    match: "Camacho C et al. BLAST+: architecture and applications. BMC Bioinformatics (2009), DOI: 10.1186/1471-2105-10-421."
  };

  const cellLabelDesc = Array.isArray(result.cellLabels) && result.cellLabels.length
    ? result.cellLabels.join(" vs ")
    : `${result.cellLineA || "细胞系 1"} vs ${result.cellLineB || "细胞系 2"}`;

  const details = kind === "cells"
    ? `菌株：${result.strain}；对比宿主细胞系：${cellLabelDesc}；显著性阈值：FDR ≤ ${result.fdr}，|log2FC| ≥ ${result.minAbsLog2FC}；共有检测基因数：${result.sharedGeneCount}。`
    : kind === "tsrna"
      ? `样本总 reads：${result.totalReads}；唯一序列数：${result.uniqueSequences}；筛查长度范围：${result.minLength ?? 10}–${result.maxLength ?? 50} nt；3′-CCA 成熟尾匹配：${result.allowCca !== false ? "开启" : "关闭"}；预处理状态：${result.processingStatus === "processed" ? "已确认去接头与质控" : "未核实"}。`
      : kind === "match"
        ? result.mode === "blast"
          ? `参考库：${result.referenceName}；查询集：${result.queryName}；比对任务：${result.task}；dust 过滤：${result.parameters?.dust}；E-value 上限：${result.parameters?.evalue}；最短比对长度：${result.parameters?.minAlignmentLength} nt。`
          : `参考库：${result.referenceName}；查询集：${result.queryName}；最短匹配长度：${result.minLength} nt；结果截断：${result.truncated ? "是" : "否"}。`
        : kind === "trna"
          ? `预测来源：${result.source}；检出 tRNA 位点数：${rows.length}；理论候选片段长度范围：${result.candidateSpace?.minLength ?? 10}–${result.candidateSpace?.maxLength ?? 50} nt（共 ${result.candidateSpace?.distinctSequences ?? 0} 条非冗余理论序列）。`
          : kind === "strains"
            ? `对比菌株：${(result.strainNames || []).join(" / ")}；全部菌株 100% 保守 tRNA 序列：${result.coreConservedTrnaSeqs} 条；菌株特异序列：${result.strainSpecificTrnaSeqs} 条；保守 24 nt 5′-tRF 候选：${result.conserved24nt5Prime} 条。`
            : kind === "priority"
              ? `所属菌株：${result.strain}；跨界靶点来源：${result.targetSource || "预测表"}；调控筛选模式：${result.regulationMode || "both"}；宿主转录组关联状态：${result.linkedToTranscriptome ? "已建立完整跨界关联" : "仅按 OMV 丰度与结构排序"}。`
              : "";

  let previewTable = null;
  if (rows.length > 0) {
    if (kind === "trna") {
      previewTable = {
        headers: ["Contig", "位点 #", "起点", "终点", "链", "氨基酸类型", "反密码子", "Cove 分数"],
        rows: rows.slice(0, 15).map(r => [r.contig, r.number, r.start, r.end, r.strand, r.type, r.anticodon, r.score])
      };
    } else if (kind === "strains") {
      previewTable = {
        headers: ["tRNA 类型", "反密码子", "跨菌株保守性", "各菌株拷贝数", "5′-tRF-5X (13 nt)", "5′-tRF-5b (24 nt)", "已知同源注释"],
        rows: rows.slice(0, 15).map(r => [r.type, r.anticodon, r.conservation, r.copySummary, r.fivePrime13, r.fivePrime24, r.knownHomolog])
      };
    } else if (kind === "tsrna") {
      previewTable = {
        headers: ["tsRNA 序列", "长度", "精细亚型", "来源 tRNA", "OMV reads", "RPM", "OMV/全菌 log2", "茎环 ΔG"],
        rows: rows.slice(0, 15).map(r => [r.sequence, r.length, r.subtype, `${r.type}(${r.anticodon})`, r.readCount, r.rpm, r.log2Enrichment ?? "—", r.freeEnergy])
      };
    } else if (kind === "cells") {
      const cA = (Array.isArray(result.cellLabels) && result.cellLabels[0]) || result.cellLineA || "细胞系 1";
      const cB = (Array.isArray(result.cellLabels) && result.cellLabels[1]) || result.cellLineB || "细胞系 2";
      previewTable = {
        headers: ["宿主基因 ID", `${cA} log2FC`, `${cA} FDR`, `${cB} log2FC`, `${cB} FDR`, "调控方向与类别"],
        rows: rows.slice(0, 15).map(r => [r.gene, r.hepg2Log2FC, r.hepg2Fdr, r.caco2Log2FC, r.caco2Fdr, r.direction])
      };
    } else if (kind === "priority") {
      previewTable = {
        headers: ["排名", "候选 tsRNA 序列", "亚型", "来源 tRNA", "OMV RPM", "茎环 ΔG", "关键响应靶基因", "综合证据分"],
        rows: rows.slice(0, 15).map((r, i) => [`#${i + 1}`, r.sequence, r.subtype, r.trnaTypes, r.rpm, r.freeEnergy, r.targetGenes || "—", r.evidenceScore])
      };
    } else {
      previewTable = {
        headers: ["查询序列", "参考序列", "起点", "终点", "链", "一致性 %", "比对方式"],
        rows: rows.slice(0, 15).map(r => [r.query, r.target, r.targetStart ?? r.start, r.targetEnd ?? r.end, r.strand, r.identity, r.method])
      };
    }
  }

  const parts = [];
  parts.push(docxParagraphXml([docxRunXml(`序证工作台｜${stepName}分析报告`, { bold: true, size: 36, color: "0F2942" })], { spaceBefore: 40, spaceAfter: 60, line: 360 }));
  parts.push(docxParagraphXml([docxRunXml(`${name} · 生成时间：${timeStr}`, { size: 22, color: "475569" })], { spaceBefore: 0, spaceAfter: 180, line: 300, borderBottom: true }));
  parts.push(docxTableXml(["项目属性", "详细内容"], [
    ["分析阶段与模块", stepName],
    ["分析任务名称", name],
    ["结果生成时间", timeStr],
    ["结果记录总数", `${rows.length.toLocaleString("en-US")} 条记录`],
    ["核心参数与摘要", details]
  ]));
  parts.push(docxParagraphXml("", { spaceBefore: 40, spaceAfter: 40 }));

  parts.push(docxParagraphXml([docxRunXml("一、计算生物信息学方法说明", { bold: true, size: 26, color: "103454" })], { spaceBefore: 240, spaceAfter: 100, line: 320, borderBottom: true }));
  parts.push(docxParagraphXml([docxRunXml(methods[kind] || "按工作台标准流程执行分析。", { size: 21, color: "1E293B" })], { spaceBefore: 60, spaceAfter: 100, line: 310 }));
  parts.push(docxCalloutXml("参数与执行摘要", details));

  if (previewTable) {
    parts.push(docxParagraphXml([docxRunXml(`二、核心分析结果预览（前 ${Math.min(15, rows.length)} 条，全量记录见配套 CSV）`, { bold: true, size: 26, color: "103454" })], { spaceBefore: 240, spaceAfter: 100, line: 320, borderBottom: true }));
    parts.push(docxTableXml(previewTable.headers, previewTable.rows));
    parts.push(docxParagraphXml("", { spaceBefore: 40, spaceAfter: 60 }));
  }

  parts.push(docxParagraphXml([docxRunXml("三、配套 SVG 发表级矢量图说明与科学解释边界", { bold: true, size: 26, color: "103454" })], { spaceBefore: 240, spaceAfter: 100, line: 320, borderBottom: true }));
  for (const b of [
    { lead: "SVG 矢量图说明", text: `${figureMeaning[kind] || ""} 导出的 SVG 文件支持在 Adobe Illustrator、Inkscape 或 Affinity Designer 中无损缩放与编辑字体。` },
    { lead: "科学严谨性边界", text: limits[kind] || "" },
    { lead: "同行评议参考文献", text: literature[kind] || "" }
  ]) {
    parts.push(docxParagraphXml([
      docxRunXml("• ", { bold: true, color: "1263A6", size: 21 }),
      docxRunXml(`${b.lead}：`, { bold: true, color: "0F2942", size: 21 }),
      docxRunXml(b.text, { color: "1E293B", size: 20 })
    ], { spaceBefore: 40, spaceAfter: 70, line: 300, leftIndent: 240 }));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="PingFang SC" w:cs="Arial"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="300" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:tblPr>
      <w:tblInd w:w="0" w:type="dxa"/>
      <w:tblCellMar>
        <w:top w:w="0" w:type="dxa"/>
        <w:left w:w="108" w:type="dxa"/>
        <w:bottom w:w="0" w:type="dxa"/>
        <w:right w:w="108" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>
</w:styles>`;

  const isoNow = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${docxXmlEsc(`序证工作台｜${stepName}分析报告`)}</dc:title>
  <dc:creator>Sequence Evidence Workbench</dc:creator>
  <cp:lastModifiedBy>Sequence Evidence Workbench</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:modified>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
  <AppVersion>16.0000</AppVersion>
</Properties>`;

  return await createZipBlobBytesAsync([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: relsXml },
    { name: "docProps/core.xml", data: coreXml },
    { name: "docProps/app.xml", data: appXml },
    { name: "word/document.xml", data: documentXml },
    { name: "word/styles.xml", data: stylesXml },
    { name: "word/_rels/document.xml.rels", data: docRelsXml }
  ]);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

document.addEventListener("click", async event => {
  const link = event.target.closest("a[data-export-kind]");
  if (!link) return;
  event.preventDefault();
  const id = link.dataset.exportId;
  const exportKind = link.dataset.exportKind;
  const filename = link.getAttribute("download") || "分析结果";
  try {
    if (exportKind === "report") {
      const finalName = filename.endsWith(".docx") ? filename : `${filename.replace(/\.(md|txt|docx)$/i, "")}.docx`;
      // Try server native docx endpoint first, fall back to client DEFLATE docx builder if server returned old markdown
      const res = await fetch(exportUrl(id, 'report'));
      const cType = res.headers.get("content-type") || "";
      if (res.ok && cType.includes("wordprocessingml")) {
        const buf = await res.arrayBuffer();
        triggerBlobDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), finalName);
      } else {
        const detail = await request(`/api/analyses/${id}`);
        const docxBytes = await buildClientReportDocxBytes(detail);
        triggerBlobDownload(new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), finalName);
      }
      notify(t(`已导出 Word 报告：${finalName}`, `Word report exported: ${finalName}`), true);
    } else if (exportKind === "csv") {
      const res = await fetch(exportUrl(id, 'csv'));
      if (!res.ok) throw new Error("导出 CSV 失败");
      const text = await res.text();
      const finalName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      triggerBlobDownload(new Blob([text.startsWith("\ufeff") ? text : "\ufeff" + text], { type: "text/csv;charset=utf-8" }), finalName);
      notify(t(`已导出 CSV：${finalName}`, `CSV exported: ${finalName}`), true);
    } else if (exportKind === "svg" || exportKind === "svg2") {
      const q = new URLSearchParams({
        primaryColor: svgStyleState.primaryColor,
        accentColor: svgStyleState.accentColor,
        colorMode: svgStyleState.colorMode,
        fontFamily: svgStyleState.fontFamily,
        showGrid: String(svgStyleState.showGrid)
      }).toString();
      const res = await fetch(`${exportUrl(id, exportKind)}&${q}`);
      if (!res.ok) throw new Error("导出 SVG 失败");
      const rawSvg = await res.text();
      const styledSvg = restyleSvgMarkupString(rawSvg);
      const finalName = filename.endsWith(".svg") ? filename : `${filename}.svg`;
      triggerBlobDownload(new Blob([styledSvg], { type: "image/svg+xml;charset=utf-8" }), finalName);
      notify(t(`已导出自定义配色 SVG 矢量图：${finalName}`, `Customized SVG exported: ${finalName}`), true);
    }
  } catch (err) {
    notify(err.message || "导出失败");
  }
});
