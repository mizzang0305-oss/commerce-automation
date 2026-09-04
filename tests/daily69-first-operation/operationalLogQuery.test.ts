import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { operationalLogScript, parseSanitizedEvents } from "../../scripts/daily69-first-operation/bind-task-events";

describe("bounded Task Scheduler event query", () => {
  it("retains timeout/output guards and uses a read-only non-PowerShell event loop", async () => {
    const source = await readFile("scripts/daily69-first-operation/bind-task-events.ts", "utf8");
    const helper = await readFile("scripts/daily69-first-operation/operational-log-query.cs", "utf8");
    expect(source).toContain("timeout: 45_000, maxBuffer: 4 * 1024 * 1024");
    expect(source.indexOf('failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"')).toBeLessThan(source.indexOf("if (failure.killed)"));
    expect(helper).toContain("new EventLogReader(query)");
    expect(helper).toContain("using (record)");
    expect(helper).toContain("records.Count > 20000");
    expect(helper).toContain("Encoding.UTF8.GetByteCount(json) > OutputLimitBytes");
    expect(helper).toContain("DtdProcessing.Prohibit");
    expect(helper).not.toMatch(/ClearLog|ExportLog|Register-ScheduledTask|Start-ScheduledTask|Process.Start/u);
  });

  it("filters Finalizer-only queries without broadening to the earlier three tasks", () => {
    const script = operationalLogScript("2099-01-01", "2099-01-02", ["Minz-Commerce-Daily69-Finalizer-NoUpload-V1"]);
    expect(script).toContain("Minz-Commerce-Daily69-Finalizer-NoUpload-V1");
    expect(script).not.toMatch(/ControlRunner|VideoBatch|Daily69-Closeout/u);
    expect(() => operationalLogScript("2099-01-01", "2099-01-02", ["quoted' task"])).toThrow("TASK_SCHEDULER_QUERY_TASK_INVALID");
  });

  it("validates all typed event fields before binding", () => {
    const base = { eventRecordId: 1, eventId: 129, timeCreatedUtc: "2099-01-01T00:00:00Z", taskName: "Test", taskInstanceId: "", processId: 10 };
    expect(parseSanitizedEvents(JSON.stringify([base]))).toEqual([base]);
    expect(parseSanitizedEvents(JSON.stringify({ ...base, taskInstanceId: null }))).toEqual([base]);
    for (const change of [{ processId: "10" }, { eventId: 999 }, { eventRecordId: 0 }, { principalSidSha256: "raw-account" }, { timeCreatedUtc: "not-a-time" }]) {
      expect(() => parseSanitizedEvents(JSON.stringify([{ ...base, ...change }]))).toThrow("TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID");
    }
  });
});

describe.skipIf(process.platform !== "win32")("native Windows PowerShell 5.1 EventLogReader", () => {
  it("returns an empty event array, not a query failure, for a future-clock window", () => {
    const output = run(operationalLogScript("2099-01-01T00:00:00Z", "2099-01-02T00:00:00Z"));
    expect(parseSanitizedEvents(output)).toEqual([]);
  });

  it("projects adjacent XML fields, zero/hex results, instance-less129 and hashed principals without leakage", () => {
    const helper = resolve("scripts/daily69-first-operation/operational-log-query.cs").split("'").join("''");
    const output = run(`
Add-Type -LiteralPath '${helper}' -ReferencedAssemblies 'System.Core','System.Xml','System.Web.Extensions'
$cache=New-Object 'Collections.Generic.Dictionary[string,string]'
$cache.Add('TEST\\ACCOUNT','${"a".repeat(64)}')
$date=[datetime]::Parse('2099-01-01T00:00:00Z').ToUniversalTime()
$prefix='<Event><EventData><Data Name="TaskName">\\Test</Data>'
$process=[Daily69OperationalLogQuery]::Project(($prefix+'<Data Name="ProcessID">42</Data><Data Name="Unrelated">never-serialize-this</Data></EventData></Event>'),1,129,$date,$cache)
$complete=[Daily69OperationalLogQuery]::Project(($prefix+'<Data Name="TaskInstanceId">instance</Data><Data Name="EnginePID">42</Data><Data Name="ResultCode">0x80070003</Data></EventData></Event>'),2,201,$date,$cache)
$started=[Daily69OperationalLogQuery]::Project(($prefix+'<Data Name="InstanceId">instance</Data><Data Name="UserContext">TEST\\ACCOUNT</Data></EventData></Event>'),3,100,$date,$cache)
$zero=[Daily69OperationalLogQuery]::Project(($prefix+'<Data Name="InstanceId">instance</Data><Data Name="ResultCode">0</Data></EventData></Event>'),4,102,$date,$cache)
$serializer=New-Object Web.Script.Serialization.JavaScriptSerializer
[Console]::Out.Write($serializer.Serialize(@($process,$complete,$started,$zero)))
`);
    const result = parseSanitizedEvents(output);
    expect(result[0]).toMatchObject({ taskInstanceId: "", processId: 42 });
    expect(result[1]).toMatchObject({ taskInstanceId: "instance", processId: 42, resultCode: 2147942403 });
    expect(result[2]).toMatchObject({ principalSidSha256: "a".repeat(64), taskInstanceId: "instance" });
    expect(result[3]).toMatchObject({ resultCode: 0 });
    expect(output).not.toMatch(/ACCOUNT|never-serialize-this|UserContext|Unrelated/u);
  });
});

function run(script: string) {
  return execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${script}`], {
    encoding: "utf8", windowsHide: true, timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
  }).trim();
}
