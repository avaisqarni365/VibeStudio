import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import DevPortalLayout from '@/components/layouts/DevPortalLayout';
import { useDevAuth } from '@/hooks/useDevAuth';
import { useActiveProject } from '@/hooks/useActiveProject';

const SPRINT_STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-400',
  active: 'bg-emerald-500',
  review: 'bg-purple-500',
  completed: 'bg-blue-500',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-400',
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAY_WIDTH = 28;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function DevPortalGantt() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [projectId, setProjectId] = useState('');
  const [sprints, setSprints] = useState<any[]>([]);
  const [tasksBySprint, setTasksBySprint] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!loading && !user) router.push('/dev-portal/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    if (activeProjectId) {
      setProjectId(activeProjectId);
      loadAll(activeProjectId);
    } else {
      devApi('get', '/projects').then(r => {
        const first = r.data.data?.[0];
        if (first) {
          setProjectId(first.id);
          loadAll(first.id);
        }
      });
    }
  }, [user, activeProjectId]);

  const loadAll = async (pid: string) => {
    const sRes = await devApi('get', `/projects/${pid}/sprints`);
    const list = sRes.data.data || [];
    setSprints(list);

    const taskResults = await Promise.all(
      list.map((s: any) => devApi('get', `/sprints/${s.id}/tasks`).then(r => [s.id, r.data.data || []] as const).catch(() => [s.id, []] as const)),
    );
    const byId: Record<string, any[]> = {};
    for (const [id, ts] of taskResults) byId[id] = ts;
    setTasksBySprint(byId);
  };

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    for (const s of sprints) {
      const st = parseDate(s.start_date);
      const en = parseDate(s.end_date);
      if (st) dates.push(st);
      if (en) dates.push(en);
    }
    for (const tasks of Object.values(tasksBySprint)) {
      for (const t of tasks) {
        const d = parseDate(t.due_date);
        if (d) dates.push(d);
      }
    }
    if (dates.length === 0) {
      const today = startOfDay(new Date());
      return { rangeStart: addDays(today, -7), rangeEnd: addDays(today, 21), totalDays: 28 };
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    const padStart = addDays(startOfDay(min), -2);
    const padEnd = addDays(startOfDay(max), 2);
    return { rangeStart: padStart, rangeEnd: padEnd, totalDays: daysBetween(padStart, padEnd) + 1 };
  }, [sprints, tasksBySprint]);

  const today = startOfDay(new Date());
  const todayOffset = daysBetween(rangeStart, today);

  const dayHeaders = useMemo(() => {
    const arr: { date: Date; isMonthStart: boolean; isWeekStart: boolean; isWeekend: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      arr.push({
        date: d,
        isMonthStart: d.getDate() === 1,
        isWeekStart: d.getDay() === 1,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }
    return arr;
  }, [rangeStart, totalDays]);

  const gridWidth = totalDays * DAY_WIDTH;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return null;

  return (
    <DevPortalLayout user={user} title="Gantt">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Gantt</h1>
            <p className="text-xs text-gray-500 mt-0.5">Timeline of sprints and tasks across the project</p>
          </div>
          <div className="flex items-center gap-4 text-2xs text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Active</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" />Planning</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" />Review</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Completed</span>
          </div>
        </div>

        {sprints.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-sm text-gray-500">No sprints yet for this project.</p>
            <button onClick={() => router.push('/dev-portal/sprints')} className="mt-3 px-4 py-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Go to Sprints →
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex">
              {/* Left fixed column — sprint names */}
              <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50/50">
                <div className="h-12 border-b border-gray-200 px-4 flex items-center text-2xs font-semibold text-gray-500 uppercase tracking-wide">Sprint / Task</div>
                {sprints.map(s => (
                  <div key={s.id}>
                    <div className="h-10 px-4 flex items-center gap-2 border-b border-gray-100 hover:bg-white cursor-pointer"
                         onClick={() => router.push('/dev-portal/sprints')}>
                      <span className={`w-1.5 h-1.5 rounded-full ${SPRINT_STATUS_COLORS[s.status] || 'bg-gray-400'}`} />
                      <span className="text-xs font-medium text-gray-900 truncate">{s.name}</span>
                    </div>
                    {(tasksBySprint[s.id] || []).slice(0, 8).map((t: any) => (
                      <div key={t.id} className="h-8 px-6 flex items-center gap-2 border-b border-gray-100 hover:bg-white cursor-pointer"
                           onClick={() => router.push(`/dev-portal/tasks/${t.id}`)}>
                        <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                        <span className="text-2xs text-gray-600 truncate">{t.title}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Right scrollable timeline */}
              <div className="flex-1 overflow-x-auto">
                <div style={{ width: gridWidth }} className="relative">
                  {/* Day header row */}
                  <div className="h-12 border-b border-gray-200 relative flex">
                    {dayHeaders.map((dh, i) => (
                      <div key={i} style={{ width: DAY_WIDTH }} className={`shrink-0 text-center border-l ${dh.isMonthStart ? 'border-gray-300' : dh.isWeekStart ? 'border-gray-200' : 'border-transparent'} ${dh.isWeekend ? 'bg-gray-50/60' : ''}`}>
                        {dh.isMonthStart && <div className="text-2xs font-semibold text-gray-700 pt-1.5">{dh.date.toLocaleDateString('de-DE', { month: 'short' })}</div>}
                        {!dh.isMonthStart && dh.isWeekStart && <div className="text-2xs text-gray-400 pt-1.5">KW {Math.ceil(dh.date.getDate() / 7)}</div>}
                        <div className={`text-[10px] ${dh.isWeekend ? 'text-gray-400' : 'text-gray-500'} pt-1`}>{dh.date.getDate()}</div>
                      </div>
                    ))}
                  </div>

                  {/* Today vertical line */}
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div className="absolute top-0 bottom-0 w-px bg-red-400 z-20 pointer-events-none" style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}>
                      <div className="absolute top-1 -left-5 text-[9px] font-semibold text-red-500 bg-white px-1 rounded">today</div>
                    </div>
                  )}

                  {/* Sprint + task rows */}
                  {sprints.map(s => {
                    const st = parseDate(s.start_date);
                    const en = parseDate(s.end_date);
                    const offset = st ? daysBetween(rangeStart, st) : 0;
                    const width = st && en ? (daysBetween(st, en) + 1) * DAY_WIDTH : 0;
                    return (
                      <div key={s.id}>
                        <div className="h-10 border-b border-gray-100 relative flex">
                          {dayHeaders.map((dh, i) => (
                            <div key={i} style={{ width: DAY_WIDTH }} className={`shrink-0 border-l ${dh.isMonthStart ? 'border-gray-200' : dh.isWeekStart ? 'border-gray-100' : 'border-transparent'} ${dh.isWeekend ? 'bg-gray-50/60' : ''}`} />
                          ))}
                          {st && en && (
                            <div className={`absolute top-2 h-6 rounded-md ${SPRINT_STATUS_COLORS[s.status] || 'bg-gray-400'} opacity-90 flex items-center px-2 shadow-sm`}
                                 style={{ left: offset * DAY_WIDTH + 2, width: width - 4 }}
                                 title={`${s.name} — ${s.start_date} → ${s.end_date}`}>
                              <span className="text-2xs font-medium text-white truncate">{s.name}</span>
                            </div>
                          )}
                        </div>
                        {(tasksBySprint[s.id] || []).slice(0, 8).map((t: any) => {
                          const due = parseDate(t.due_date);
                          const dueOffset = due ? daysBetween(rangeStart, due) : null;
                          return (
                            <div key={t.id} className="h-8 border-b border-gray-100 relative flex">
                              {dayHeaders.map((dh, i) => (
                                <div key={i} style={{ width: DAY_WIDTH }} className={`shrink-0 border-l ${dh.isMonthStart ? 'border-gray-200' : dh.isWeekStart ? 'border-gray-100' : 'border-transparent'} ${dh.isWeekend ? 'bg-gray-50/60' : ''}`} />
                              ))}
                              {dueOffset != null && dueOffset >= 0 && dueOffset < totalDays && (
                                <div className={`absolute top-2 w-4 h-4 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-300'} border-2 border-white shadow-sm`}
                                     style={{ left: dueOffset * DAY_WIDTH + (DAY_WIDTH - 16) / 2 }}
                                     title={`${t.title} — due ${t.due_date}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}
