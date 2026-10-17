# 序证工作台 | Sequence Evidence Workbench

> **English Summary (<350 chars):**  
> Local bioinformatics workbench for bacterial OMV tsRNA and host target analysis. Maps tRNA loci, classifies tsRNA subtypes, and integrates custom host transcriptomes via a one-click GUI. Exports CSVs, customizable dual-color SVGs, and Word (.docx) reports with 100% concordance against published *PLoS Pathogens* benchmarks.

---

## 一、 项目简介 | Overview

**序证工作台（Sequence Evidence Workbench）** 是一个在本机运行的生物信息学 Web 分析平台，专为**细菌外膜囊泡（OMV）tRNA 衍生小 RNA（tsRNA / tRF / tiRNA）跨界调控宿主靶基因**研究设计。无需复杂的命令行操作，即可在本地完成从细菌基因组 tRNA 注释、多菌株保守性比对、OMV 小 RNA 测序片段富集、多组自定义宿主细胞系差异表达整合，到跨界靶基因预测与可编辑 Word（`.docx`）报告导出的全流程分析。

**Sequence Evidence Workbench** is a privacy-preserving, local Web application for bacterial Outer Membrane Vesicle (OMV) tRNA-derived small RNA (tsRNA/tRF) screening and cross-kingdom host target prioritization.

---

## 二、 核心功能 | Key Features

- **五步标准化分析流水线 | 5-Step Standardized Pipeline**
  1. **基因组与 tRNA 扫描（Genome & tRNA Scan）**：导入细菌基因组 FASTA 与 tRNAscan-SE 结果（或直接调用本机 `tRNAscan-SE`），支持多菌株 tRNA 保守性聚类比对。
  2. **OMV tsRNA 鉴定与分类（OMV tsRNA Screening）**：支持 FASTQ / FASTQ.GZ / CSV / TSV 测序数据流式记数、3'-CCA 尾端匹配、5'-tRF / 3'-tRF / i-tRF / tiRNA 亚型自动分类及二级结构自由能（MFE）评估。
  3. **自定义多宿主细胞系比较（Flexible Multi-Cell Host Comparison）**：无固定细胞系限制，支持用户自由添加或删减 **1–20 组任意宿主细胞系**（如 A549、THP-1、HEK293T、Caco-2 等）的差异表达表（DE CSV/TSV），自动识别跨细胞系共同下调/上调靶基因。
  4. **跨界靶点整合与优先级排序（Cross-Kingdom Target Prioritization）**：内置人源免疫与屏障关键通路 3'UTR 种子区与互补配对扫描，支持导入自定义靶点表或调用本机 `BLAST+` 进行序列比对，构建“OMV 真实表达片段 → 宿主靶基因 → 跨细胞系转录组变化”完整证据链。
  5. **序列直接匹配（Direct Sequence Matching）**：支持正负双链精确匹配与本机 BLAST 比对。
- **双色学术级 SVG 图表定制 | Dual-Color Publication SVG Figures**
  - 采用**“关注基因/序列主色 + 其余背景基因次色”**双色视觉规范，内置 6 套经典学术期刊配色（Nature 经典蓝、Cell 珊瑚红、Science 翡翠绿、Lancet 深紫、JAMA 暖琥珀、高对比学术灰），并支持自由取色器、字体字号调整与一键导出矢量 `.svg`。
- **原生 Word（`.docx`）报告与 CSV 数据表导出 | Native Word & CSV Export**
  - 一键生成标准 OpenXML（`.docx`）格式分析报告（含完整实验元数据、方法说明與结果汇总表格），兼容 Microsoft Word、WPS Office 与 Apple Pages。
- **中英双语实时切换与 6 秒智能通知动效 | Bilingual UI & Smooth Toast Transitions**
  - 右上角支持 **中文 / English** 一键持久化切换；运行进度条与完成提示支持丝滑入场及完成后 **6 秒自动淡出**。

---

## 三、 快速启动 | Quick Start

### 1. 环境要求 | Prerequisites
- **Node.js 22.0 或更新版本**（使用 Node.js 内置 `node:sqlite` 模块，无需额外配置数据库）。
- 本项目已内置轻量级纯 JavaScript 解析依赖（`node_modules/csv-parse`），下载后**无需联网执行 `npm install` 即可直接启动**。

### 2. 一键双击启动 | One-Click Launch
- **macOS 用户**：
  - 双击目录内的 **`双击打开序证工作台.command`** 或 **`序证工作台.app`**，脚本会自动检测空闲端口（默认 `http://localhost:8817/`）并打开浏览器。
  - **注意（macOS 首次下载安全提示）**：如果您是从浏览器直接下载的 `.zip` 压缩包，macOS Gatekeeper 可能会拦截未签名的脚本。请打开“终端（Terminal）”，输入 `cd ` 后将本文件夹拖入终端回车，执行以下一行命令即可永久放行：
    ```bash
    xattr -cr . && chmod +x 双击打开序证工作台.command 序证工作台.app/Contents/MacOS/launcher
    ```
- **Windows 用户**：
  - 双击目录内的 **`双击打开序证工作台_Windows.bat`** 即可启动并自动打开默认浏览器。
- **命令行启动（macOS / Windows / Linux 通用）**：
  ```bash
  npm start
  ```

---

## 四、 目录结构与说明文档 | Repository Structure & Manuals

```text
├── README.md                            # 项目中英双语说明文档 (Bilingual README)
├── 中文用户手册.docx                    # 完整中文安装配置与使用手册 (Chinese User Manual in Word)
├── User-Manual.docx                     # 完整英文安装配置与使用手册 (English User Manual in Word)
├── 双击打开序证工作台.command           # macOS 一键启动脚本 (macOS One-Click Launcher)
├── 序证工作台.app                       # macOS 桌面应用程序包 (macOS Application Bundle)
├── 双击打开序证工作台_Windows.bat       # Windows 一键启动脚本 (Windows One-Click Launcher)
├── server.mjs                           # 本地 Web 服务与流式进度 API (HTTP Server & Streaming API)
├── lib.mjs                              # 核心生物信息学算法引擎 (Core Bioinformatics Engine)
├── figure.mjs                           # 双色学术级 SVG 矢量图表生成器 (Dual-Color SVG Generator)
├── docx.mjs                             # 标准 OOXML Word (.docx) 报告生成引擎 (DOCX Report Engine)
├── package.json                         # Node.js 项目配置 (Project Manifest)
├── public/                              # 前端交互界面 (Bilingual Web UI Assets)
└── test/                                # 自动化单元测试与标准示例数据 (Unit Tests & Demo Fixtures)
```

---

## 五、 自动化测试 | Running Tests

```bash
npm test
```

所有上传数据、SQLite 数据库与缓存默认保存在本机 `data/` 目录下（已由 `.gitignore` 自动忽略），确保您的未发表测序数据 100% 留存在本地电脑。
