"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { diffSchemas, type DiffReport } from "@/lib/diff";
import { scoreDiff } from "@/lib/score";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { UserMenu } from "@/components/auth/user-menu";
import { SignInButton } from "@/components/auth/signin-button";
import { useRouter } from "next/navigation";

function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

// Get highlight class for a path based on diff report
function getHighlightClass(path: string, report: DiffReport | null, isOld: boolean): string {
  if (!report) return "";
  
  const change = report.changes.find(c => (c as any).path === path);
  if (!change) return "";
  
  if (change.kind === "REMOVED_FIELD") {
    return isOld ? "bg-red-100 border-l-4 border-[#D62311] py-0.5 px-2 -mx-2 my-0.5 rounded-r block" : "";
  }
  if (change.kind === "ADDED_FIELD") {
    return isOld ? "" : "bg-green-100 border-l-4 border-green-600 py-0.5 px-2 -mx-2 my-0.5 rounded-r block";
  }
  if (change.kind === "TYPE_CHANGED") {
    return "bg-amber-100 border-l-4 border-amber-600 py-0.5 px-2 -mx-2 my-0.5 rounded-r block";
  }
  return "";
}

// Check if a path or value matches the search query
function matchesSearch(path: string, value: any, searchQuery: string): boolean {
  if (!searchQuery) return false;
  const query = searchQuery.toLowerCase();
  const pathLower = path.toLowerCase();
  const valueStr = String(value).toLowerCase();
  return pathLower.includes(query) || valueStr.includes(query);
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight text with search matches
function highlightSearchText(text: string, searchQuery: string): JSX.Element {
  if (!searchQuery) {
    return <span>{text}</span>;
  }
  
  const query = searchQuery.toLowerCase();
  const textLower = text.toLowerCase();
  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let index = textLower.indexOf(query);
  
  while (index !== -1) {
    // Add text before match
    if (index > lastIndex) {
      parts.push(<span key={lastIndex}>{text.substring(lastIndex, index)}</span>);
    }
    // Add highlighted match
    parts.push(
      <span key={index} className="bg-yellow-200 font-semibold">
        {text.substring(index, index + searchQuery.length)}
      </span>
    );
    lastIndex = index + searchQuery.length;
    index = textLower.indexOf(query, lastIndex);
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
  }
  
  return <span>{parts}</span>;
}

// Recursive JSON renderer with highlighting
function renderJsonWithHighlights(
  obj: any, 
  report: DiffReport | null, 
  isOld: boolean, 
  currentPath: string = "", 
  indent: number = 0,
  searchQuery: string = ""
): JSX.Element {
  const indentStr = "  ".repeat(indent);
  const hasSearchMatch = matchesSearch(currentPath, obj, searchQuery);
  
  if (obj === null) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const searchHighlight = hasSearchMatch ? "bg-yellow-200" : "";
    return <span className={`${highlight} ${searchHighlight}`}>{highlightSearchText("null", searchQuery)}</span>;
  }
  
  if (typeof obj === "string") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const searchHighlight = hasSearchMatch ? "bg-yellow-200" : "";
    const jsonStr = JSON.stringify(obj);
    return <span className={`${highlight} ${searchHighlight}`}>{highlightSearchText(jsonStr, searchQuery)}</span>;
  }
  
  if (typeof obj === "number" || typeof obj === "boolean") {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const searchHighlight = hasSearchMatch ? "bg-yellow-200" : "";
    const str = String(obj);
    return <span className={`${highlight} ${searchHighlight}`}>{highlightSearchText(str, searchQuery)}</span>;
  }
  
  if (Array.isArray(obj)) {
    const highlight = getHighlightClass(currentPath, report, isOld);
    const hasSearchMatch = matchesSearch(currentPath, obj, searchQuery);
    const searchHighlight = hasSearchMatch ? "bg-yellow-200" : "";
    if (obj.length === 0) {
      return <span className={`${highlight} ${searchHighlight}`}>[]</span>;
    }
    return (
      <>
        <span className={`${highlight} ${searchHighlight}`}>[</span>
        <br />
        {obj.map((item, i) => (
          <span key={i}>
            <span>{indentStr}  </span>
            {renderJsonWithHighlights(item, report, isOld, `${currentPath}[${i}]`, indent + 1, searchQuery)}
            {i < obj.length - 1 && <span>,</span>}
            <br />
          </span>
        ))}
        <span>{indentStr}</span>
        <span className={`${highlight} ${searchHighlight}`}>]</span>
      </>
    );
  }
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    const highlight = getHighlightClass(currentPath, report, isOld);
    const hasSearchMatch = matchesSearch(currentPath, obj, searchQuery);
    const searchHighlight = hasSearchMatch ? "bg-yellow-200" : "";
    // Check if this object itself has a TYPE_CHANGED (e.g., changed from string to object)
    const hasTypeChange = report?.changes.some(c => (c as any).path === currentPath && c.kind === "TYPE_CHANGED");
    
    if (keys.length === 0) {
      return <span className={`${highlight} ${searchHighlight}`}>{`{}`}</span>;
    }
    
    // If this object has a TYPE_CHANGED, wrap the entire object content in the highlight
    // This makes it clear that the entire structure changed
    if (hasTypeChange && highlight) {
      return (
        <span className={`${highlight} ${searchHighlight} block`}>
          <span className={`${highlight} ${searchHighlight}`}>{`{`}</span>
          <br />
          {keys.map((key, i) => {
            const keyPath = currentPath ? `${currentPath}.${key}` : key;
            const valueChange = report?.changes.find(c => (c as any).path === keyPath);
            const hasChange = valueChange !== undefined;
            const changeHighlight = hasChange ? getHighlightClass(keyPath, report, isOld) : highlight;
            const keyMatchesSearch = matchesSearch(key, key, searchQuery) || matchesSearch(keyPath, obj[key], searchQuery);
            const keySearchHighlight = keyMatchesSearch ? "bg-yellow-200" : "";
            
            return (
              <span key={key} className={`${changeHighlight} ${keySearchHighlight}`}>
                <span>{indentStr}  </span>
                <span className="text-[#003478] font-medium">
                  {highlightSearchText(`"${key}"`, searchQuery)}
                </span>
                <span>: </span>
                {renderJsonWithHighlights(obj[key], report, isOld, keyPath, indent + 1, searchQuery)}
                {i < keys.length - 1 && <span>,</span>}
                <br />
              </span>
            );
          })}
          <span>{indentStr}</span>
          <span className={`${highlight} ${searchHighlight}`}>{`}`}</span>
        </span>
      );
    }
    
    // Normal rendering when no TYPE_CHANGED at this level
    return (
      <>
        <span className={`${highlight} ${searchHighlight}`}>{`{`}</span>
        <br />
        {keys.map((key, i) => {
          const keyPath = currentPath ? `${currentPath}.${key}` : key;
          const valueChange = report?.changes.find(c => (c as any).path === keyPath);
          const hasChange = valueChange !== undefined;
          const changeHighlight = hasChange ? getHighlightClass(keyPath, report, isOld) : "";
          const keyMatchesSearch = matchesSearch(key, key, searchQuery) || matchesSearch(keyPath, obj[key], searchQuery);
          const keySearchHighlight = keyMatchesSearch ? "bg-yellow-200" : "";
          
          // Wrap the entire key-value pair in highlight if there's a change or search match
          return (
            <span key={key} className={`${hasChange ? changeHighlight : ""} ${keySearchHighlight}`}>
              <span>{indentStr}  </span>
              <span className="text-[#003478] font-medium">
                {highlightSearchText(`"${key}"`, searchQuery)}
              </span>
              <span>: </span>
              {renderJsonWithHighlights(obj[key], report, isOld, keyPath, indent + 1, searchQuery)}
              {i < keys.length - 1 && <span>,</span>}
              <br />
            </span>
          );
        })}
        <span>{indentStr}</span>
        <span className={`${highlight} ${searchHighlight}`}>{`}`}</span>
      </>
    );
  }
  
  return <span>{String(obj)}</span>;
}

