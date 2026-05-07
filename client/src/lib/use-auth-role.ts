// Lightweight hook used by gated UI controls + the super-admin section
// in the sidebar. Returns the live session role from /api/auth/me; we
// already cache that endpoint elsewhere, so this is essentially free.

import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export type SessionRole = "admin" | "team" | "super_admin" | undefined;

export function useAuthRole(): {
  role: SessionRole;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<{ role?: SessionRole } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30000,
    retry: false,
  });
  const role = data?.role;
  return {
    role,
    isSuperAdmin: role === "super_admin",
    isAdmin: role === "admin" || role === "super_admin",
    isLoading,
  };
}
