export type Change =
  | { kind: "REMOVED_FIELD"; path: string; oldType: string }
  | { kind: "ADDED_FIELD"; path: string; newType: string }
  | { kind: "TYPE_CHANGED"; path: string; oldType: string; newType: string };

export type DiffReport = { changes: Change[]; summary: { added: number; removed: number; risky: number } };

function typ(v: any): string { if (v === null) return "null"; if (Array.isArray(v)) return "array"; return typeof v; }

function walk(obj: any, base: string, out: Record<string,string>, seen=new WeakSet()) {
  if (obj && typeof obj === "object") { if (seen.has(obj)) return; seen.add(obj); }
  const t=typ(obj);
  
  // Always record the type at the current path (including for objects and arrays)
  // This allows us to detect when a field changes from a primitive to an object/array or vice versa
  if (base) {
    out[base] = t;
  }
  
  // Then recursively walk into objects and arrays to get nested field types
  if (t==="object") {
    for (const k of Object.keys(obj)) {
      walk(obj[k], base?`${base}.${k}`:k, out, seen);
    }
  } else if (t==="array") {
    // For arrays, we record the array type at base (already done above)
    // Optionally, we could also record types of array elements, but for now we just mark it as array
    if (obj.length > 0 && typeof obj[0] === "object" && !Array.isArray(obj[0])) {
      // If array contains objects, walk into the first element to get nested structure
      walk(obj[0], base ? `${base}[]` : "[]", out, seen);
    }
  }
}

export function diffSchemas(oldJson:any, newJson:any): DiffReport {
  const A:Record<string,string>={}, B:Record<string,string>={};
  walk(oldJson,"",A); walk(newJson,"",B);
  const changes:Change[]=[];
  for (const p of Object.keys(A)) {
    if (!(p in B)) changes.push({ kind:"REMOVED_FIELD", path:p, oldType:A[p] });
    else if (A[p]!==B[p]) changes.push({ kind:"TYPE_CHANGED", path:p, oldType:A[p], newType:B[p] });
  }
  for (const p of Object.keys(B)) if (!(p in A)) changes.push({ kind:"ADDED_FIELD", path:p, newType:B[p] });
  return { changes, summary:{
    added: changes.filter(c=>c.kind==="ADDED_FIELD").length,
    removed: changes.filter(c=>c.kind==="REMOVED_FIELD").length,
    risky: changes.filter(c=>c.kind!=="ADDED_FIELD").length
  }};
}
