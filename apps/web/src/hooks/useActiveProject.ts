import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

interface UseActiveProjectResult {
  activeProjectId: string | null;
  isLoading: boolean;
  refresh: () => void;
}

export function useActiveProject(): UseActiveProjectResult {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(() => {
    setIsLoading(true);
    // B-5: auth rides on the dev_portal_token httpOnly cookie — no localStorage read.
    axios
      .get(`${API_URL}/api/v1/dev-portal/active-project`, {
        withCredentials: true,
      })
      .then(res => {
        if (res.data.success) {
          setActiveProjectId(res.data.data?.active_project_id ?? null);
        }
      })
      .catch(() => {
        setActiveProjectId(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { activeProjectId, isLoading, refresh: fetch };
}
