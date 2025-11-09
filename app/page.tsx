"use client";
import { useState } from "react";
import Image from "next/image";
import { diffSchemas, type DiffReport } from "@/lib/diff";
import { scoreDiff } from "@/lib/score";

function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

// Get highlight class for a path based on diff report
function getHighlightClass(path: string, report: DiffReport | null, isOld: boolean): string {
  if (!report) return "";
  
  const change = report.changes.find(c => (c as any).path === path);
  if (!change) return "";
  
  if (change.kind === "REMOVED_FIELD") {
    return isOld ? "bg-red-50 border-l-4 border-[#D62311] py-1 px-2 -mx-2 rounded-r" : "";
  }
  if (change.kind === "ADDED_FIELD") {
    return isOld ? "" : "bg-green-50 border-l-4 border-green-600 py-1 px-2 -mx-2 rounded-r";
  }
  if (change.kind === "TYPE_CHANGED") {
    return "bg-amber-50 border-l-4 border-amber-600 py-1 px-2 -mx-2 rounded-r";
  }
  return "";
}

// Recursive JSON renderer with highlighting
function renderJsonWithHighlights(
  obj: any, 
  report: DiffReport | null, 
  isOld: boolean, 
  currentPath: string = "", 
  indent: number = 0
): JSX.Element {
  const indentStr = "  ".repeat(indent);
  
  if (obj === null) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    return <span className={highlight}>null</span>;
  }
  
  if (typeof obj === "string") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    return <span className={highlight}>{JSON.stringify(obj)}</span>;
  }
  
  if (typeof obj === "number" || typeof obj === "boolean") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    return <span className={highlight}>{String(obj)}</span>;
  }
  
  if (Array.isArray(obj)) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    if (obj.length === 0) {
      return <span className={highlight}>[]</span>;
    }
    return (
      <>
        <span className={highlight}>[</span>
        <br />
        {obj.map((item, i) => (
          <span key={i}>
            <span>{indentStr}  </span>
            {renderJsonWithHighlights(item, report, isOld, `${currentPath}[${i}]`, indent + 1)}
            {i < obj.length - 1 && <span>,</span>}
            <br />
          </span>
        ))}
        <span>{indentStr}</span>
        <span className={highlight}>]</span>
      </>
    );
  }
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    const highlight = getHighlightClass(currentPath, report, isOld);
    
    if (keys.length === 0) {
      return <span className={highlight}>{`{}`}</span>;
    }
    
    return (
      <>
        <span className={highlight}>{`{`}</span>
        <br />
        {keys.map((key, i) => {
          const keyPath = currentPath ? `${currentPath}.${key}` : key;
          const valueHighlight = getHighlightClass(keyPath, report, isOld);
          const hasHighlight = valueHighlight !== "";
          return (
            <span key={key} className={hasHighlight ? `block ${valueHighlight}` : ""}>
              <span>{indentStr}  </span>
              <span className="text-[#003478] font-medium">"{key}"</span>
              <span>: </span>
              {renderJsonWithHighlights(obj[key], report, isOld, keyPath, indent + 1)}
              {i < keys.length - 1 && <span>,</span>}
              <br />
            </span>
          );
        })}
        <span>{indentStr}</span>
        <span className={highlight}>{`}`}</span>
      </>
    );
  }
  
  return <span>{String(obj)}</span>;
}

