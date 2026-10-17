import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));

async function freePort() {
  const socket=createServer();
  await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}

test('analysis deletion, streaming progress, multi-cell comparison, timestamp and Word (.docx) report export', async t=>{
  const data=await mkdtemp(join(tmpdir(),'sequence-evidence-delete-'));
  const port=await freePort();
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),WORKBENCH_DATA_DIR:data},stdio:'ignore'});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  t.after(async()=>{child.kill();await exited;await rm(data,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try { const response=await fetch(`${base}/api/state`); if(response.ok){ready=true;break;} }
    catch {}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready,'isolated server should start');
  const call=async(path,method='GET',body,extraHeaders={})=>{
    const response=await fetch(`${base}${path}`,{method,body,headers:body?{'Content-Type':'text/plain',...extraHeaders}:extraHeaders});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const upload=async(kind,name,body,query='')=>{
    const response=await call(`/api/upload?kind=${kind}&name=${name}${query}`,'POST',body);
    assert.equal(response.status,201);
    return response.data;
  };
  const assembly=await upload('assembly','example.fa','>example_contig\nTTTACGTAACCCGGATCCGATCAGTTACCGGATAACCTTGATCGATCCG\n');
  const annotation=await upload('trna','example.out','example_contig 1 4 32 Lys TTT 0 0 55.0\n');
  const reads=await upload('reads','example.fastq','@read1\nACGTAACCCGGATCC\n+\nIIIIIIIIIIIIIII\n',`&strainId=${assembly.id}&processingStatus=processed`);

  // Test streaming NDJSON progress on /api/trna
  const streamRes = await fetch(`${base}/api/trna`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stream-Progress': '1' },
    body: JSON.stringify({ assemblyId: assembly.id, annotationId: annotation.id })
  });
  assert.equal(streamRes.status, 200);
  const streamText = await streamRes.text();
  const events = streamText.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.some(e => e.type === 'progress' && e.percent > 0), 'Should emit real-time progress events');
  const trnaResultEvent = events.find(e => e.type === 'result');
  assert.ok(trnaResultEvent, 'Should emit final result event');
  const trna = { status: trnaResultEvent.status, data: trnaResultEvent.data };
  assert.equal(trna.status, 201);
  assert.match(trna.data.display_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'Should include date and time');
  assert.match(trna.data.downloadNames.report, /^步骤1_tRNA扫描-example-\d{8}_\d{6}\.docx$/, 'Report filename should follow 步骤-名称-结果时间.docx');

  // Test Word (.docx) report download
  const reportRes = await fetch(`${base}/api/analyses/${trna.data.id}/report`);
  assert.equal(reportRes.status, 200);
  assert.match(reportRes.headers.get('content-type') || '', /wordprocessingml\.document/);
  assert.match(decodeURIComponent(reportRes.headers.get('content-disposition') || ''), /步骤1_tRNA扫描-example-\d{8}_\d{6}\.docx/);
  const reportBuf = Buffer.from(await reportRes.arrayBuffer());
  assert.equal(reportBuf.slice(0, 2).toString('ascii'), 'PK', 'Report must be a valid ZIP/DOCX container');

  // Test multi-cell comparison with 3 custom-named host cell lines
  const de1 = await upload('de', 'cell1.csv', 'gene_id,log2FoldChange,padj\nMAP3K7,-1.5,0.001\n', `&strainId=${assembly.id}&cellLine=细胞系 1`);
  const de2 = await upload('de', 'cell2.csv', 'gene_id,log2FoldChange,padj\nMAP3K7,-1.2,0.002\n', `&strainId=${assembly.id}&cellLine=细胞系 2`);
  const de3 = await upload('de', 'cell3.csv', 'gene_id,log2FoldChange,padj\nMAP3K7,-1.8,0.003\n', `&strainId=${assembly.id}&cellLine=THP-1`);
  const multiCells = await call('/api/compare-cells', 'POST', JSON.stringify({
    cellLineItems: [
      { id: de1.id, label: '细胞系 1' },
      { id: de2.id, label: '细胞系 2' },
      { id: de3.id, label: 'THP-1' }
    ],
    fdr: 0.05,
    minAbsLog2FC: 1
  }));
  assert.equal(multiCells.status, 201);
  assert.deepEqual(multiCells.data.cellLabels, ['细胞系 1', '细胞系 2', 'THP-1']);
  assert.equal(multiCells.data.matches[0].direction, '共同下调');

  const tsrna=await call('/api/tsrna','POST',JSON.stringify({trnaId:trna.data.id,readsId:reads.id,minLength:10,maxLength:50}));
  assert.equal(tsrna.status,201);

  const blocked=await call(`/api/analyses/${trna.data.id}`,'DELETE');
  assert.equal(blocked.status,400);
  assert.match(blocked.data.error,/先删除后续分析记录/);
  assert.equal((await call('/api/state')).data.analyses.length,3);

  assert.equal((await call(`/api/analyses/${tsrna.data.id}`,'DELETE')).data.deleted,1);
  assert.equal((await call(`/api/analyses/${tsrna.data.id}`)).status,404);
  assert.equal((await call('/api/analyses','DELETE')).data.deleted,2);
  const state=(await call('/api/state')).data;
  assert.equal(state.analyses.length,0);
  assert.equal(state.uploads.length,6);
});
