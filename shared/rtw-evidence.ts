export const SHARE_CODE_DOC_TYPE = "Share Code Screenshot";

export interface RtwDocLike {
  type?: string | null;
  category?: string | null;
  notes?: string | null;
}

export function isShareCodeDoc(doc: RtwDocLike): boolean {
  return (doc.type || "") === SHARE_CODE_DOC_TYPE;
}

export function isValidRtwDoc(doc: RtwDocLike): boolean {
  const isRtw = (doc.category || "") === "right_to_work" || (doc.type || "") === "right_to_work";
  if (!isRtw) return false;
  if (isShareCodeDoc(doc)) {
    return typeof doc.notes === "string" && doc.notes.trim().length > 0;
  }
  return true;
}

export function filterValidRtwDocs<T extends RtwDocLike>(docs: T[]): T[] {
  return docs.filter(isValidRtwDoc);
}

export function hasValidRtwEvidence(docs: RtwDocLike[]): boolean {
  return docs.some(isValidRtwDoc);
}
