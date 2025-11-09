# API Change Risk Scoring Methodology

## Overview

This document explains how the API change risk scoring system works and the standards/practices it's based on.

## Is There an ISO Standard?

**Short answer: No, there is no specific ISO standard for API change risk scoring.**

However, the scoring system is based on:

1. **Semantic Versioning (SemVer 2.0.0)** - The de facto industry standard for versioning
2. **ISO 31000:2018** - Risk Management Guidelines (general framework)
3. **JSON Schema/OpenAPI practices** - Industry-standard API compatibility rules
4. **Empirical research** - Studies on API breaking change impact

## How the Scoring Works

### Score Range: 0-100

- **0-30**: Low Risk (MINOR/PATCH level changes)
- **31-70**: Medium Risk (Some breaking changes)
- **71-100**: High Risk (MAJOR breaking changes)

### Change Type Severity

| Change Type | Points | SemVer Level | Rationale |
|------------|--------|--------------|-----------|
| **REMOVED_FIELD** | 40 | MAJOR | Completely breaks clients using this field |
| **TYPE_CHANGED (Structural)** | 35 | MAJOR | Object/array changes require major refactoring |
| **TYPE_CHANGED (Incompatible)** | 25 | MAJOR | Cannot safely convert (e.g., boolean → number) |
| **TYPE_CHANGED (Compatible)** | 15 | MAJOR | Can sometimes convert (e.g., string → number) |
| **ADDED_FIELD** | 5 | MINOR | Generally backward compatible |

### Scoring Formula

1. **Accumulate raw points** for each change
2. **Normalize using exponential decay**: `score = 100 × (1 - e^(-totalScore/50))`

This normalization:
- Prevents score explosion with many changes
- Models diminishing returns (multiple changes compound risk)
- Approaches 100 asymptotically for major overhauls

## Standards and References

### Semantic Versioning (SemVer)
- **Standard**: [SemVer 2.0.0](https://semver.org/)
- **Principle**: MAJOR.MINOR.PATCH versioning
- **Application**: Our scoring aligns with SemVer principles

### ISO 31000:2018 - Risk Management
- **Framework**: General risk management guidelines
- **Application**: Impact-based risk assessment

### JSON Schema Compatibility
- **Standard**: [JSON Schema Specification](https://json-schema.org/)
- **Application**: Type compatibility rules

### OpenAPI/Swagger Practices
- **Standard**: [OpenAPI Specification](https://swagger.io/specification/)
- **Application**: Breaking change detection patterns

## Type Compatibility Rules

### Compatible Types
- `null` ↔ any type (represents optional/missing values)
- `string` ↔ `number` (can be parsed/converted)
- Same type (no change)

### Incompatible Types
- `boolean` ↔ `number` (cannot convert)
- `boolean` ↔ `string` (context-dependent)
- Primitive ↔ `object`/`array` (structural difference)

## Rationale for Point Values

### REMOVED_FIELD: 40 points
- **Why**: Guaranteed breaking change
- **Impact**: Clients must remove/update code immediately
- **Industry practice**: All API diff tools flag this as critical

### TYPE_CHANGED: 15-35 points
- **Why**: Severity varies by compatibility
- **Impact**: Structural > Incompatible > Compatible
- **Industry practice**: Type changes are breaking but severity varies

### ADDED_FIELD: 5 points
- **Why**: Generally backward compatible
- **Impact**: Adds complexity but doesn't break existing clients
- **Industry practice**: Considered safe in SemVer (MINOR version)

## Normalization Factor: 50

The normalization factor (50) was chosen to:
- Provide good sensitivity for 1-5 changes
- Prevent score explosion with 10+ changes
- Align with common risk assessment practices

**Examples:**
- 1 change (40 pts) → ~55 score
- 2 changes (80 pts) → ~80 score
- 5 changes (200 pts) ~98 score

## Customization

The scoring weights are configurable in `lib/score.ts`:

```typescript
const SCORING_WEIGHTS = {
  REMOVED_FIELD: 40,
  TYPE_CHANGED_STRUCTURAL: 35,
  TYPE_CHANGED_INCOMPATIBLE: 25,
  TYPE_CHANGED_COMPATIBLE: 15,
  ADDED_FIELD: 5,
};
```

Adjust these based on your organization's risk tolerance.

## Comparison with Industry Tools

Similar tools use comparable approaches:
- **openapi-diff**: Flags breaking changes (removed fields, type changes)
- **json-schema-diff**: Categorizes changes by severity
- **swagger-diff**: Uses SemVer principles

Our scoring provides a quantitative measure that aligns with these tools' qualitative assessments.

## Limitations

1. **No semantic analysis**: Doesn't detect logical breaking changes (e.g., value range changes)
2. **No usage context**: Doesn't know which fields are critical vs. optional
3. **Static analysis**: Based on schema only, not runtime behavior
4. **Language-agnostic**: Doesn't account for language-specific type systems

## Future Improvements

Potential enhancements:
- Field usage frequency weighting (more used = higher impact)
- Semantic analysis (detect logical breaking changes)
- Custom compatibility rules per organization
- Integration with API usage analytics

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [ISO 31000:2018 Risk Management](https://www.iso.org/standard/65694.html)
- [OpenAPI Specification](https://swagger.io/specification/)
- [JSON Schema Specification](https://json-schema.org/)
- [API Breaking Change Detection Research](https://arxiv.org/abs/2209.00393)

