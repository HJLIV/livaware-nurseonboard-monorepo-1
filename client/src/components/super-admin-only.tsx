// Visual hint shown on platform-config pages when a non-super-admin is
// viewing them. The backend is the source of truth — these components
// just keep the UI honest so no one wastes time clicking buttons that
// would 403.

import { ShieldAlert } from "lucide-react";
import { useAuthRole } from "@/lib/use-auth-role";
import { cn } from "@/lib/utils";

export function SuperAdminViewOnlyBanner({ className }: { className?: string }) {
  const { isSuperAdmin, isLoading } = useAuthRole();
  if (isLoading || isSuperAdmin) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-amber-200",
        className,
      )}
      data-testid="banner-super-admin-only"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="text-xs leading-relaxed">
        <p className="font-semibold text-amber-100">Super admin only</p>
        <p className="text-amber-200/80">
          You can view these settings, but only the super admin can edit
          them. Contact your super admin to request changes.
        </p>
      </div>
    </div>
  );
}

// Wrap an action (button / form / dialog) so it renders only when the
// signed-in user is the super admin. Useful around "New", "Save",
// "Delete", "Send" buttons on platform-config screens.
export function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useAuthRole();
  if (!isSuperAdmin) return null;
  return <>{children}</>;
}

// Inline pill marker used next to a control to label it as super-admin
// gated. Pair with SuperAdminGate when you want to label what would be
// shown if the viewer had super-admin rights.
export function SuperAdminBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300",
        className,
      )}
      data-testid="badge-super-admin-only"
    >
      <ShieldAlert className="h-2.5 w-2.5" />
      Super admin
    </span>
  );
}
