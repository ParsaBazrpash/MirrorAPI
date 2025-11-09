// app/api/fetch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";

  // Serve local sample JSONs from /public/samples/*.json
  if (url.startsWith("/samples/")) {
    try {
      const filePath = path.join(process.cwd(), "public", url); // e.g., public/samples/v1.json
      const buf = await readFile(filePath, "utf8");
      const json = JSON.parse(buf);
      return NextResponse.json(json);
    } catch (e: any) {
      return NextResponse.json({ error: `Local file error: ${e.message}` }, { status: 500 });
    }
  }

  // For external URLs, try to proxy through the Node.js backend server first
  // If backend is not available, fall back to direct fetch
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      // Try backend server first (with a reasonable timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const backendResponse = await fetch(`${BACKEND_URL}/fetch?url=${encodeURIComponent(url)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (backendResponse.ok) {
        const json = await backendResponse.json();
        return NextResponse.json(json);
      }
    } catch (e: any) {
      // Backend not available or error - fall back to direct fetch
      console.warn(`Backend server not available, using direct fetch: ${e.message}`);
    }

    // Fallback: Direct fetch (no whitelist restrictions)
    try {
      const r = await fetch(url, { 
        headers: { accept: "application/json" }, 
        cache: "no-store",
      });
      if (!r.ok) {
        return NextResponse.json({ error: `Upstream ${r.status}` }, { status: r.status });
      }
      const text = await r.text();
      try {
        return NextResponse.json(JSON.parse(text));
      } catch {
        return NextResponse.json({ error: "Not JSON" }, { status: 415 });
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: `Failed to fetch: ${e.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
}
