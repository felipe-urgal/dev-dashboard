export type VersionConstraintResult =
  | 'compatible'
  | 'incompatible'
  | 'unknown';

interface Version {
  major: number;
  minor: number;
  patch: number;
}

interface ParsedRequirement {
  test: (version: Version) => boolean;
}

function parseVersion(value: string): Version | null {
  const normalized = value.trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;

  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
  };
}

function compare(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function parseNumericRequirement(raw: string): ParsedRequirement | null {
  const match = raw.match(/^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/);
  if (!match) return null;

  const major = Number.parseInt(match[1]!, 10);
  const minorToken = match[2];
  const patchToken = match[3];

  if (minorToken === undefined || /^(?:x|\*)$/i.test(minorToken)) {
    return { test: (version) => version.major === major };
  }

  const minor = Number.parseInt(minorToken, 10);
  if (patchToken === undefined || /^(?:x|\*)$/i.test(patchToken)) {
    return {
      test: (version) => version.major === major && version.minor === minor,
    };
  }

  const patch = Number.parseInt(patchToken, 10);
  const expected = { major, minor, patch };
  return { test: (version) => compare(version, expected) === 0 };
}

function upperBoundForPartial(base: Version, segments: number): Version {
  if (segments <= 1) return { major: base.major + 1, minor: 0, patch: 0 };
  if (segments === 2) {
    return { major: base.major, minor: base.minor + 1, patch: 0 };
  }
  return { major: base.major, minor: base.minor, patch: base.patch + 1 };
}

function upperBoundForCaret(base: Version): Version {
  if (base.major > 0) return { major: base.major + 1, minor: 0, patch: 0 };
  if (base.minor > 0) return { major: 0, minor: base.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: base.patch + 1 };
}

function upperBoundForTilde(base: Version, segments: number): Version {
  if (segments <= 1) return { major: base.major + 1, minor: 0, patch: 0 };
  return { major: base.major, minor: base.minor + 1, patch: 0 };
}

function parseComparator(raw: string): ParsedRequirement | null {
  const match = raw.match(/^(>=|<=|>|<|=|\^|~)?\s*(v?\d+(?:\.\d+){0,2})$/i);
  if (!match) return parseNumericRequirement(raw);

  const operator = match[1] ?? '';
  const value = match[2]!;
  const normalizedValue = value.replace(/^v/i, '');
  const segments = normalizedValue.split('.').length;
  const expected = parseVersion(value);
  if (!expected) return null;

  if (operator === '') return parseNumericRequirement(normalizedValue);
  if (operator === '=') return parseNumericRequirement(normalizedValue);
  if (operator === '>=') {
    return { test: (version) => compare(version, expected) >= 0 };
  }
  if (operator === '<') {
    return { test: (version) => compare(version, expected) < 0 };
  }
  if (operator === '>') {
    if (segments === 3) {
      return { test: (version) => compare(version, expected) > 0 };
    }
    const lower = upperBoundForPartial(expected, segments);
    return { test: (version) => compare(version, lower) >= 0 };
  }
  if (operator === '<=') {
    if (segments === 3) {
      return { test: (version) => compare(version, expected) <= 0 };
    }
    const upper = upperBoundForPartial(expected, segments);
    return { test: (version) => compare(version, upper) < 0 };
  }
  if (operator === '^') {
    const upper = upperBoundForCaret(expected);
    return {
      test: (version) =>
        compare(version, expected) >= 0 && compare(version, upper) < 0,
    };
  }

  const upper = upperBoundForTilde(expected, segments);
  return {
    test: (version) =>
      compare(version, expected) >= 0 && compare(version, upper) < 0,
  };
}

function parseAlternative(raw: string): ParsedRequirement[] | null {
  const normalized = raw.replace(/,/g, ' ').trim();
  if (!normalized) return null;

  const tokens = normalized.split(/\s+/);
  const requirements: ParsedRequirement[] = [];
  for (const token of tokens) {
    const parsed = parseComparator(token);
    if (!parsed) return null;
    requirements.push(parsed);
  }
  return requirements;
}

export function evaluateVersionConstraint(
  actual: string,
  requirement: string,
): VersionConstraintResult {
  const version = parseVersion(actual);
  if (!version) return 'unknown';

  const alternatives = requirement
    .trim()
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean);
  if (alternatives.length === 0) return 'unknown';

  let hasUnknown = false;
  for (const alternative of alternatives) {
    const parsed = parseAlternative(alternative);
    if (!parsed) {
      hasUnknown = true;
      continue;
    }
    if (parsed.every((constraint) => constraint.test(version))) {
      return 'compatible';
    }
  }

  return hasUnknown ? 'unknown' : 'incompatible';
}
