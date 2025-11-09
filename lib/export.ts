import { DiffReport } from "./diff";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Extend jsPDF type to include lastAutoTable
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

/**
 * Converts markdown text to plain text by stripping markdown syntax
 */
function markdownToPlainText(markdown: string): string {
  if (!markdown) return "";
  
  let text = markdown;
  
  // Step 1: Remove code blocks first (```language\ncode\n```)
  // Store code blocks temporarily to preserve their content
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    // Extract the code content, removing the language identifier and backticks
    const codeContent = match.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
    codeBlocks.push(codeContent);
    return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
  });
  
  // Step 2: Remove inline code (`code`) but keep the content
  text = text.replace(/`([^`\n]+)`/g, '$1');
  
  // Step 3: Remove links but keep the text ([text](url) -> text)
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Step 4: Remove bold (**text** or __text__) but keep text
  // Process double asterisks and underscores first
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  
  // Step 5: Convert headers to plain text (# Header -> Header)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  
  // Step 6: Convert horizontal rules to blank lines
  text = text.replace(/^[-*_]{3,}$/gm, '');
  
  // Step 7: Convert list items (- item, * item, or 1. item) to plain text with bullets
  // Process list items before handling single asterisks/underscores for italic
  text = text.replace(/^[\s]*[-*+]\s+(.+)$/gm, '• $1');
  text = text.replace(/^[\s]*\d+\.\s+(.+)$/gm, '$1');
  
  // Step 8: Remove italic (*text* or _text_) but keep text
  // Handle single asterisks that are clearly italic (surrounded by word chars or spaces)
  // Match *text* where text doesn't contain asterisks
  text = text.replace(/\*([^*\n]+?)\*/g, '$1');
  // Handle single underscores that are clearly italic (not at word boundaries for emphasis)
  text = text.replace(/\b_([^_\n]+?)_\b/g, '$1');
  // Handle remaining underscores in non-word contexts
  text = text.replace(/([^_])_([^_\n]+?)_([^_])/g, '$1$2$3');
  
  // Step 9: Restore code blocks
  codeBlocks.forEach((code, index) => {
    text = text.replace(`[CODE_BLOCK_${index}]`, code);
  });
  
  // Step 10: Clean up multiple blank lines (more than 2 consecutive newlines)
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // Step 11: Trim whitespace from each line but preserve paragraph breaks
  const lines = text.split('\n');
  text = lines.map(line => {
    // Preserve empty lines (paragraph breaks)
    if (line.trim() === '') return '';
    return line.trim();
  }).join('\n');
  
  // Step 12: Final cleanup: remove excessive whitespace at start/end
  text = text.trim();
  
  return text;
}

/**
 * Escapes a CSV cell value
 */
function escapeCSVCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateCSV(report: DiffReport, score: number | null): string {
  const rows: string[][] = [];
  
  // Summary Section
  rows.push(["API Schema Migration Analysis Report"]);
  rows.push([`Generated on: ${new Date().toLocaleString()}`]);
  rows.push([]);
  rows.push(["Migration Risk Assessment"]);
  rows.push(["Migration Risk Score", score !== null ? `${score}/100` : "N/A"]);
  const riskLevel = score !== null 
    ? (score < 31 ? "Low Risk" : score < 71 ? "Medium Risk" : "High Risk")
    : "N/A";
  rows.push(["Risk Level", riskLevel]);
  rows.push([]);
  rows.push(["Summary Statistics"]);
  rows.push(["Added Fields", report.summary.added.toString()]);
  rows.push(["Removed Fields", report.summary.removed.toString()]);
  rows.push(["Risky Changes", report.summary.risky.toString()]);
  rows.push([]);
  rows.push(["Detailed Changes"]);
  
  // Header row
  rows.push(["Path", "Change Type", "Old Type", "New Type"]);
  
  // Data rows
  report.changes.forEach((change) => {
    const row: string[] = [];
    row.push((change as any).path || "");
    row.push(change.kind.replace(/_/g, " "));
    
    if (change.kind === "REMOVED_FIELD") {
      row.push((change as any).oldType || "");
      row.push("");
    } else if (change.kind === "ADDED_FIELD") {
      row.push("");
      row.push((change as any).newType || "");
    } else if (change.kind === "TYPE_CHANGED") {
      row.push((change as any).oldType || "");
      row.push((change as any).newType || "");
    } else {
      row.push("");
      row.push("");
    }
    
    rows.push(row);
  });
  
  // Convert to CSV string
  const csvContent = rows.map(row => 
    row.map(cell => escapeCSVCell(String(cell))).join(",")
  ).join("\n");
  
  return csvContent;
}

/**
 * Downloads a CSV file
 */
export function downloadCSV(report: DiffReport, score: number | null, filename: string = "api-migration-report.csv"): void {
  const csv = generateCSV(report, score);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPDF(
  report: DiffReport, 
  score: number | null,
  oldJson: any,
  newJson: any,
  ragOutput: string | null,
  filename: string = "api-migration-report.pdf"
): void {
  const doc = new jsPDF();
  let yPosition = 20;
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(214, 35, 17); // StateFarm red
  doc.text("API Schema Migration Analysis Report", 14, yPosition);
  yPosition += 10;
  
  // Date
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, yPosition);
  yPosition += 15;
  
  // Summary Section
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("Migration Risk Assessment", 14, yPosition);
  yPosition += 10;
  
  // Risk Score
  doc.setFontSize(12);
  doc.text(`Migration Risk Score: ${score !== null ? score : "N/A"}/100`, 14, yPosition);
  yPosition += 7;
  
  const riskLevel = score !== null 
    ? (score < 31 ? "Low Risk" : score < 71 ? "Medium Risk" : "High Risk")
    : "N/A";
  doc.text(`Risk Level: ${riskLevel}`, 14, yPosition);
  yPosition += 10;
  
  // Summary Statistics
  doc.setFontSize(12);
  doc.text("Summary Statistics:", 14, yPosition);
  yPosition += 7;
  doc.setFontSize(10);
  doc.text(`• Added Fields: ${report.summary.added}`, 20, yPosition);
  yPosition += 6;
  doc.text(`• Removed Fields: ${report.summary.removed}`, 20, yPosition);
  yPosition += 6;
  doc.text(`• Risky Changes: ${report.summary.risky}`, 20, yPosition);
  yPosition += 15;
  
  // Changes Table
  if (report.changes.length > 0) {
    doc.setFontSize(16);
    doc.text("Detailed Changes", 14, yPosition);
    yPosition += 10;
    
    // Prepare table data
    const tableData = report.changes.map((change) => {
      const path = (change as any).path || "";
      const changeType = change.kind.replace(/_/g, " ");
      
      let oldType = "";
      let newType = "";
      let details = "";
      
      if (change.kind === "REMOVED_FIELD") {
        oldType = (change as any).oldType || "";
        details = `Removed: ${oldType}`;
      } else if (change.kind === "ADDED_FIELD") {
        newType = (change as any).newType || "";
        details = `Added: ${newType}`;
      } else if (change.kind === "TYPE_CHANGED") {
        oldType = (change as any).oldType || "";
        newType = (change as any).newType || "";
        details = `${oldType} → ${newType}`;
      }
      
      return [path, changeType, details];
    });
    
    // Add table using autoTable
    autoTable(doc, {
      head: [["Path", "Change Type", "Details"]],
      body: tableData,
      startY: yPosition,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [214, 35, 17], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
    });
    
    yPosition = doc.lastAutoTable.finalY + 15;
  }
  
  // Add RAG Analysis if available
  if (ragOutput) {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }
    
    doc.setFontSize(16);
    doc.text("AI-Powered Change Explanation", 14, yPosition);
    yPosition += 10;
    
    // Convert markdown to plain text
    const plainText = markdownToPlainText(ragOutput);
    
    doc.setFontSize(10);
    // Process the text line by line, handling paragraphs and list items
    const allLines = plainText.split('\n');
    let currentParagraph: string[] = [];
    
    const flushParagraph = () => {
      if (currentParagraph.length === 0) return;
      
      // Check if we need a new page
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Join paragraph lines with spaces and wrap text
      const paragraphText = currentParagraph.join(' ').trim();
      if (paragraphText) {
        const lines = doc.splitTextToSize(paragraphText, 180);
        doc.text(lines, 14, yPosition);
        yPosition += lines.length * 5 + 3; // Add spacing
      }
      currentParagraph = [];
    };
    
    allLines.forEach((line) => {
      const trimmedLine = line.trim();
      
      // Empty line indicates paragraph break
      if (trimmedLine === '') {
        flushParagraph();
        yPosition += 2; // Add small spacing for paragraph breaks
        return;
      }
      
      // Check if this is a list item (starts with bullet)
      if (trimmedLine.startsWith('•')) {
        flushParagraph();
        
        // Check if we need a new page
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        
        // Render list item
        const listText = trimmedLine.substring(1).trim(); // Remove bullet, keep text
        const lines = doc.splitTextToSize(listText, 170); // Slightly narrower for indentation
        doc.text(`• ${lines[0]}`, 14, yPosition);
        if (lines.length > 1) {
          // Handle wrapped lines with indentation
          lines.slice(1).forEach((wrappedLine: string) => {
            yPosition += 5;
            doc.text(wrappedLine, 20, yPosition); // Indent wrapped lines
          });
        }
        yPosition += 5 + 2; // Line height + spacing
        return;
      }
      
      // Regular paragraph line
      currentParagraph.push(trimmedLine);
    });
    
    // Flush any remaining paragraph
    flushParagraph();
  }
  
  // Save the PDF
  doc.save(filename);
}

