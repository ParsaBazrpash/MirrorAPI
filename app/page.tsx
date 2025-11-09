"use client";
import { useState } from "react";
import { diffSchemas, type DiffReport } from "@/lib/diff";
import { scoreDiff } from "@/lib/score";

type DiffLine = { type: "added" | "removed" | "unchanged"; oldLine?: string; newLine?: string; oldNum?: number; newNum?: number };

function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

// Simple LCS-based diff algorithm
function computeLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp;
}

function generateDiffLines(oldJson: any, newJson: any): DiffLine[] {
  const oldStr = formatJson(oldJson);
  const newStr = formatJson(newJson);
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  
  const dp = computeLCS(oldLines, newLines);
  
  // Backtrack to build diff
  let i = oldLines.length;
  let j = newLines.length;
  const result: DiffLine[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: "unchanged",
        oldLine: oldLines[i - 1],
        newLine: newLines[j - 1],
        oldNum: i,
        newNum: j
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: "added",
        newLine: newLines[j - 1],
        newNum: j
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      result.unshift({
        type: "removed",
        oldLine: oldLines[i - 1],
        oldNum: i
      });
      i--;
    }
  }
  
  return result;
}

export default function Page() {
  const [oldUrl,setOldUrl]=useState(""); const [newUrl,setNewUrl]=useState("");
  const [oldFile,setOldFile]=useState<File|null>(null); const [newFile,setNewFile]=useState<File|null>(null);
  const [oldJson,setOldJson]=useState<any>(null); const [newJson,setNewJson]=useState<any>(null);
  const [report,setReport]=useState<DiffReport|null>(null); const [score,setScore]=useState<number| null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState<string| null>(null);
  const [showDiff,setShowDiff]=useState(false);

  const loadJsonFromFile = async (f:File)=>JSON.parse(await f.text());
  const loadJsonFromUrl = async (url:string)=>{ const r=await fetch(`/api/fetch?url=${encodeURIComponent(url)}`); if(!r.ok) throw new Error(`Fetch ${r.status}`); return r.json(); };

  async function analyze(){
    setError(null); setLoading(true); setShowDiff(false);
    try{
      const old = oldFile ? await loadJsonFromFile(oldFile) : oldUrl ? await loadJsonFromUrl(oldUrl) : null;
      const new_ = newFile ? await loadJsonFromFile(newFile) : newUrl ? await loadJsonFromUrl(newUrl) : null;
      if(!old||!new_) throw new Error("Provide both OLD and NEW (file or URL).");
      setOldJson(old); setNewJson(new_);
      const diff = diffSchemas(old,new_); const s = scoreDiff(diff);
      setReport(diff); setScore(s);
    }catch(e:any){ setError(e.message||"Analysis failed"); } finally{ setLoading(false); }
  }

  function loadSamples(){ setOldUrl("/samples/v1.json"); setNewUrl("/samples/v2.json"); }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">API Migration Copilot </h1>
          <button onClick={loadSamples} className="rounded border px-3 py-1 text-sm">Load samples</button>
        </header>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Old API (URL or file)</label>
              <input className="w-full rounded border p-2" placeholder="https://restcountries.com/v2/name/japan"
                     value={oldUrl} onChange={e=>setOldUrl(e.target.value)} />
              <input type="file" accept="application/json" onChange={e=>setOldFile(e.target.files?.[0]||null)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New API (URL or file)</label>
              <input className="w-full rounded border p-2" placeholder="https://restcountries.com/v3.1/name/japan"
                     value={newUrl} onChange={e=>setNewUrl(e.target.value)} />
              <input type="file" accept="application/json" onChange={e=>setNewFile(e.target.files?.[0]||null)} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={analyze} disabled={loading} className="rounded-xl bg-black px-4 py-2 text-white">
              {loading?"Analyzing…":"Analyze"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>

        {oldJson && newJson && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">JSON Preview</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-slate-600 mb-2">Old JSON</div>
                <pre className="overflow-auto max-h-96 rounded border bg-slate-50 p-3 text-xs font-mono">
                  {formatJson(oldJson)}
                </pre>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600 mb-2">New JSON</div>
                <pre className="overflow-auto max-h-96 rounded border bg-slate-50 p-3 text-xs font-mono">
                  {formatJson(newJson)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {report && typeof score==="number" && (
          <>
            <div className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
              <div>
                <div className="text-sm text-slate-500">Migration Risk</div>
                <div className="text-2xl font-bold">{score}/100</div>
              </div>
              <div className="flex gap-6 text-sm">
                <div>Added <span className="font-semibold">{report.summary.added}</span></div>
                <div>Removed <span className="font-semibold">{report.summary.removed}</span></div>
                <div>Risky <span className="font-semibold">{report.summary.risky}</span></div>
              </div>
              <span className={`rounded-full px-3 py-1 text-white ${
                score<31?"bg-emerald-600":score<71?"bg-amber-500":"bg-rose-600"
              }`}>{score<31?"Low":score<71?"Medium":"High"}</span>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="flex items-center justify-between bg-slate-50 p-3 border-b">
                <h2 className="text-lg font-semibold">Change Summary</h2>
                <button 
                  onClick={() => setShowDiff(!showDiff)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showDiff ? "Hide" : "Show"} GitHub-style Diff
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr><th className="p-3 text-left">Path</th><th className="p-3 text-left">Change</th><th className="p-3 text-left">Details</th></tr>
                </thead>
                <tbody>
                  {report.changes.map((c,i)=>(
                    <tr key={i} className="border-t">
                      <td className="p-3 font-mono">{(c as any).path}</td>
                      <td className="p-3">{c.kind}</td>
                      <td className="p-3">
                        {"oldType" in c && "newType" in c ? `${(c as any).oldType} → ${(c as any).newType}` :
                         "oldType" in c ? (c as any).oldType :
                         "newType" in c ? (c as any).newType : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showDiff && oldJson && newJson && (
              <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="bg-slate-50 p-3 border-b">
                  <h2 className="text-lg font-semibold">GitHub-style Diff View</h2>
                </div>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-2">
                    <div className="border-r">
                      <div className="bg-red-50 text-xs font-semibold px-4 py-2 border-b text-red-900 sticky top-0">Old JSON</div>
                      <div className="font-mono text-xs">
                        {generateDiffLines(oldJson, newJson).map((line, i) => (
                          <div
                            key={i}
                            className={`px-4 py-0.5 flex items-start min-h-[20px] ${
                              line.type === "removed" ? "bg-red-50 text-red-900" : "bg-white"
                            }`}
                          >
                            <span className="text-slate-400 mr-4 select-none w-10 text-right shrink-0">
                              {line.type === "removed" || line.type === "unchanged" ? line.oldNum : ""}
                            </span>
                            <span className={`mr-2 select-none shrink-0 ${
                              line.type === "removed" ? "text-red-600" : "text-transparent"
                            }`}>-</span>
                            <span className="flex-1 break-all">{line.type !== "added" ? (line.oldLine || "") : "\u00A0"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="bg-green-50 text-xs font-semibold px-4 py-2 border-b text-green-900 sticky top-0">New JSON</div>
                      <div className="font-mono text-xs">
                        {generateDiffLines(oldJson, newJson).map((line, i) => (
                          <div
                            key={i}
                            className={`px-4 py-0.5 flex items-start min-h-[20px] ${
                              line.type === "added" ? "bg-green-50 text-green-900" : "bg-white"
                            }`}
                          >
                            <span className="text-slate-400 mr-4 select-none w-10 text-right shrink-0">
                              {line.type === "added" || line.type === "unchanged" ? line.newNum : ""}
                            </span>
                            <span className={`mr-2 select-none shrink-0 ${
                              line.type === "added" ? "text-green-600" : "text-transparent"
                            }`}>+</span>
                            <span className="flex-1 break-all">{line.type !== "removed" ? (line.newLine || "") : "\u00A0"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}