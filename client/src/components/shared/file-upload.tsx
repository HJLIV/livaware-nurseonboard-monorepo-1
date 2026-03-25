import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedFile {
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

interface FileUploadProps {
  uploadUrl: string;
  onUploadComplete: (file: UploadedFile) => void;
  accept?: string;
  maxSizeMB?: number;
  "data-testid"?: string;
}

export function FileUpload({
  uploadUrl,
  onUploadComplete,
  accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx",
  maxSizeMB = 10,
  "data-testid": testId,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${maxSizeMB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const uploaded: UploadedFile = {
        filename: data.filename || file.name,
        originalFilename: data.originalFilename || file.name,
        filePath: data.filePath || data.path || "",
        fileSize: data.fileSize || file.size,
        mimeType: data.mimeType || file.type,
      };
      setUploadedFile(uploaded);
      onUploadComplete(uploaded);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [uploadUrl, onUploadComplete, maxSizeMB]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [handleFile]);

  const reset = useCallback(() => {
    setUploadedFile(null);
    setError(null);
  }, []);

  if (uploadedFile) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20"
        data-testid={testId}
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{uploadedFile.originalFilename}</p>
          <p className="text-xs text-muted-foreground">
            {(uploadedFile.fileSize / 1024).toFixed(0)} KB
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="shrink-0 h-8 w-8 p-0">
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5"
            : error
              ? "border-destructive/40 bg-destructive/5"
              : "border-border hover:border-primary/40 hover:bg-muted/50",
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragOver ? "Drop file here" : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, JPG, PNG, DOC up to {maxSizeMB}MB
              </p>
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
