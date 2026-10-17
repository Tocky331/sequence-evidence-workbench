import { deflateRawSync } from 'node:zlib';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  // Valid MS-DOS date/time (2026-10-15 12:00:00) so strict macOS/Windows ZIP & Office parsers never reject month=0/day=0
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 15;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const compressed = deflateRawSync(rawBuf, { level: 6 });
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralSize = centralParts.reduce((a, b) => a + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

const xmlEsc = str =>
  String(str ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function runXml(text, { bold = false, italic = false, color = '1E293B', size = 21, mono = false } = {}) {
  const font = mono ? 'Consolas' : 'PingFang SC';
  const asciiFont = mono ? 'Consolas' : 'Arial';
  const sz = Math.round(Number(size) || 21);
  // Strict ECMA-376 EG_RPrBase sequence order: rFonts -> b -> bCs -> i -> iCs -> color -> sz -> szCs
  return `<w:r><w:rPr><w:rFonts w:ascii="${asciiFont}" w:hAnsi="${asciiFont}" w:eastAsia="${font}" w:cs="${asciiFont}"/>${bold ? '<w:b/><w:bCs/>' : ''}${italic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}

function paragraphXml(runsOrText, { spaceBefore = 80, spaceAfter = 120, line = 320, align = 'left', borderBottom = false, shading = null, leftIndent = 0 } = {}) {
  const runs = Array.isArray(runsOrText) ? runsOrText.join('') : runXml(runsOrText);
  const pBdr = borderBottom ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="1263A6"/></w:pBdr>' : '';
  const shd = shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : '';
  const spacing = `<w:spacing w:before="${Math.round(spaceBefore)}" w:after="${Math.round(spaceAfter)}" w:line="${Math.round(line)}" w:lineRule="auto"/>`;
  const ind = leftIndent ? `<w:ind w:left="${Math.round(leftIndent)}"/>` : '';
  const jc = `<w:jc w:val="${align}"/>`;
  // Strict ECMA-376 CT_PPrBase sequence order: pBdr -> shd -> spacing -> ind -> jc
  return `<w:p><w:pPr>${pBdr}${shd}${spacing}${ind}${jc}</w:pPr>${runs}</w:p>`;
}

function calloutXml(title, text, { fill = 'EFF6FF', borderColor = '1263A6', titleColor = '0F2942' } = {}) {
  const runs = [
    runXml(title ? `${title}：` : '', { bold: true, color: titleColor, size: 21 }),
    runXml(text, { color: '1E293B', size: 20 })
  ];
  // Strict ECMA-376 CT_PPrBase sequence order: pBdr -> shd -> spacing -> ind
  return `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="DBEAFE"/><w:left w:val="single" w:sz="24" w:space="10" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="4" w:space="6" w:color="DBEAFE"/><w:right w:val="single" w:sz="4" w:space="10" w:color="DBEAFE"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:spacing w:before="140" w:after="140" w:line="310" w:lineRule="auto"/><w:ind w:left="160" w:right="160"/></w:pPr>${runs.join('')}</w:p>`;
}

function codeBlockXml(lines) {
  const lineArray = Array.isArray(lines) ? lines : String(lines).split('\n');
  return lineArray.map((line, i) =>
    `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/><w:spacing w:before="${i === 0 ? 100 : 0}" w:after="${i === lineArray.length - 1 ? 120 : 0}" w:line="260" w:lineRule="auto"/><w:ind w:left="200" w:right="200"/></w:pPr>${runXml(line, { mono: true, size: 18, color: '0F172A' })}</w:p>`
  ).join('');
}

function tableXml(headers, rows) {
  if (!headers || !headers.length) return '';
  const colWidth = Math.floor(9200 / headers.length);
  const gridCols = headers.map(() => `<w:gridCol w:w="${colWidth}"/>`).join('');
  const headerCells = headers.map(h =>
    `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="103454"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${paragraphXml([runXml(h, { bold: true, color: 'FFFFFF', size: 19 })], { spaceBefore: 20, spaceAfter: 20, line: 260 })}</w:tc>`
  ).join('');
  const bodyRows = rows.map((row, idx) => {
    const fill = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
    const cells = headers.map((_, colIdx) => {
      const val = Array.isArray(row) ? row[colIdx] : row[headers[colIdx]];
      return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${paragraphXml([runXml(String(val ?? '—'), { color: '1E293B', size: 18, bold: colIdx === 0 })], { spaceBefore: 20, spaceAfter: 20, line: 250 })}</w:tc>`;
    }).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/><w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells}</w:tr>${bodyRows}</w:tbl>`;
}

export function buildDocxBuffer({ title, subtitle = '', metadata = [], metadataHeaders = ['项目属性', '详细内容'], sections = [] }) {
  const parts = [];

  parts.push(paragraphXml([runXml(title, { bold: true, size: 36, color: '0F2942' })], { spaceBefore: 40, spaceAfter: 60, line: 360 }));
  if (subtitle) {
    parts.push(paragraphXml([runXml(subtitle, { size: 22, color: '475569' })], { spaceBefore: 0, spaceAfter: 180, line: 300, borderBottom: true }));
  }

  if (metadata && metadata.length) {
    parts.push(tableXml(metadataHeaders, metadata));
    parts.push(paragraphXml('', { spaceBefore: 40, spaceAfter: 40 }));
  }

  for (const sec of sections) {
    if (sec.heading) {
      parts.push(paragraphXml([runXml(sec.heading, { bold: true, size: 26, color: '103454' })], { spaceBefore: 240, spaceAfter: 100, line: 320, borderBottom: true }));
    }
    if (sec.subheading) {
      parts.push(paragraphXml([runXml(sec.subheading, { bold: true, size: 22, color: '1D4ED8' })], { spaceBefore: 160, spaceAfter: 80, line: 300 }));
    }
    if (sec.paragraphs) {
      for (const p of sec.paragraphs) {
        parts.push(paragraphXml([runXml(p, { size: 21, color: '1E293B' })], { spaceBefore: 60, spaceAfter: 100, line: 310 }));
      }
    }
    if (sec.bullets) {
      for (const b of sec.bullets) {
        if (typeof b === 'object' && b.lead) {
          parts.push(paragraphXml([
            runXml('• ', { bold: true, color: '1263A6', size: 21 }),
            runXml(`${b.lead}：`, { bold: true, color: '0F2942', size: 21 }),
            runXml(b.text, { color: '1E293B', size: 20 })
          ], { spaceBefore: 40, spaceAfter: 70, line: 300, leftIndent: 240 }));
        } else {
          parts.push(paragraphXml([
            runXml('• ', { bold: true, color: '1263A6', size: 21 }),
            runXml(String(b), { color: '1E293B', size: 20 })
          ], { spaceBefore: 40, spaceAfter: 70, line: 300, leftIndent: 240 }));
        }
      }
    }
    if (sec.steps) {
      sec.steps.forEach((step, idx) => {
        if (typeof step === 'object' && step.lead) {
          parts.push(paragraphXml([
            runXml(`${idx + 1}. `, { bold: true, color: '1263A6', size: 21 }),
            runXml(`${step.lead}：`, { bold: true, color: '0F2942', size: 21 }),
            runXml(step.text, { color: '1E293B', size: 20 })
          ], { spaceBefore: 50, spaceAfter: 80, line: 300, leftIndent: 240 }));
        } else {
          parts.push(paragraphXml([
            runXml(`${idx + 1}. `, { bold: true, color: '1263A6', size: 21 }),
            runXml(String(step), { color: '1E293B', size: 20 })
          ], { spaceBefore: 50, spaceAfter: 80, line: 300, leftIndent: 240 }));
        }
      });
    }
    if (sec.code) {
      parts.push(codeBlockXml(sec.code));
    }
    if (sec.table) {
      parts.push(tableXml(sec.table.headers, sec.table.rows));
      parts.push(paragraphXml('', { spaceBefore: 40, spaceAfter: 60 }));
    }
    if (sec.callout) {
      parts.push(calloutXml(sec.callout.title, sec.callout.text, sec.callout));
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join('\n')}
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
  <dc:title>${xmlEsc(title)}</dc:title>
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

  return createZipBuffer([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: relsXml },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'docProps/app.xml', data: appXml },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/_rels/document.xml.rels', data: docRelsXml }
  ]);
}
