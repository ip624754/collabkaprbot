function normalizeAllowedFields(allowedFields) {
  if (allowedFields instanceof Set) return allowedFields;
  if (Array.isArray(allowedFields)) return new Set(allowedFields.map((value) => String(value)));
  throw new TypeError('allowed_fields_required');
}

export function buildAllowedPatch(patch, allowedFields, {
  label = 'patch',
  parameterOffset = 2,
} = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError(`${label}_must_be_object`);
  }

  const allowed = normalizeAllowedFields(allowedFields);
  const keys = Object.keys(patch);
  const invalid = keys.filter((key) => !allowed.has(key));
  if (invalid.length) {
    throw new Error(`${label}_field_not_allowed:${invalid.sort().join(',')}`);
  }

  return {
    keys,
    sets: keys.map((key, index) => `${key}=$${parameterOffset + index}`),
    values: keys.map((key) => patch[key]),
  };
}

export function requireExactlyOneAffectedRow(result, label = 'mutation') {
  const rowCount = Number(result?.rowCount || 0);
  if (rowCount !== 1) {
    const error = new Error(`${label}_affected_rows:${rowCount}`);
    error.code = 'MUTATION_ROW_COUNT_MISMATCH';
    error.rowCount = rowCount;
    throw error;
  }
  return result?.rows?.[0] || null;
}
