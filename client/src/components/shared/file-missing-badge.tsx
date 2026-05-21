export function FileMissingBadge({ id }: { id?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-400"
      title="The original file is no longer on the server (lost before backup mirroring). Ask the candidate to re-upload it."
      data-testid={id ? `badge-file-missing-${id}` : "badge-file-missing"}
    >
      File missing — re-upload required
    </span>
  );
}
