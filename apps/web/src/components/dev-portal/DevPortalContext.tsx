import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface Space { id: string; name: string; icon: string; color: string; lists: List[]; }
interface List { id: string; name: string; icon: string; color?: string; space_id: string; task_count: number; done_count: number; }
interface Favorite { id: string; target_type: string; target_id: string; target_name: string; }
interface Channel { id: string; name: string; icon: string; type: string; unread_count: number; }

interface DevPortalContextType {
  spaces: Space[];
  favorites: Favorite[];
  channels: Channel[];
  inboxCount: number;
  activeSpaceId: string | null;
  activeListId: string | null;
  activeView: string;
  setActiveSpaceId: (id: string | null) => void;
  setActiveListId: (id: string | null) => void;
  setActiveView: (view: string) => void;
  refresh: () => void;
}

const DevPortalContext = createContext<DevPortalContextType>({
  spaces: [], favorites: [], channels: [], inboxCount: 0,
  activeSpaceId: null, activeListId: null, activeView: 'overview',
  setActiveSpaceId: () => {}, setActiveListId: () => {}, setActiveView: () => {},
  refresh: () => {},
});

export function useDevPortal() { return useContext(DevPortalContext); }

export function DevPortalProvider({ children, devApi }: { children: ReactNode; devApi: (method: string, url: string, data?: any) => Promise<any> }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('overview');

  const refresh = useCallback(() => {
    devApi('get', '/spaces').then(r => {
      const s = r.data.data || [];
      setSpaces(s);
      if (!activeSpaceId && s[0]) setActiveSpaceId(s[0].id);
    }).catch(() => {});
    devApi('get', '/favorites').then(r => setFavorites(r.data.data || [])).catch(() => {});
    devApi('get', '/channels').then(r => setChannels(r.data.data || [])).catch(() => {});
    devApi('get', '/inbox/count').then(r => setInboxCount(r.data.data?.count || 0)).catch(() => {});
  }, [devApi, activeSpaceId]);

  useEffect(() => { refresh(); }, []);

  return (
    <DevPortalContext.Provider value={{ spaces, favorites, channels, inboxCount, activeSpaceId, activeListId, activeView, setActiveSpaceId, setActiveListId, setActiveView, refresh }}>
      {children}
    </DevPortalContext.Provider>
  );
}
