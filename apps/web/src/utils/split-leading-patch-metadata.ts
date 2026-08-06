export interface LeadingPatchMetadata {
  metadata: string[];
  content: string[];
}

/** Separa as linhas de cabeçalho de um patch (diff/index/---/+++) do primeiro hunk (`@@`) em diante. */
export function splitLeadingPatchMetadata(
  lines: readonly string[],
): LeadingPatchMetadata {
  const hunkIndex = lines.findIndex((line) =>
    line.trimStart().startsWith('@@'),
  );
  if (hunkIndex <= 0) return { metadata: [], content: [...lines] };
  return {
    metadata: lines.slice(0, hunkIndex),
    content: lines.slice(hunkIndex),
  };
}
