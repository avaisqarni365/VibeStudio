import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

export default function DevPortalHelp() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [wikiPage, setWikiPage] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    if (!user) return;
    const load = (pid: string) => {
      setProjectId(pid);
      devApi('get', `/projects/${pid}/wiki`).then(w => {
        const page = (w.data.data || []).find((p: any) => p.slug === 'guide-handbook');
        if (page) devApi('get', `/wiki/${page.id}`).then(wp => setWikiPage(wp.data.data));
      });
    };
    if (activeProjectId) {
      load(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        if (r.data.data?.[0]) load(r.data.data[0].id);
      });
    }
  }, [user, activeProjectId]);

  const syncAndReload = async () => {
    if (!projectId) return;
    setSyncing(true);
    await devApi('post', `/projects/${projectId}/wiki/sync-project`);
    const w = await devApi('get', `/projects/${projectId}/wiki`);
    const page = (w.data.data || []).find((p: any) => p.slug === 'guide-handbook');
    if (page) { const wp = await devApi('get', `/wiki/${page.id}`); setWikiPage(wp.data.data); }
    setSyncing(false);
  };

  if (loading || !user) return <div className="min-h-screen bg-gray-50" />;
  const isMgr = ['ceo', 'lead', 'product_owner'].includes(user.role);

  return (
    <DevPortalLayout user={user} title="Handbook">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Platform Handbook</h1>
            <p className="text-xs text-gray-500 mt-0.5">Business processes, German compliance, module reference</p>
          </div>
          <div className="flex items-center gap-2">
            {isMgr && <button onClick={syncAndReload} disabled={syncing} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Syncing...' : 'Sync from Project'}</button>}
            {wikiPage && <button onClick={() => router.push('/dev-portal/wiki')} className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg font-medium hover:bg-indigo-50">Edit in Wiki</button>}
          </div>
        </div>

        {wikiPage?.content ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 max-h-[75vh] overflow-y-auto"><Md content={wikiPage.content} /></div>
        ) : isMgr ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center py-10">
            <p className="text-sm text-gray-500 mb-3">No handbook wiki page yet.</p>
            <button onClick={syncAndReload} disabled={syncing} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">{syncing ? 'Generating...' : 'Generate from Project'}</button>
          </div>
        ) : <div className="bg-white border border-gray-200 rounded-xl p-6 text-center py-10 text-sm text-gray-400">Handbook not generated yet.</div>}
      </div>
    </DevPortalLayout>
  );
}

function Md({ content }: { content: string }) {
  let inCode = false, codeLines: string[] = [], codeLang = '';
  const els: JSX.Element[] = [];
  content.split('\n').forEach((line, i) => {
    if (line.startsWith('```') && !inCode) { inCode = true; codeLang = line.slice(3).trim(); codeLines = []; return; }
    if (line.startsWith('```') && inCode) { inCode = false; els.push(<div key={`c${i}`} className="my-2 rounded-xl overflow-hidden border border-gray-200">{codeLang && <div className="bg-gray-100 px-3 py-1 text-2xs font-mono text-gray-500 border-b">{codeLang}</div>}<pre className="bg-gray-900 text-gray-300 text-xs font-mono px-4 py-3 overflow-x-auto">{codeLines.join('\n')}</pre></div>); return; }
    if (inCode) { codeLines.push(line); return; }
    if (line.startsWith('### ')) { els.push(<h3 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1.5">{line.slice(4)}</h3>); return; }
    if (line.startsWith('## ')) { els.push(<h2 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-100">{line.slice(3)}</h2>); return; }
    if (line.startsWith('# ')) { els.push(<h1 key={i} className="text-xl font-bold text-gray-900 mb-3">{line.slice(2)}</h1>); return; }
    if (line.startsWith('> ')) { els.push(<blockquote key={i} className="border-l-2 border-indigo-300 pl-3 text-xs text-gray-500 italic my-1">{line.slice(2)}</blockquote>); return; }
    if (line.startsWith('| ')) { const cells = line.split('|').filter(Boolean).map(c => c.trim()); if (cells.every(c => /^[-:]+$/.test(c))) return; els.push(<div key={i} className="flex border-b border-gray-100">{cells.map((c, j) => <div key={j} className="flex-1 px-2 py-1 text-2xs text-gray-700" dangerouslySetInnerHTML={{ __html: c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code class="text-2xs bg-gray-100 px-1 rounded text-indigo-700 font-mono">$1</code>') }} />)}</div>); return; }
    if (line.startsWith('- ')) { els.push(<li key={i} className="text-xs text-gray-700 ml-4 list-disc" dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code class="text-2xs bg-gray-100 px-1 rounded text-indigo-700 font-mono">$1</code>') }} />); return; }
    if (line.startsWith('---')) { els.push(<hr key={i} className="my-4 border-gray-200" />); return; }
    if (!line.trim()) { els.push(<div key={i} className="h-1.5" />); return; }
    els.push(<p key={i} className="text-xs text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code class="text-2xs bg-gray-100 px-1 rounded text-indigo-700 font-mono">$1</code>') }} />);
  });
  return <>{els}</>;
}