// Simple markdown renderer for AI explanation
function renderMarkdown(text: string): JSX.Element {
  if (!text) return <></>;
  
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  
  const processParagraph = () => {
    if (currentParagraph.length > 0) {
      const paraText = currentParagraph.join(' ').trim();
      if (paraText) {
        elements.push(
          <p key={elements.length} className="mb-3 last:mb-0">
            {renderInlineMarkdown(paraText)}
          </p>
        );
      }
      currentParagraph = [];
    }
  };
  
  const processList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={elements.length} className="list-disc list-inside mb-3 space-y-1 ml-4">
          {listItems.map((item, idx) => (
            <li key={idx} className="ml-2">
              {renderInlineMarkdown(item.trim().replace(/^[-*+]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };
  
  const processCodeBlock = () => {
    if (codeBlockContent.length > 0) {
      elements.push(
        <pre key={elements.length} className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto mb-3 text-xs font-mono border border-gray-700">
          <code className="text-gray-100">{codeBlockContent.join('\n')}</code>
        </pre>
      );
      codeBlockContent = [];
      inCodeBlock = false;
      codeBlockLang = '';
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        processCodeBlock();
      } else {
        processParagraph();
        processList();
        codeBlockLang = trimmed.substring(3).trim();
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }
    
    // Headers
    if (trimmed.match(/^#{1,6}\s+/)) {
      processParagraph();
      processList();
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const text = trimmed.replace(/^#+\s+/, '');
      const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      const className = level === 1 ? 'text-xl font-bold mb-2 mt-4' :
                       level === 2 ? 'text-lg font-bold mb-2 mt-4' :
                       level === 3 ? 'text-base font-semibold mb-2 mt-3' :
                       'text-sm font-semibold mb-1 mt-2';
      elements.push(
        <HeaderTag key={elements.length} className={className}>
          {renderInlineMarkdown(text)}
        </HeaderTag>
      );
      continue;
    }
    
    // List items
    if (trimmed.match(/^[-*+]\s+/)) {
      if (!inList) {
        processParagraph();
        inList = true;
      }
      listItems.push(trimmed);
      continue;
    } else if (inList) {
      processList();
    }
    
    // Horizontal rule
    if (trimmed.match(/^[-*_]{3,}$/)) {
      processParagraph();
      processList();
      elements.push(<hr key={elements.length} className="my-4 border-gray-300" />);
      continue;
    }
    
    // Empty line
    if (trimmed === '') {
      processParagraph();
      processList();
      continue;
    }
    
    // Regular paragraph text
    currentParagraph.push(line);
  }
  
  // Process remaining content
  processParagraph();
  processList();
  processCodeBlock();
  
  return <div>{elements}</div>;
}

// Render inline markdown (bold, italic, code, links)
function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  
  // Process text character by character to handle nested/overlapping patterns
  // We'll process in order: code blocks (highest priority), links, bold, italic
  
  // First, find all code spans (highest priority - they can't contain other markdown)
  const codeMatches: Array<{start: number, end: number, content: string}> = [];
  const codePattern = /`([^`]+)`/g;
  let match;
  while ((match = codePattern.exec(text)) !== null) {
    codeMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1]
    });
  }
  
  // Then find all bold patterns (**text** or __text__)
  const boldMatches: Array<{start: number, end: number, content: string}> = [];
  const boldPattern = /(\*\*|__)(.+?)\1/g;
  while ((match = boldPattern.exec(text)) !== null) {
    // Check if this bold match overlaps with any code match
    const overlapsCode = codeMatches.some(cm => 
      (match!.index < cm.end && match!.index + match![0].length > cm.start)
    );
    if (!overlapsCode) {
      boldMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[2]
      });
    }
  }
  
  // Find all links [text](url)
  const linkMatches: Array<{start: number, end: number, content: string, url: string}> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkPattern.exec(text)) !== null) {
    const overlapsCode = codeMatches.some(cm => 
      (match!.index < cm.end && match!.index + match![0].length > cm.start)
    );
    if (!overlapsCode) {
      linkMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        url: match[2]
      });
    }
  }
  
  // Find italic patterns (*text* or _text_) - but avoid overlapping with bold or code
  const italicMatches: Array<{start: number, end: number, content: string}> = [];
  // Use a simple approach: find single * or _ that aren't part of ** or __
  let i = 0;
  while (i < text.length) {
    if (text[i] === '*' && i + 1 < text.length && text[i + 1] !== '*') {
      // Potential italic start with *
      const endIdx = text.indexOf('*', i + 1);
      if (endIdx > i + 1 && (endIdx + 1 >= text.length || text[endIdx + 1] !== '*')) {
        const content = text.substring(i + 1, endIdx);
        const overlapsCode = codeMatches.some(cm => i < cm.end && endIdx + 1 > cm.start);
        const overlapsBold = boldMatches.some(bm => i < bm.end && endIdx + 1 > bm.start);
        const overlapsLink = linkMatches.some(lm => i < lm.end && endIdx + 1 > lm.start);
        if (!overlapsCode && !overlapsBold && !overlapsLink && content.length > 0) {
          italicMatches.push({
            start: i,
            end: endIdx + 1,
            content: content
          });
          i = endIdx + 1;
          continue;
        }
      }
    } else if (text[i] === '_' && i + 1 < text.length && text[i + 1] !== '_') {
      // Potential italic start with _
      const endIdx = text.indexOf('_', i + 1);
      if (endIdx > i + 1 && (endIdx + 1 >= text.length || text[endIdx + 1] !== '_')) {
        const content = text.substring(i + 1, endIdx);
        const overlapsCode = codeMatches.some(cm => i < cm.end && endIdx + 1 > cm.start);
        const overlapsBold = boldMatches.some(bm => i < bm.end && endIdx + 1 > bm.start);
        const overlapsLink = linkMatches.some(lm => i < lm.end && endIdx + 1 > lm.start);
        if (!overlapsCode && !overlapsBold && !overlapsLink && content.length > 0) {
          italicMatches.push({
            start: i,
            end: endIdx + 1,
            content: content
          });
          i = endIdx + 1;
          continue;
        }
      }
    }
    i++;
  }
  
  // Combine all matches and sort by start position
  const allMatches: Array<{start: number, end: number, type: string, content: string, url?: string}> = [
    ...codeMatches.map(m => ({...m, type: 'code' as const})),
    ...linkMatches.map(m => ({...m, type: 'link' as const, url: m.url})),
    ...boldMatches.map(m => ({...m, type: 'bold' as const})),
    ...italicMatches.map(m => ({...m, type: 'italic' as const}))
  ];
  
  // Sort by start position, and if same start, prioritize: code > link > bold > italic
  const priority: Record<string, number> = { code: 4, link: 3, bold: 2, italic: 1 };
  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (priority[b.type] || 0) - (priority[a.type] || 0);
  });
  
  // Remove overlapping matches (keep higher priority)
  const filteredMatches: typeof allMatches = [];
  for (const match of allMatches) {
    const overlaps = filteredMatches.some(m => 
      (match.start < m.end && match.end > m.start)
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  }
  
  // Build parts array
  let currentIndex = 0;
  for (const match of filteredMatches) {
    // Add text before match
    if (match.start > currentIndex) {
      parts.push(text.substring(currentIndex, match.start));
    }
    
    // Add matched element
    const key = `${match.type}-${match.start}`;
    switch (match.type) {
      case 'bold':
        parts.push(<strong key={key} className="font-bold">{match.content}</strong>);
        break;
      case 'italic':
        parts.push(<em key={key} className="italic">{match.content}</em>);
        break;
      case 'code':
        parts.push(<code key={key} className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-200">{match.content}</code>);
        break;
      case 'link':
        parts.push(
          <a 
            key={key} 
            href={match.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-900 hover:text-blue-700 underline font-medium"
          >
            {match.content}
          </a>
        );
        break;
    }
    
    currentIndex = match.end;
  }
  
  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  
  // If no matches, return the text as-is
  if (parts.length === 0) {
    return [text];
  }
  
  return parts;
}

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [oldUrl,setOldUrl]=useState(""); const [newUrl,setNewUrl]=useState("");
  const [oldFile,setOldFile]=useState<File|null>(null); const [newFile,setNewFile]=useState<File|null>(null);
  const [oldJson,setOldJson]=useState<any>(null); const [newJson,setNewJson]=useState<any>(null);
  const [report,setReport]=useState<DiffReport|null>(null); const [score,setScore]=useState<number| null>(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState<string| null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChangeType, setSelectedChangeType] = useState<"ALL" | "REMOVED_FIELD" | "ADDED_FIELD" | "TYPE_CHANGED">("ALL");
  const [schemaSearchQuery, setSchemaSearchQuery] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [ragOutput, setRagOutput] = useState<string | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);

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
      // Reset filters when new analysis is performed
      setSearchQuery("");
      setSelectedChangeType("ALL");
      setSchemaSearchQuery("");
      setCurrentPage(1);
      setItemsPerPage(10);
    }catch(e:any){ setError(e.message||"Analysis failed"); } finally{ setLoading(false); }
  }

  function loadSamples(){ 
    setOldUrl("/samples/v1.json"); setNewUrl("/samples/v2.json"); 
    setRagOutput(null);
    setRagError(null);
    setRagLoading(false);
  }

  // Format diff report as text for RAG ingestion
  function formatDiffReportForRAG(report: DiffReport | null): string {
    if (!report) return "";
    
    let text = "API Schema Migration Changes Report\n";
    text += "=====================================\n\n";
    text += `Summary:\n`;
    text += `- Added Fields: ${report.summary.added}\n`;
    text += `- Removed Fields: ${report.summary.removed}\n`;
    text += `- Risky Changes: ${report.summary.risky}\n\n`;
    text += `Detailed Changes:\n`;
    text += "================\n\n";
    
    report.changes.forEach((change, idx) => {
      text += `${idx + 1}. `;
      if (change.kind === "REMOVED_FIELD") {
        text += `REMOVED: Field "${change.path}" (type: ${change.oldType}) was removed from the API.\n`;
      } else if (change.kind === "ADDED_FIELD") {
        text += `ADDED: Field "${change.path}" (type: ${change.newType}) was added to the API.\n`;
      } else if (change.kind === "TYPE_CHANGED") {
        text += `TYPE CHANGED: Field "${change.path}" changed from ${change.oldType} to ${change.newType}.\n`;
      }
      text += "\n";
    });
    
    return text;
  }

  // Analyze changes with RAG
  async function analyzeWithRAG() {
    if (!report || !oldJson || !newJson) {
      setRagError("No diff report available. Please run analysis first.");
      return;
    }

    setRagLoading(true);
    setRagError(null);
    setRagOutput(null);

    try {
      // Format changes for the generate endpoint
      const changes = report.changes.map((change: any) => ({
        path: change.path,
        kind: change.kind,
        oldType: change.oldType || null,
        newType: change.newType || null,
      }));

      // Step 1: Ingest the diff report (optional, for RAG context)
      const diffText = formatDiffReportForRAG(report);
      try {
        const ingestResponse = await fetch("/api/rag", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "ingest",
            data: {
              text: diffText,
            },
          }),
        });
        // Don't fail if ingestion fails, continue with generate
        await ingestResponse.json();
      } catch (e) {
        console.warn("Ingestion failed, continuing with generate:", e);
      }

      // Step 2: Generate insights using the generate endpoint
      const generateResponse = await fetch("/api/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate",
          data: {
            changes: changes,
            old_schema: oldJson,
            new_schema: newJson,
            query: "Analyze these API changes and explain WHY the API was changed from v1 to v2. Focus on the business logic, data modeling improvements, or technical reasons behind each change. Use the field names, types, and actual values to provide insights.",
            max_new_tokens: 600,
            temperature: 0.3,
          },
        }),
      });

      const generateResult = await generateResponse.json();
      if (!generateResult.ok) {
        throw new Error(generateResult.msg || "Generation failed");
      }

      setRagOutput(generateResult.answer || "No response from AI system.");
    } catch (e: any) {
      setRagError(e.message || "RAG analysis failed");
    } finally {
      setRagLoading(false);
    }
  }

  // Adjust current page when filters change and page is out of bounds
  useEffect(() => {
    if (!report) return;
    
    const filteredChanges = report.changes.filter((c) => {
      if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
        return false;
      }
      if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });

    const totalPages = Math.ceil(filteredChanges.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [report, selectedChangeType, searchQuery, itemsPerPage, currentPage]);
  
  function loadSampleFromAPI() {
    setError(null);
    setRagOutput(null);
    setRagError(null);
    setRagLoading(false);
    // Use real API endpoints - GitHub API is a good example
    // These will show schema differences when analyzed
    const sampleApiUrl1 = "https://api.github.com/users/octocat";
    const sampleApiUrl2 = "https://api.github.com/users/github";
    
    // Just set the URLs - don't fetch or analyze yet
    // User will click "Analyze APIs" button to fetch and show the preview
    setOldUrl(sampleApiUrl1);
    setNewUrl(sampleApiUrl2);
    
    // Clear previous results so user can see fresh analysis
    setOldJson(null);
    setNewJson(null);
    setReport(null);
    setScore(null);
  }

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
                className="object-contain cursor-pointer"
                onClick={() => router.push('/')}

              />
              <button
                onClick={() => router.push('/')}
                className="text-xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
              >
                MirrorAPI
              </button>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={loadSamples}
                className="text-sm hover:underline"
              >
                Load Samples
              </button>
              <button 
                onClick={loadSampleFromAPI}
                className="text-sm hover:underline"
              >
                Load Sample from API
              </button>
              {status === "loading" ? (
                <div className="text-sm">Loading...</div>
              ) : session ? (
                <UserMenu />
              ) : (
                <button
                  onClick={() => router.push("/auth/signin")}
                  className="px-4 py-2 bg-white text-[#D62311] rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  Sign In
                </button>
              )}
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
                  <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-4">
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
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 bg-yellow-200 rounded"></span>
                            <span className="text-gray-700 font-medium">Search Match</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Search Bar */}
                    <div>
                      <label htmlFor="schema-search" className="block text-sm font-medium text-gray-700 mb-2">
                        Search Schema
                      </label>
                      <input
                        id="schema-search"
                        type="text"
                        placeholder="Search for keys, values, or paths..."
                        value={schemaSearchQuery}
                        onChange={(e) => setSchemaSearchQuery(e.target.value)}
                        className="w-full rounded border border-gray-300 px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D62311] focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="overflow-auto max-h-96">
                    <div className="grid grid-cols-2 gap-4 p-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200 sticky top-0 bg-white z-10">Old Schema</div>
                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs font-mono leading-relaxed">
                          {report ? renderJsonWithHighlights(oldJson, report, true, "", 0, schemaSearchQuery) : (
                            schemaSearchQuery ? (
                              <pre className="whitespace-pre text-gray-800">
                                {formatJson(oldJson).split('\n').map((line, i) => {
                                  const queryLower = schemaSearchQuery.toLowerCase();
                                  if (line.toLowerCase().includes(queryLower)) {
                                    const escapedQuery = escapeRegex(schemaSearchQuery);
                                    const parts = line.split(new RegExp(`(${escapedQuery})`, 'gi'));
                                    return (
                                      <span key={i}>
                                        {parts.map((part, j) => 
                                          part.toLowerCase() === queryLower ? (
                                            <span key={j} className="bg-yellow-200 font-semibold">{part}</span>
                                          ) : (
                                            <span key={j}>{part}</span>
                                          )
                                        )}
                                        {'\n'}
                                      </span>
                                    );
                                  }
                                  return <span key={i}>{line}{'\n'}</span>;
                                })}
                              </pre>
                            ) : (
                              <pre className="whitespace-pre text-gray-800">{formatJson(oldJson)}</pre>
                            )
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200 sticky top-0 bg-white z-10">New Schema</div>
                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs font-mono leading-relaxed">
                          {report ? renderJsonWithHighlights(newJson, report, false, "", 0, schemaSearchQuery) : (
                            schemaSearchQuery ? (
                              <pre className="whitespace-pre text-gray-800">
                                {formatJson(newJson).split('\n').map((line, i) => {
                                  const queryLower = schemaSearchQuery.toLowerCase();
                                  if (line.toLowerCase().includes(queryLower)) {
                                    const escapedQuery = escapeRegex(schemaSearchQuery);
                                    const parts = line.split(new RegExp(`(${escapedQuery})`, 'gi'));
                                    return (
                                      <span key={i}>
                                        {parts.map((part, j) => 
                                          part.toLowerCase() === queryLower ? (
                                            <span key={j} className="bg-yellow-200 font-semibold">{part}</span>
                                          ) : (
                                            <span key={j}>{part}</span>
                                          )
                                        )}
                                        {'\n'}
                                      </span>
                                    );
                                  }
                                  return <span key={i}>{line}{'\n'}</span>;
                                })}
                              </pre>
                            ) : (
                              <pre className="whitespace-pre text-gray-800">{formatJson(newJson)}</pre>
                            )
                          )}
                        </div>
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
                  
                  {/* Download Buttons */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h6 className="text-sm font-semibold text-gray-700 mb-2">Download Report</h6>
                        <p className="text-xs text-gray-500">Export your migration analysis report</p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => downloadCSV(report, score)}
                          className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download CSV
                        </button>
                        <button
                          onClick={() => downloadPDF(report, score, oldJson, newJson, ragOutput)}
                          className="px-4 py-2 bg-[#D62311] text-white font-semibold rounded-lg hover:bg-[#B41D0E] transition-colors text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RAG Analysis Section */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h5 className="text-lg font-semibold text-gray-900">AI-Powered Change Explanation</h5>
                      <p className="text-sm text-gray-600 mt-1">Get an AI-generated explanation of the schema changes</p>
                    </div>
                    <button
                      onClick={analyzeWithRAG}
                      disabled={ragLoading || !report}
                      className="px-4 py-2 bg-[#D62311] text-white font-semibold rounded-lg hover:bg-[#B41D0E] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {ragLoading ? "Analyzing..." : "Explain Changes with AI"}
                    </button>
                  </div>

                  {ragError && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded">
                      <span className="text-sm font-medium text-red-800">{ragError}</span>
                    </div>
                  )}

                  {ragOutput && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h6 className="text-sm font-semibold text-blue-900 mb-3">AI Explanation:</h6>
                      <div className="text-sm text-blue-800 leading-relaxed prose prose-sm max-w-none">
                        {renderMarkdown(ragOutput)}
                      </div>
                    </div>
                  )}

                  {ragLoading && (
                    <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#D62311]"></div>
                        <span>Analyzing changes with AI...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Change Summary Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-[#D62311] px-6 py-4">
                    <h5 className="text-lg font-semibold text-white">Change Summary</h5>
                    <p className="text-sm text-red-100 mt-1">Detailed breakdown of schema differences</p>
                  </div>
                  
                  {/* Search and Filter Controls */}
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 space-y-4">
                    {/* Search Bar */}
                    <div>
                      <label htmlFor="path-search" className="block text-sm font-medium text-gray-700 mb-2">
                        Search by Path
                      </label>
                      <input
                        id="path-search"
                        type="text"
                        placeholder="Search path names..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full rounded border border-gray-300 px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D62311] focus:border-transparent"
                      />
                    </div>
                    
                    {/* Filter Buttons */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Change Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { setSelectedChangeType("ALL"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "ALL"
                              ? "bg-[#D62311] text-white"
                              : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          All ({report.changes.length})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("REMOVED_FIELD"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "REMOVED_FIELD"
                              ? "bg-red-600 text-white"
                              : "bg-white text-red-700 border border-red-300 hover:bg-red-50"
                          }`}
                        >
                          Removed ({report.summary.removed})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("ADDED_FIELD"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "ADDED_FIELD"
                              ? "bg-green-600 text-white"
                              : "bg-white text-green-700 border border-green-300 hover:bg-green-50"
                          }`}
                        >
                          Added ({report.summary.added})
                        </button>
                        <button
                          onClick={() => { setSelectedChangeType("TYPE_CHANGED"); setCurrentPage(1); }}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selectedChangeType === "TYPE_CHANGED"
                              ? "bg-amber-600 text-white"
                              : "bg-white text-amber-700 border border-amber-300 hover:bg-amber-50"
                          }`}
                        >
                          Type Changed ({report.changes.filter(c => c.kind === "TYPE_CHANGED").length})
                        </button>
                      </div>
                    </div>

                    {/* Items Per Page and Pagination Controls */}
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">
                          Items per page:
                        </label>
                        <select
                          id="items-per-page"
                          value={itemsPerPage}
                          onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                          className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D62311] focus:border-transparent"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>
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
                        {(() => {
                          const filteredChanges = report.changes.filter((c) => {
                            // Filter by change type
                            if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
                              return false;
                            }
                            // Filter by search query
                            if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
                              return false;
                            }
                            return true;
                          });

                          // Calculate pagination
                          const totalItems = filteredChanges.length;
                          const totalPages = Math.ceil(totalItems / itemsPerPage);
                          const validPage = Math.min(Math.max(1, currentPage), totalPages || 1);
                          const startIndex = (validPage - 1) * itemsPerPage;
                          const endIndex = startIndex + itemsPerPage;
                          const paginatedChanges = filteredChanges.slice(startIndex, endIndex);

                          if (filteredChanges.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                                  No changes found matching your filters.
                                </td>
                              </tr>
                            );
                          }

                          return paginatedChanges.map((c, i) => (
                            <tr key={startIndex + i} className="hover:bg-gray-50 transition-colors">
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
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {(() => {
                    const filteredChanges = report.changes.filter((c) => {
                      if (selectedChangeType !== "ALL" && c.kind !== selectedChangeType) {
                        return false;
                      }
                      if (searchQuery && !(c as any).path.toLowerCase().includes(searchQuery.toLowerCase())) {
                        return false;
                      }
                      return true;
                    });
                    const totalItems = filteredChanges.length;
                    const totalPages = Math.ceil(totalItems / itemsPerPage);
                    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
                    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

                    if (totalPages <= 1) return null;

                    const getPageNumbers = () => {
                      const pages: (number | string)[] = [];
                      const maxVisible = 5;
                      
                      if (totalPages <= maxVisible) {
                        for (let i = 1; i <= totalPages; i++) {
                          pages.push(i);
                        }
                      } else {
                        if (currentPage <= 3) {
                          for (let i = 1; i <= 4; i++) {
                            pages.push(i);
                          }
                          pages.push("...");
                          pages.push(totalPages);
                        } else if (currentPage >= totalPages - 2) {
                          pages.push(1);
                          pages.push("...");
                          for (let i = totalPages - 3; i <= totalPages; i++) {
                            pages.push(i);
                          }
                        } else {
                          pages.push(1);
                          pages.push("...");
                          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                            pages.push(i);
                          }
                          pages.push("...");
                          pages.push(totalPages);
                        }
                      }
                      return pages;
                    };

                    return (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-wrap gap-4">
                        <div className="text-sm text-gray-700">
                          Showing <span className="font-medium">{startItem}</span> to <span className="font-medium">{endItem}</span> of{" "}
                          <span className="font-medium">{totalItems}</span> results
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Previous
                          </button>
                          <div className="flex items-center gap-1">
                            {getPageNumbers().map((page, idx) => (
                              page === "..." ? (
                                <span key={`ellipsis-${idx}`} className="px-2 py-2 text-gray-500">...</span>
                              ) : (
                                <button
                                  key={page}
                                  onClick={() => setCurrentPage(page as number)}
                                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    currentPage === page
                                      ? "bg-[#D62311] text-white"
                                      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                                  }`}
                                >
                                  {page}
                                </button>
                              )
                            ))}
                          </div>
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Form Panel (Light Gray Background) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Form Panel - Fixed/Sticky */}
            <div className="bg-gray-100 rounded-lg p-6 top-8">
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

            {/* Risk Score Explanation Section */}
            {report && typeof score === "number" && (
              <div className="bg-gray-100 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Understanding Your Migration Risk Score</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-700 mb-3">
                      Your Migration Risk Score of <span className="font-bold text-gray-900">{score}/100</span> indicates a{" "}
                      <span className={`font-bold ${
                        score < 31 ? "text-green-600" : score < 71 ? "text-amber-600" : "text-[#D62311]"
                      }`}>
                        {score < 31 ? "Low Risk" : score < 71 ? "Medium Risk" : "High Risk"}
                      </span>{" "}
                      migration. This score is calculated based on the types and severity of changes detected between your API versions.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Score Ranges:</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-16 h-6 rounded bg-green-600 text-white text-xs font-bold shrink-0">0-30</span>
                        <span><strong>Low Risk:</strong> MINOR/PATCH level changes. Mostly backward-compatible additions that don't break existing clients.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-16 h-6 rounded bg-amber-500 text-white text-xs font-bold shrink-0">31-70</span>
                        <span><strong>Medium Risk:</strong> Some breaking changes detected. Requires client code updates but migration is manageable.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-16 h-6 rounded bg-[#D62311] text-white text-xs font-bold shrink-0">71-100</span>
                        <span><strong>High Risk:</strong> MAJOR breaking changes. Significant API overhaul requiring extensive client-side refactoring.</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-300 pt-4">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Scoring Criteria:</h4>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                        <span className="text-[#D62311] font-bold shrink-0">•</span>
                        <div>
                          <strong>Removed Fields (40 points):</strong> Fields that were deleted from the API. 
                          This is the most severe change as it completely breaks clients using these fields.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Structural (35 points):</strong> Changing to/from objects or arrays. 
                          Example: A number field becomes an object with nested properties.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Incompatible (25 points):</strong> Types that cannot be safely converted. 
                          Example: A boolean field becomes a number.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Type Changes - Compatible (15 points):</strong> Types that can sometimes be converted. 
                          Example: A string field becomes a number (e.g., "123" → 123).
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 font-bold shrink-0">•</span>
                        <div>
                          <strong>Added Fields (5 points):</strong> New fields added to the API. 
                          Generally backward-compatible but adds complexity to the schema.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-xs text-blue-800">
                      <strong>Note:</strong> The score uses an exponential normalization formula to prevent score explosion 
                      with many changes while still accurately reflecting the compound risk of multiple breaking changes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}