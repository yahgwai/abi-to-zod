export type ParsedType = {
  base: string;
  suffixes: (number | null)[];
};

const TYPE_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)((?:\[\d*\])*)$/;
const SUFFIX_RE = /\[(\d*)\]/g;

export function parseType(typeString: string): ParsedType {
  const m = TYPE_RE.exec(typeString);
  if (m === null) {
    throw new Error(`Invalid ABI type string: ${JSON.stringify(typeString)}`);
  }
  const base = m[1]!;
  const suffixStr = m[2]!;

  const suffixes: (number | null)[] = [];
  for (const sm of suffixStr.matchAll(SUFFIX_RE)) {
    const numStr = sm[1]!;
    if (numStr === '') {
      suffixes.push(null);
      continue;
    }
    const n = Number(numStr);
    if (n === 0) {
      throw new Error(`Invalid array size 0 in type ${JSON.stringify(typeString)}`);
    }
    suffixes.push(n);
  }

  return { base, suffixes };
}