export default function Page() {
  const [oldUrl,setOldUrl]=useState(""); const [newUrl,setNewUrl]=useState("");
  const [oldFile,setOldFile]=useState<File|null>(null); const [newFile,setNewFile]=useState<File|null>(null);
  const [oldJson,setOldJson]=useState<any>(null); const [newJson,setNewJson]=useState<any>(null);
  const [report,setReport]=useState<DiffReport|null>(null); const [score,setScore]=useState<number| null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState<string| null>(null);

  const loadJsonFromFile = async (f:File)=>JSON.parse(await f.text());
  const loadJsonFromUrl = async (url:string)=>{ const r=await fetch(`/api/fetch?url=${encodeURIComponent(url)}`); if(!r.ok) throw new Error(`Fetch ${r.status}`); return r.json(); };

  async function analyze(){
    setError(null); setLoading(true);
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
    <div className="min-h-screen bg-white">
      {/* Fixed Red Header Bar - StateFarm style */}
      <header className="bg-[#D62311] text-white shadow-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Image 
                src="/samples/logo.png" 
                alt="State Farm Logo" 
                width={40} 
                height={40}
                className="object-contain"
              />
              <h1 className="text-xl font-bold">API Migration Copilot</h1>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={loadSamples}
                className="text-sm hover:underline"
              >
                Load Samples
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Two Column Layout */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Heading */}
            <div>
              <h2 className="text-4xl font-bold text-[#D62311] mb-2">API Schema Migration Analysis</h2>
              <h3 className="text-3xl font-bold text-black mb-4">Compare Your API Versions with Confidence</h3>
              <p className="text-base text-gray-700 leading-relaxed mb-4">
                Analyze and compare API schema changes to identify breaking changes, new fields, and migration risks. 
                Get detailed insights into what's changed between API versions and understand the impact on your integration.
              </p>
              <p className="text-base text-gray-700 leading-relaxed">
                Our migration analysis tool helps you understand schema differences, assess migration risks, and plan your API updates effectively.
              </p>
            </div>

            {/* Results Section - Only show when we have results */}
            {oldJson && newJson && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-2xl font-bold text-[#D62311] mb-3">Schema Comparison</h4>
                  <p className="text-base text-gray-700 mb-4">Side-by-side comparison of your API schemas</p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <h5 className="text-lg font-semibold text-gray-900">JSON Schema Preview</h5>
                      {report && (
                        <div className="flex flex-wrap gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-red-50 border-l-4 border-[#D62311] rounded-r"></span>
                            <span className="text-gray-700 font-medium">Removed</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-green-50 border-l-4 border-green-600 rounded-r"></span>
                            <span className="text-gray-700 font-medium">Added</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-amber-50 border-l-4 border-amber-600 rounded-r"></span>
                            <span className="text-gray-700 font-medium">Risky</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200">Old Schema</div>
                      <div className="overflow-auto max-h-96 rounded border border-gray-200 bg-gray-50 p-3 text-xs font-mono leading-relaxed">
                        {report ? renderJsonWithHighlights(oldJson, report, true) : <pre className="whitespace-pre text-gray-800">{formatJson(oldJson)}</pre>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200">New Schema</div>
                      <div className="overflow-auto max-h-96 rounded border border-gray-200 bg-gray-50 p-3 text-xs font-mono leading-relaxed">
                        {report ? renderJsonWithHighlights(newJson, report, false) : <pre className="whitespace-pre text-gray-800">{formatJson(newJson)}</pre>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {report && typeof score==="number" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-2xl font-bold text-black mb-3">Migration Risk Assessment</h4>
                  <p className="text-base text-gray-700">Comprehensive analysis of schema changes and migration risks</p>
                </div>

                {/* Risk Score Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                      <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Migration Risk Score</div>
                      <div className="flex items-baseline gap-2">
                        <div className="text-5xl font-bold text-gray-900">{score}</div>
                        <div className="text-2xl text-gray-500">/100</div>
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 font-medium mb-1">Added</span>
                        <span className="text-2xl font-bold text-green-600">{report.summary.added}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 font-medium mb-1">Removed</span>
                        <span className="text-2xl font-bold text-[#D62311]">{report.summary.removed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 font-medium mb-1">Risky</span>
                        <span className="text-2xl font-bold text-amber-600">{report.summary.risky}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-flex items-center rounded-full px-6 py-3 text-base font-bold text-white ${
                        score<31?"bg-green-600":score<71?"bg-amber-500":"bg-[#D62311]"
                      }`}>
                        {score<31?"Low Risk":score<71?"Medium Risk":"High Risk"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Change Summary Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-[#D62311] px-6 py-4">
                    <h5 className="text-lg font-semibold text-white">Change Summary</h5>
                    <p className="text-sm text-red-100 mt-1">Detailed breakdown of schema differences</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Path</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Change Type</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Details</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {report.changes.map((c,i)=>(
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs text-gray-900">{(c as any).path}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                c.kind === "REMOVED_FIELD" ? "bg-red-100 text-red-800" :
                                c.kind === "ADDED_FIELD" ? "bg-green-100 text-green-800" :
                                "bg-amber-100 text-amber-800"
                              }`}>
                                {c.kind.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-700">
                              {"oldType" in c && "newType" in c ? (
                                <span className="font-medium">{`${(c as any).oldType} → ${(c as any).newType}`}</span>
                              ) : "oldType" in c ? (
                                <span className="text-red-700 font-medium">{(c as any).oldType}</span>
                              ) : "newType" in c ? (
                                <span className="text-green-700 font-medium">{(c as any).newType}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Form Panel (Light Gray Background) */}
          <div className="lg:col-span-1">
            <div className="bg-gray-100 rounded-lg p-6 sticky top-4">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Ready to analyze your APIs?</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Old API (URL or file)</label>
                  <input 
                    className="w-full rounded border border-gray-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D62311] focus:border-transparent" 
                    placeholder="Enter URL or select file"
                    value={oldUrl} 
                    onChange={e=>setOldUrl(e.target.value)} 
                  />
                  <input 
                    type="file" 
                    accept="application/json" 
                    onChange={e=>setOldFile(e.target.files?.[0]||null)}
                    className="w-full mt-2 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:text-sm file:font-semibold file:bg-white file:text-[#D62311] file:border file:border-[#D62311] hover:file:bg-gray-50 cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">New API (URL or file)</label>
                  <input 
                    className="w-full rounded border border-gray-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D62311] focus:border-transparent" 
                    placeholder="Enter URL or select file"
                    value={newUrl} 
                    onChange={e=>setNewUrl(e.target.value)} 
                  />
                  <input 
                    type="file" 
                    accept="application/json" 
                    onChange={e=>setNewFile(e.target.files?.[0]||null)}
                    className="w-full mt-2 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:text-sm file:font-semibold file:bg-white file:text-[#D62311] file:border file:border-[#D62311] hover:file:bg-gray-50 cursor-pointer"
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded">
                    <span className="text-sm font-medium text-red-800">{error}</span>
                  </div>
                )}

                <button 
                  onClick={analyze} 
                  disabled={loading} 
                  className="w-full py-4 bg-[#D62311] text-white font-bold rounded-lg hover:bg-[#B41D0E] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 text-base"
                >
                  {loading ? "Analyzing…" : "Analyze APIs"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}