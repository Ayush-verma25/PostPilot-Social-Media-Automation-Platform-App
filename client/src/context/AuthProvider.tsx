import { useEffect, useState } from "react";
import { AUTH_FAILURE_EVENT } from "../api/axios";
import { AuthContext, type User } from "./AuthContext";

interface AuthState {
  user: User | null;
  token: string | null;
}

const clearStoredAuth = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
};

const getTokenExpiration = (token: string): number | null => {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : null;
  } catch {
    return null;
  }
};

function readStoredAuth(): AuthState {
  const storedUser = localStorage.getItem("user");
  const token = localStorage.getItem("token");

  const expiration = token ? getTokenExpiration(token) : null;
  if (!storedUser || !token || !expiration || expiration <= Date.now()) {
    clearStoredAuth();
    return { user: null, token: null };
  }

  try {
    return { user: JSON.parse(storedUser) as User, token };
  } catch {
    clearStoredAuth();
    return { user: null, token: null };
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [auth, setAuth] = useState(readStoredAuth);

  useEffect(() => {
    const syncAuth = () => setAuth(readStoredAuth());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "user" || event.key === "token") {
        syncAuth();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_FAILURE_EVENT, syncAuth);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_FAILURE_EVENT, syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!auth.token) return;

    const expiration = getTokenExpiration(auth.token);
    if (!expiration) {
      const timeoutId = window.setTimeout(() => {
        if (localStorage.getItem("token") === auth.token) {
          clearStoredAuth();
          setAuth({ user: null, token: null });
        }
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    let timeoutId: number;
    const expireSession = () => {
      if (localStorage.getItem("token") !== auth.token) return;
      const remaining = expiration - Date.now();
      if (remaining <= 0) {
        clearStoredAuth();
        setAuth({ user: null, token: null });
      } else {
        timeoutId = window.setTimeout(
          expireSession,
          Math.min(remaining, 2_147_000_000),
        );
      }
    };

    timeoutId = window.setTimeout(
      expireSession,
      Math.min(expiration - Date.now(), 2_147_000_000),
    );
    return () => window.clearTimeout(timeoutId);
  }, [auth.token]);


  const login = (user: User, token: string) => {
    if ((getTokenExpiration(token) ?? 0) <= Date.now()) {
      clearStoredAuth();
      setAuth({ user: null, token: null });
      return;
    }
    setAuth({ user, token });
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", token);
  };

  const logout = () => {
    setAuth({ user: null, token: null });
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        isLoading: false,
        login,
        logout,
        isAuthenticated: !!auth.token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};