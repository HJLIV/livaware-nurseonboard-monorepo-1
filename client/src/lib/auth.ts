import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "./queryClient";

interface AuthUser {
  authenticated: boolean;
  username: string;
  name?: string;
  role?: string;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    retry: false,
  });

  return {
    user: data ? { name: data.username, role: data.role, ...data } : null,
    isLoading,
    isAuthenticated: data?.authenticated ?? false,
  };
}
