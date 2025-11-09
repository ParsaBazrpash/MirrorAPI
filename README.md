# MirrorAPI

A developer tool that compares two API responses, detects breaking changes, scores the migration risk, and generates a structured change report.  
Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind + shadcn/ui**, and a deterministic JSON diff engine.

---

## 🔍 What it does

Compare **two JSON API responses** (URLs or local sample files)  
Detect field-level changes:
- Added fields
- Removed fields
- Type changes (`string → array`, `number → object`, etc.)

Generate a **migration risk score (0–100)**  
Visual diff table with grouped changes  
Export **Markdown migration report**  
Works with **real APIs** (e.g., RestCountries, SpaceX, Pokémon)  
Deterministic — no AI hallucinations, fully offline compatible  

---

## Demo Preview (UI Flow)

1. Paste **Old API URL**  
2. Paste **New API URL** (or choose a preset)  
3. Click **Analyze**  
4. View:
   - Risk badge (Low / Medium / High)
   - Summary counters
   - Full diff table by path

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript |
| UI | Tailwind CSS + shadcn/ui components |
| Logic | Custom JSON schema walker + diff + risk scoring |
| API Routes | `/api/fetch` (safe proxy for remote URLs) |
| Demo Data | `public/samples/v1.json` + `v2.json` |
