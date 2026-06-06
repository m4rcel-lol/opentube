import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@opentube/shared";
import { api, ensureCsrf } from "./client.js";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const response = await api.auth.me();
    setUser(response.user);
  }

  useEffect(() => {
    void ensureCsrf()
      .then(refresh)
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refresh,
      async login(usernameOrEmail, password) {
        const response = await api.auth.login(usernameOrEmail, password);
        setUser(response.user);
      },
      async register(username, email, password) {
        const response = await api.auth.register(username, email, password);
        setUser(response.user);
      },
      async logout() {
        await api.auth.logout();
        setUser(null);
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
