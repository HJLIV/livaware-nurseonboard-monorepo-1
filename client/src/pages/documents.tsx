import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  FileText,
  ExternalLink,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
} from "lucide-react";

interface DocumentRow {
  id: string;
  nurseId: string;
  type: string;
  filename: string;
  originalFilename: string | null;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  sharepointUrl: string | null;
  aiStatus: string | null;
  uploadedAt: string;
  candidateName: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface FiltersData {
  candidates: { id: string; name: string }[];
  categories: string[];
}

const aiStatusStyles: Record<string, string> = {
  analyzed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  failed: "bg-red-500/10 text-red-400 border-red-500/15",
  skipped: "bg-gray-500/10 text-gray-400 border-gray-500/15",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "50");
  if (search.trim()) queryParams.set("search", search.trim());
  if (candidateFilter !== "all") queryParams.set("candidate", candidateFilter);
  if (categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data, isLoading, error } = useQuery<{ data: DocumentRow[]; pagination: Pagination }>({
    queryKey: [`/api/admin/documents?${queryParams.toString()}`],
  });

  const { data: filters } = useQuery<FiltersData>({
    queryKey: ["/api/admin/documents/filters"],
  });

  const isUnauthorized = error instanceof Error && error.message.startsWith("403");
  const docs = data?.data ?? [];
  const pagination = data?.pagination;

  const hasFilters = search.trim() || candidateFilter !== "all" || categoryFilter !== "all" || dateFrom || dateTo;

  function clearFilters() {
    setSearch("");
    setCandidateFilter("all");
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function handleFilterChange(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            System
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
            Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse all uploaded documents across candidates
          </p>
        </div>

        {isUnauthorized ? (
          <Card className="animate-fade-in-up animate-delay-200 overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/8 mb-4">
                  <FolderOpen className="h-7 w-7 text-red-400/40" />
                </div>
                <p className="font-serif text-lg text-foreground mb-1">Access Denied</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  You do not have permission to view this page. Admin access is required.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (<>

        <div className="flex flex-wrap items-center gap-3 animate-fade-in-up animate-delay-100">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-10 bg-card border-border/60"
            />
          </div>
          <Select value={candidateFilter} onValueChange={handleFilterChange(setCandidateFilter)}>
            <SelectTrigger className="w-[200px] h-10 bg-card border-border/60">
              <SelectValue placeholder="Candidate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Candidates</SelectItem>
              {filters?.candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={handleFilterChange(setCategoryFilter)}>
            <SelectTrigger className="w-[180px] h-10 bg-card border-border/60">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {filters?.categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-10 w-[160px] bg-card border-border/60"
                placeholder="From"
              />
            </div>
            <span className="text-muted-foreground/50 text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="h-10 w-[160px] bg-card border-border/60"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          {pagination && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums ml-auto">
              {pagination.total} {pagination.total === 1 ? "document" : "documents"}
            </Badge>
          )}
        </div>

        <Card className="animate-fade-in-up animate-delay-200 overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : docs.length > 0 ? (
              <>
                <div className="hidden md:grid grid-cols-[1fr_140px_180px_100px_100px_100px] gap-4 px-5 py-3 border-b border-border/50 bg-muted/30">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Document</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Category</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Candidate</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Date</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">AI Status</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 text-right">Link</span>
                </div>
                <div className="divide-y divide-border/50">
                  {docs.map((doc, i) => (
                    <div
                      key={doc.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_140px_180px_100px_100px_100px] gap-2 md:gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors duration-150 animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.originalFilename || doc.filename}</p>
                          {doc.fileSize && (
                            <p className="text-[11px] text-muted-foreground/50">{formatFileSize(doc.fileSize)}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center">
                        {doc.category ? (
                          <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                            {doc.category}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">—</span>
                        )}
                      </div>

                      <div className="flex items-center min-w-0">
                        <span className="text-sm text-muted-foreground truncate">{doc.candidateName}</span>
                      </div>

                      <div className="flex items-center">
                        <time className="text-[11px] text-muted-foreground/60 tabular-nums">
                          {formatDate(doc.uploadedAt)}
                        </time>
                      </div>

                      <div className="flex items-center">
                        {doc.aiStatus ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold uppercase tracking-wider ${aiStatusStyles[doc.aiStatus] || aiStatusStyles.skipped}`}
                          >
                            {doc.aiStatus}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">—</span>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {doc.filePath ? (
                          <a
                            href={doc.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                            data-testid={`link-view-${doc.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View
                          </a>
                        ) : !doc.sharepointUrl ? (
                          <span className="text-[11px] text-muted-foreground/40">—</span>
                        ) : null}
                        {doc.sharepointUrl && (
                          <a
                            href={doc.sharepointUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                            data-testid={`link-sharepoint-${doc.id}`}
                            title="Open in SharePoint"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            SharePoint
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border/50 bg-muted/20">
                    <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                  <FolderOpen className="h-7 w-7 text-primary/40" />
                </div>
                <p className="font-serif text-lg text-foreground mb-1">
                  {hasFilters ? "No matching documents" : "No documents yet"}
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {hasFilters
                    ? "Try adjusting your filters to see more results"
                    : "Uploaded documents will appear here as candidates submit files"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        </>)}
      </div>
    </AppLayout>
  );
}
