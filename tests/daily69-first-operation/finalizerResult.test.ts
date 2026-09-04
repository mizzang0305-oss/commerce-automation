import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { auditFinalizerResult, classifyFinalizerResultProvenance, isFinalizerResult, type FinalizerResult, type FinalizerTaskContract } from "../../src/lib/daily69-first-operation/finalizerResult";
import { operationalLogScript } from "../../scripts/daily69-first-operation/bind-task-events";
import type { SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const identity = { namespace:"operation-2099-01-01-attempt-2", operationDate:"2099-01-01", expectedGitHead:"a".repeat(40) };
function fixture() {
  const result: FinalizerResult = {
    schemaVersion:"daily69-finalizer-result-v1", resultId:"b".repeat(32), ...identity, actualGitHead:identity.expectedGitHead,
    taskName:"Minz-Commerce-Daily69-Finalizer-NoUpload-V1",processId:4242,
    startedAt:"2099-01-01T16:05:00.500Z",finishedAt:"2099-01-01T16:05:01.500Z",
    childExitCode:0,wrapperExitCode:0,outcome:"success",safeError:"",
    outputSha256:"c".repeat(64),principalSidSha256:"d".repeat(64),taskActionSha256:"e".repeat(64),SAFE_TO_UPLOAD:false,PLATFORM_UPLOAD:0,
  };
  const contract:FinalizerTaskContract={schemaVersion:"daily69-finalizer-task-contract-v1",...identity,taskName:result.taskName,principalSidSha256:result.principalSidSha256,taskActionSha256:result.taskActionSha256};
  const events:SanitizedTaskSchedulerEvent[]=[107,129,100,200,201,102].map((eventId,index)=>({
    eventRecordId:100+index,eventId,taskName:result.taskName,taskInstanceId:eventId===129?"":"instance-1",
    timeCreatedUtc:"2099-01-01T16:05:"+ (eventId===201||eventId===102?"02":"00") + ".000Z",
    ...([129,200,201].includes(eventId)?{processId:4242}:{}),
    ...(eventId===201?{resultCode:0}:{}),
    ...([100,102].includes(eventId)?{principalSidSha256:result.principalSidSha256}:{}),
  }));
  return {result,contract,events};
}
describe("post-exit Finalizer result contract",()=>{
  it("binds a successful exact result only after Task completion events",()=>{
    const {result,contract,events}=fixture();
    expect(isFinalizerResult(result)).toBe(true);
    expect(classifyFinalizerResultProvenance(result,contract,identity,events)).toMatchObject({classification:"natural_scheduled"});
    expect(classifyFinalizerResultProvenance(result,contract,identity,events.filter(e=>![201,102].includes(e.eventId))).classification).toBe("unknown");
  });
  it.each(["pid","namespace","sha","principal","action","manual","missing","failure","extra-field"] as const)("rejects %s substitution",kind=>{
    const {result,contract,events}=fixture();
    if(kind==="pid") result.processId++;
    if(kind==="namespace") result.namespace="operation-2099-01-02";
    if(kind==="sha") result.actualGitHead="f".repeat(40);
    if(kind==="principal") events.find(e=>e.eventId===100)!.principalSidSha256="f".repeat(64);
    if(kind==="action") result.taskActionSha256="f".repeat(64);
    if(kind==="manual") events.push({...events[0],eventRecordId:500,eventId:110});
    if(kind==="missing") events.pop();
    if(kind==="failure"){result.wrapperExitCode=3;result.outcome="failed";result.safeError="EXACT_SAFE_ERROR";}
    if(kind==="extra-field") Object.assign(result,{productName:"must never be retained"});
    expect(classifyFinalizerResultProvenance(result,contract,identity,events).classification).toBe("unknown");
  });
  it.each([4242, 5252])("rejects a second Task instance even when its process is %s", processId => {
    const {result,contract,events}=fixture();
    const second=events.map(event=>({...event,eventRecordId:event.eventRecordId+1000,taskInstanceId:event.eventId===129?"":"instance-2",...([129,200,201].includes(event.eventId)?{processId}:{})}));
    expect(classifyFinalizerResultProvenance(result,contract,identity,[...events,...second])).toMatchObject({classification:"unknown",reason:"DAILY69_FINALIZER_TASK_INSTANCE_AMBIGUOUS"});
  });
  it.each(["", "orphan-manual-instance"])("rejects an orphan manual trigger with instance '%s' before chain selection", taskInstanceId => {
    const {result,contract,events}=fixture();
    const manual={...events[0],eventRecordId:999,eventId:110,taskInstanceId};
    expect(classifyFinalizerResultProvenance(result,contract,identity,[...events,manual])).toMatchObject({classification:"unknown",reason:"DAILY69_FINALIZER_MANUAL_TRIGGER"});
  });
  it("rejects duplicated events in the same Task instance and inverted process boundaries",()=>{
    const {result,contract,events}=fixture();
    expect(classifyFinalizerResultProvenance(result,contract,identity,[...events,{...events[0],eventRecordId:999}]).classification).toBe("unknown");
    expect(classifyFinalizerResultProvenance({...result,startedAt:"2099-01-01T16:04:59Z"},contract,identity,events).classification).toBe("unknown");
    expect(classifyFinalizerResultProvenance({...result,finishedAt:"2099-01-01T16:05:03Z"},contract,identity,events).classification).toBe("unknown");
  });
  it("keeps an immutable digest binding and detects rewritten result bytes",async()=>{
    const base=await mkdtemp(join(tmpdir(),"daily69-finalizer-test-"));roots.push(base);
    const root=join(base,identity.namespace);await mkdir(join(root,"finalizer-results"),{recursive:true});await mkdir(join(root,"task-definitions"));
    const {result,contract,events}=fixture();
    const path=join(root,"finalizer-results",result.resultId+".json");
    await writeFile(path,JSON.stringify(result));
    await writeFile(join(root,"task-definitions","finalizer-task-contract.json"),JSON.stringify(contract));
    expect((await auditFinalizerResult(root,identity,events)).state).toBe("PASS");
    expect((await auditFinalizerResult(root,identity,events)).state).toBe("PASS");
    await writeFile(path,JSON.stringify({...result,outputSha256:"f".repeat(64)}));
    expect(await auditFinalizerResult(root,identity,events)).toMatchObject({state:"FAIL",reason:"DAILY69_FINALIZER_BINDING_CONFLICT"});
  });
  it("does not require finalizer evidence inside pre-finalizer binder",async()=>{
    const source=await readFile(resolve("src/lib/daily69-first-operation/postCloseout.ts"),"utf8");
    const binder=source.slice(source.indexOf("export async function bindRetainedTaskEvents"),source.indexOf("export async function retainedExecutionTimeBounds"));
    expect(binder).not.toMatch(/auditFinalizerResult|finalizer-results/);
    const finalize=await readFile(resolve("scripts/daily69-first-operation/finalize-natural-closeout.ts"),"utf8");
    expect(finalize).not.toMatch(/auditFinalizerResult|finalizer-results/);
  });
  it("bounds and filters the real Windows event query without quadratic array append",()=>{
    const script=operationalLogScript("2099-01-01T00:00:00Z","2099-01-02T00:00:00Z");
    expect(script).toContain("Data[@Name='TaskName']='\\Minz-Commerce-VideoBatch-NoUpload-V1'");
    expect(script).toContain("[Daily69OperationalLogQuery]::Read($xpath)");
    expect(script).toContain("operational-log-query.cs");
    expect(script).not.toContain("$result +=");
    expect(script).toContain("DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT");
    expect(()=>operationalLogScript("invalid","2099-01-01")).toThrow();
    expect(()=>operationalLogScript("2099-01-01","2099-01-02",["bad' task"])).toThrow("TASK_SCHEDULER_QUERY_TASK_INVALID");
  });
});
describe.skipIf(process.platform!=="win32")("Windows PowerShell 5.1 durable Finalizer projection",()=>{
  function run(script:string){
    const prefix="$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; . '"+resolve("scripts/daily69-first-operation/finalizer-result.ps1").split("'").join("''")+"'; ";
    return JSON.parse(execFileSync("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(prefix+script,"utf16le").toString("base64")],{encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:4*1024*1024}).trim());
  }
  it.each([
    {exit:0,value:{event:"daily69_natural_closeout_finalized",completion:"PASS",SAFE_TO_UPLOAD:false,PLATFORM_UPLOAD:0},outcome:"success",code:""},
    {exit:2,value:{event:"daily69_natural_closeout_finalizer_failed",safeError:"DAILY69_TASK_EVENTS_PENDING",SAFE_TO_UPLOAD:false,PLATFORM_UPLOAD:0},outcome:"pending",code:"DAILY69_TASK_EVENTS_PENDING"},
    {exit:3,value:{event:"daily69_natural_closeout_finalizer_failed",safeError:"EXACT_CHILD_ERROR",SAFE_TO_UPLOAD:false,PLATFORM_UPLOAD:0},outcome:"failed",code:"EXACT_CHILD_ERROR"},
    {exit:0,value:{event:"wrong"},outcome:"failed",code:"DAILY69_FINALIZER_CHILD_OUTPUT_INVALID"},
  ])("preserves $outcome child result and exact safe error",({exit,value,outcome,code})=>{
    const line=JSON.stringify(value).split("'").join("''");
    expect(run("ConvertTo-Daily69FinalizerOutcome -Lines @('"+line+"') -ChildExitCode "+exit+" | ConvertTo-Json -Compress")).toMatchObject({outcome,safeError:code});
  });
  it("rejects malformed child output safely",()=>{
    expect(run("ConvertTo-Daily69FinalizerOutcome -Lines @('not-json secret=value') -ChildExitCode 3 | ConvertTo-Json -Compress")).toEqual({outcome:"failed",safeError:"DAILY69_FINALIZER_CHILD_OUTPUT_INVALID",wrapperExitCode:3});
  });
  function capture(code:string,timeout:number){
    const encoded=Buffer.from(code,"utf8").toString("base64");
    return run(`$s=New-Object Diagnostics.ProcessStartInfo; $s.FileName=(Get-Command node.exe).Source; $s.Arguments='-e "eval(Buffer.from(''${encoded}'',''base64'').toString())"'; $s.UseShellExecute=$false; $s.CreateNoWindow=$true; $s.RedirectStandardOutput=$true; $s.RedirectStandardError=$true; $s.StandardOutputEncoding=[Text.UTF8Encoding]::new($false); $s.StandardErrorEncoding=[Text.UTF8Encoding]::new($false); $p=New-Object Diagnostics.Process; $p.StartInfo=$s; $clock=[Diagnostics.Stopwatch]::StartNew(); $r=Receive-Daily69FinalizerProcess -Process $p -TimeoutMilliseconds ${timeout}; @{result=$r;elapsedMs=$clock.ElapsedMilliseconds}|ConvertTo-Json -Depth 5 -Compress`);
  }
  it("captures successful UTF-8 output with a digest using bounded stream reads",()=>{
    expect(capture("process.stdout.write('bounded-result');process.stderr.write('bounded-error')",2000)).toMatchObject({result:{childExitCode:0,safeError:"",lines:["bounded-result","bounded-error"]}});
  });
  it("returns a safe timeout without an unbounded WaitForExit or pending stream Result",()=>{
    const observed=capture("setTimeout(()=>{},10000)",150);
    expect(observed.result).toMatchObject({safeError:"DAILY69_FINALIZER_CHILD_TIMEOUT",lines:[]});
    expect(observed.elapsedMs).toBeLessThan(5000);
  });
  it("returns within the deadline after a parent exits while its descendant remains alive",async()=>{
    const root=await mkdtemp(join(tmpdir(),"daily69-finalizer-parent-exit-"));roots.push(root);
    const marker=join(root,"parent-exit.json");
    // IPC readiness, not a 50ms guess, proves the descendant has initialized
    // before its parent exits. The old 500ms capture budget included two cold
    // Node starts and could correctly kill the parent under four-worker load.
    const descendant="process.stdout.write('child-open');process.send({ready:true,pid:process.pid});setTimeout(()=>process.stdout.write('child-close'),8000)";
    const code=`const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});c.once('message',m=>{if(m.ready){require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({descendantReady:true,parentPid:process.pid,descendantPid:m.pid}));process.exit(0)}})`;
    const observed=capture(code,3000);
    const proof=JSON.parse(await readFile(marker,"utf8"));
    expect(proof.descendantReady).toBe(true);
    expect(proof.parentPid).toBeGreaterThan(0);
    expect(proof.descendantPid).toBeGreaterThan(0);
    expect(proof.parentPid).not.toBe(proof.descendantPid);
    expect(observed.result.childExitCode).toBe(0);
    // Windows may close the inherited handles with the parent. Either EOF or
    // the bounded timeout is valid; waiting for the descendant is not.
    expect(["", "DAILY69_FINALIZER_CHILD_TIMEOUT"]).toContain(observed.result.safeError);
    expect(observed.result.lines).not.toContain("child-close");
    expect(observed.elapsedMs).toBeLessThan(5000);
  });
  it("bounds output while the child is still running instead of buffering it to completion",()=>{
    const observed=capture("process.stdout.write('x'.repeat(5*1024*1024));setTimeout(()=>{},10000)",5000);
    expect(observed.result).toMatchObject({safeError:"DAILY69_FINALIZER_CHILD_OUTPUT_LIMIT",lines:[]});
    expect(observed.result.outputSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(observed.elapsedMs).toBeLessThan(7000);
  });
  it.each([
    {outcome:"success" as const,code:"",exit:0},
    {outcome:"pending" as const,code:"DAILY69_TASK_EVENTS_PENDING",exit:2},
    {outcome:"failed" as const,code:"EXACT_CHILD_ERROR",exit:3},
  ])("durably writes $outcome create-new only and rejects extra unapproved fields",async({outcome,code,exit})=>{
    const root=await mkdtemp(join(tmpdir(),"daily69-finalizer-write-"));roots.push(root);
    const {result}=fixture();
    Object.assign(result,{outcome,safeError:code,childExitCode:exit,wrapperExitCode:exit});
    const pairs=Object.entries(result).map(([key,value])=>"'"+key+"'="+(typeof value==="boolean"?"$"+value:typeof value==="number"?value:"'"+String(value).split("'").join("''")+"'")).join(";");
    const script="$r=[ordered]@{"+pairs+"}; $d=Write-Daily69FinalizerResult -QueueRoot '"+root+"' -Result $r; $blocked=$false; try { Write-Daily69FinalizerResult -QueueRoot '"+root+"' -Result $r | Out-Null } catch {$blocked=$true}; $r.productName='forbidden'; $extra=$false; try {Write-Daily69FinalizerResult -QueueRoot '"+root+"' -Result $r | Out-Null} catch {$extra=$true}; @{duplicateBlocked=$blocked;extraBlocked=$extra;digest=$d}|ConvertTo-Json -Compress";
    expect(run(script)).toMatchObject({duplicateBlocked:true,extraBlocked:true});
    expect(JSON.parse(await readFile(join(root,"finalizer-results",result.resultId+".json"),"utf8"))).toEqual(result);
  });
});
