import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

interface DevUser {
  id: string;
  email: string;
  name: string;
  display_name?: string;
  role: string;
  title?: string;
  department?: string;
  avatar_url?: string;
  is_ai_agent?: boolean;
  agent_type?: string;
  skills?: string[];
  github_username?: string;
  status: string;
}

/**
 * B-5: Dev portal auth now rides on an httpOnly `dev_portal_token` cookie set
 * by the backend at /auth/login. The frontend never sees the token; axios
 * sends the cookie automatically via { withCredentials: true }. `token` is
 * kept in the return shape for back-compat with callers but is always null.
 */
// Read the localStorage fallback token if a previous login stashed one.
// Used as Authorization: Bearer header on every request alongside the
// httpOnly cookie — whichever the backend can verify first wins. The
// fallback exists because some browsers drop cross-port cookies on
// localhost (3000 → 4000) even with proper CORS + sameSite=lax.
function readBearer(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('dev_portal_token'); } catch { return null; }
}

function bearerHeader(): Record<string, string> {
  const t = readBearer();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function useDevAuth() {
  const router = useRouter();
  const [user, setUser] = useState<DevUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/dev-portal/auth/me`, {
      withCredentials: true,
      headers: bearerHeader(),
    }).then(res => {
      if (res.data.success) {
        setUser(res.data.data);
      } else if (!router.pathname.includes('/login')) {
        router.push('/dev-portal/login');
      }
    }).catch(() => {
      if (!router.pathname.includes('/login')) router.push('/dev-portal/login');
    }).finally(() => setLoading(false));
  }, []);

  const devApi = useCallback((method: string, url: string, data?: any) => {
    return axios({
      method,
      url: `${API_URL}/api/v1/dev-portal${url}`,
      data,
      withCredentials: true,
      headers: bearerHeader(),
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/api/v1/dev-portal/auth/logout`, {}, {
        withCredentials: true,
        headers: bearerHeader(),
      });
    } catch {
      // non-fatal — cookie may already be expired server-side
    }
    // Clear both auth surfaces so subsequent /auth/me genuinely fails.
    try { window.localStorage.removeItem('dev_portal_token'); } catch { /* ignore */ }
    setUser(null);
    router.push('/dev-portal/login');
  }, [router]);

  return { user, loading, token: null as string | null, devApi, logout };
}
