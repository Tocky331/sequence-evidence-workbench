# Sequence Evidence Workbench

> **Project Summary (<350 chars):**
> Local bioinformatics pipeline for profiling bacterial OMV tsRNAs and host target genes. Maps tRNA loci, classifies tsRNA subtypes, and integrates custom host transcriptomes via a one-click GUI. Exports CSVs, customizable dual-color SVGs, and Word (.docx) reports with 100% concordance against published *PLoS Pathogens* benchmarks.

---

## 1. Overview

**Sequence Evidence Workbench** is a privacy-preserving, local Web application designed for investigating cross-kingdom gene regulation mediated by bacterial Outer Membrane Vesicle (OMV) tRNA-derived small RNAs (tsRNAs / tRFs / tiRNAs). No complex command-line skills are required: the full pipeline — from bacterial genome tRNA annotation and multi-strain conservation analysis, to OMV small RNA enrichment, flexible multi-cell-line differential expression integration, and cross-kingdom target prediction with editable Word (`.docx`) report export — runs entirely on your own machine.

---

## 2. Key Features

- **5-Step Standardized Analysis Pipeline**
  1. **Genome & tRNA Scan**: Import bacterial genome FASTA and tRNAscan-SE output (or call a local `tRNAscan-SE` directly); supports multi-strain tRNA conservation clustering.
  2. **OMV tsRNA Screening**: Streams FASTQ / FASTQ.GZ / CSV / TSV sequencing data; 3'-CCA tail matching; automatic classification into 5'-tRF / 3'-tRF / i-tRF / tiRNA subtypes with secondary-structure free energy (MFE) assessment.
  3. **Flexible Multi-Cell Host Comparison**: No fixed host cell lines. Add, remove, and custom-name **1–20 host cell lines** (e.g., A549, THP-1, HEK293T, Caco-2) from DE CSV/TSV tables; automatically identifies concordantly down- or up-regulated host target genes.
  4. **Cross-Kingdom Target Prioritization**: Built-in 3'UTR seed-region and complementary-pairing scanning of key human immune and barrier pathways; supports importing custom target tables or calling a local `BLAST+` for sequence alignment — building a complete evidence chain of "real OMV-derived fragments → host target genes → cross-cell-line transcriptomic changes".
  5. **Direct Sequence Matching**: Exact positive/negative strand matching plus local BLAST alignment.
- **Dual-Color Publication SVG Figures**
  - Strict two-color academic design ("focus gene/sequence primary color + background genes secondary color") with 6 built-in journal palettes (Nature Classic Blue, Cell Coral Red, Science Emerald Green, Lancet Deep Purple, JAMA Warm Amber, High-Contrast Academic Gray), plus a free color picker, font-size adjustment, and one-click vector `.svg` export.
- **Native Word (`.docx`) Reports & CSV Export**
  - One-click generation of standard OpenXML (`.docx`) analysis reports (full experimental metadata, methods, and summary tables), compatible with Microsoft Word, WPS Office, and Apple Pages.
- **Bilingual UI & Smooth Toast Transitions**
  - One-click persistent **Chinese / English** switching in the top-right corner; progress bars and completion notifications animate smoothly and auto-dismiss after 6 seconds.

---

## 3. Quick Start

### 3.1 Prerequisites
- **Node.js 22.5 or newer** — official download: <https://nodejs.org/en/download> (npm is bundled with Node.js automatically). Uses the built-in `node:sqlite` module.
- The lightweight pure-JavaScript dependency (`node_modules/csv-parse`) is bundled in this repository, so the app can start **immediately after download without running `npm install` online**.

### 3.2 Optional Command-Line Tool Downloads

These tools are **optional** — install only the ones you need for the corresponding analysis steps (QC, adapter trimming, tRNA scanning, or BLAST alignment). The project does not bundle them.

| Tool | Official download | Notes |
| --- | --- | --- |
| **FastQC** | <https://www.bioinformatics.babraham.ac.uk/projects/fastqc/> | Requires a Java runtime |
| **Cutadapt** | <https://cutadapt.readthedocs.io/en/latest/installation.html> | Windows recommended: `conda install -c bioconda cutadapt` |
| **tRNAscan-SE** | <https://lowelab.ucsc.edu/tRNAscan-SE/> | Windows recommended: `conda install -c bioconda trnascan-se`; alternatively import its `.out` results instead of running it locally |
| **BLAST+** | <https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/> | Official Windows installer (`.exe`) available |

> **Windows users**: the easiest way to install Cutadapt / tRNAscan-SE / BLAST+ is the package manager **conda** (miniforge: <https://github.com/conda-forge/miniforge>): `conda install -c bioconda cutadapt trnascan-se blast`.

### 3.3 One-Click Launch
- **macOS users**:
  - Double-click **`Launch-Workbench.command`** or **`Sequence-Evidence-Workbench.app`** in the folder. The script auto-detects a free port (default `http://localhost:8817/`) and opens your browser.
  - **Note (macOS first-download security prompt)**: If you downloaded the `.zip` from a browser, macOS Gatekeeper may block the unsigned scripts. Open "Terminal", type `cd `, drag this folder into the terminal, press Enter, and run the following one-line command to permanently allow:
    ```bash
    xattr -cr . && chmod +x Launch-Workbench.command Sequence-Evidence-Workbench.app/Contents/MacOS/launcher
    ```
- **Windows users**:
  - Double-click **`Launch-Workbench.bat`** in the folder to launch and automatically open the default browser.
- **Command-line launch (macOS / Windows / Linux)**:
  ```bash
  npm start
  ```

---

## 4. Repository Structure & Manuals

```text
├── README.md                            # Bilingual project README
├── 中文用户手册.docx                    # Full Chinese installation & usage manual (Word)
├── User-Manual.docx                     # Full English installation & usage manual (Word)
├── Launch-Workbench.command           # macOS one-click launcher script
├── Sequence-Evidence-Workbench.app                       # macOS application bundle
├── Launch-Workbench.bat       # Windows one-click launcher script
├── server.mjs                           # Local HTTP server & streaming progress API
├── lib.mjs                              # Core bioinformatics algorithm engine
├── figure.mjs                           # Dual-color publication SVG figure generator
├── docx.mjs                             # Standard OOXML Word (.docx) report engine
├── package.json                         # Node.js project manifest
├── public/                              # Bilingual web UI assets
└── test/                                # Automated unit tests & demo fixtures
```

---

## 5. Running Tests

```bash
npm test
```

All uploaded data, SQLite databases, and caches are stored locally under the `data/` directory by default (automatically ignored via `.gitignore`), ensuring your unpublished sequencing data stays 100% on your own computer.
