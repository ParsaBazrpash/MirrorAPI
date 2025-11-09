import { DiffReport } from "./diff";

const SCORING_WEIGHTS = {
  REMOVED_FIELD: 40,
  TYPE_CHANGED_STRUCTURAL: 35,
  TYPE_CHANGED_INCOMPATIBLE: 25,
  TYPE_CHANGED_COMPATIBLE: 15,
  ADDED_FIELD: 5,
} as const;

const NORMALIZATION_FACTOR = 50;

export function scoreDiff(r: DiffReport): number {
  if (r.changes.length === 0) {
    return 0;
  }

  let totalScore = 0;

  for (const change of r.changes) {
    switch (change.kind) {
      case "REMOVED_FIELD":
        totalScore += SCORING_WEIGHTS.REMOVED_FIELD;
        break;

      case "TYPE_CHANGED": {
        const { oldType, newType } = change;
        
        const isStructuralChange = 
          (oldType === "object" || oldType === "array") ||
          (newType === "object" || newType === "array");
        
        if (isStructuralChange) {
          totalScore += SCORING_WEIGHTS.TYPE_CHANGED_STRUCTURAL;
        } else if (areTypesCompatible(oldType, newType)) {
          totalScore += SCORING_WEIGHTS.TYPE_CHANGED_COMPATIBLE;
        } else {
          totalScore += SCORING_WEIGHTS.TYPE_CHANGED_INCOMPATIBLE;
        }
        break;
      }

      case "ADDED_FIELD":
        totalScore += SCORING_WEIGHTS.ADDED_FIELD;
        break;
    }
  }

  const normalizedScore = 100 * (1 - Math.exp(-totalScore / NORMALIZATION_FACTOR));
  
  return Math.round(Math.max(0, Math.min(100, normalizedScore)));
}

function areTypesCompatible(oldType: string, newType: string): boolean {
  if (oldType === "null" || newType === "null") {
    return true;
  }

  if (
    (oldType === "string" && newType === "number") ||
    (oldType === "number" && newType === "string")
  ) {
    return true;
  }

  return oldType === newType;
}
