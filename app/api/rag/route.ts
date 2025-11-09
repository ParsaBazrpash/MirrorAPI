// app/api/rag/route.ts
import { NextRequest, NextResponse } from "next/server";

const RAG_BACKEND_URL = process.env.RAG_BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    if (action === "ingest") {
      // Ingest the diff report text
      // Use FormData (available in Node.js 18+)
      const formData = new FormData();
      // Create a Blob from the text content
      const blob = new Blob([data.text], { type: "text/plain" });
      formData.append("files", blob, "diff_report.txt");

      const response = await fetch(`${RAG_BACKEND_URL}/ingest`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header - fetch will set it automatically with boundary
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { ok: false, msg: `Ingest failed: ${response.status} ${errorText}` },
          { status: response.status }
        );
      }

      const result = await response.json();
      return NextResponse.json(result);
    } else if (action === "chat") {
      // Chat with the RAG system
      const response = await fetch(`${RAG_BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: data.query,
          top_k: data.top_k || 5,
          max_new_tokens: data.max_new_tokens || 256,
          temperature: data.temperature || 0.3,
        }),
      });

      const result = await response.json();
      return NextResponse.json(result);
    } else if (action === "generate") {
      // Generate insights on why API v1 was changed to v2
      const response = await fetch(`${RAG_BACKEND_URL}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: data.query || null,
          changes: data.changes || null,
          old_schema: data.old_schema || null,
          new_schema: data.new_schema || null,
          top_k: data.top_k || 5,
          max_new_tokens: data.max_new_tokens || 600,
          temperature: data.temperature || 0.3,
        }),
      });

      const result = await response.json();
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { ok: false, msg: "Invalid action" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("RAG API error:", error);
    return NextResponse.json(
      { ok: false, msg: error.message || "RAG API request failed" },
      { status: 500 }
    );
  }
}

