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
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function fmtIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DevPortalCalendar() {
  const router = useRouter();
  const { user, loading, devApi } = useDevAuth();
  const { activeProjectId } = useActiveProject();
  const [projectId, setProjectId] = useState('');
  const [sprints, setSprints] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));

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
    const [sRes, tRes] = await Promise.all([
      devApi('get', `/projects/${pid}/sprints`),
      devApi('get', `/projects/${pid}/tasks`),
    ]);
    setSprints(sRes.data.data || []);
    setTasks(tRes.data.data || []);
  };

  const { weeks, monthStart, monthEnd } = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month + 1, 0);

    // Grid starts on the Monday on or before the 1st.
    const firstDow = (mStart.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
    const gridStart = new Date(year, month, 1 - firstDow);
    // End Sunday on or after last day of the month.
    const lastDow = (mEnd.getDay() + 6) % 7;
    const gridEnd = new Date(year, month, mEnd.getDate() + (6 - lastDow));

    const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / MS_PER_DAY) + 1;
    const cells: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      cells.push(new Date(year, month, 1 - firstDow + i));
    }
    const weeksArr: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeksArr.push(cells.slice(i, i + 7));
    return { weeks: weeksArr, monthStart: mStart, monthEnd: mEnd };
  }, [anchor]);

  const today = startOfDay(new Date());

  const goPrev = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  const goNext = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
  const goToday = () => setAnchor(startOfDay(new Date()));

  // Build day → sprint-spans and day → tasks maps for fast lookup.
  const sprintsOnDay = (day: Date) => sprints.filter(s => {
    const st = parseDate(s.start_date);
    const en = parseDate(s.end_date);
    if (!st || !en) return false;
    return day.getTime() >= st.getTime() && day.getTime() <= en.getTime();
  });

  const tasksOnDay = (day: Date) => tasks.filter(t => {
    const d = parseDate(t.due_date);
    return d ? sameDay(d, day) : false;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return null;

  const monthLabel = anchor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <DevPortalLayout user={user} title="Calendar">
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Calendar</h1>
            <p className="text-xs text-gray-500 mt-0.5">Monthly view of sprint durations and task due dates</p>
          </div>
          <div className="flex items-center gap-4 text-2xs text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Active sprint</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Task due</span>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="Previous month">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={goNext} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="Next month">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <button onClick={goToday} className="ml-2 px-3 h-8 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">Today</button>
          </div>
          <div className="text-sm font-semibold text-gray-900 capitalize">{monthLabel}</div>
          <div className="w-[140px]" />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 bg-gray-50/50 border-b border-gray-200">
            {WEEKDAYS.map(w => (
              <div key={w} className="px-3 py-2 text-2xs font-semibold text-gray-500 uppercase tracking-wide">{w}</div>
            ))}
          </div>

          {/* Weeks */}
          <div className="divide-y divide-gray-100">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 min-h-[112px]">
                {week.map(day => {
                  const inMonth = sameMonth(day, anchor);
                  const isToday = sameDay(day, today);
                  const daySprints = sprintsOnDay(day);
                  const dayTasks = tasksOnDay(day);
                  return (
                    <div key={fmtIsoDate(day)} className={`border-r border-gray-100 last:border-r-0 p-1.5 ${inMonth ? 'bg-white' : 'bg-gray-50/40'} ${isToday ? 'ring-1 ring-inset ring-indigo-300' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-2xs font-semibold ${isToday ? 'bg-indigo-600 text-white px-1.5 py-0.5 rounded-md' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{day.getDate()}</span>
                        {inMonth && (day.getDate() === 1 || sameDay(day, monthStart)) && (
                          <span className="text-[9px] uppercase tracking-wide text-gray-400">{day.toLocaleDateString('de-DE', { month: 'short' })}</span>
                        )}
                      </div>

                      {/* Sprint bars */}
                      <div className="space-y-1">
                        {daySprints.slice(0, 2).map(s => {
                          const st = parseDate(s.start_date);
                          const en = parseDate(s.end_date);
                          const isStart = st && sameDay(st, day);
                          const isEnd = en && sameDay(en, day);
                          const isEdgeLeft = isStart || day.getDay() === 1; // Monday or sprint start
                          const isEdgeRight = isEnd || day.getDay() === 0;  // Sunday or sprint end
                          return (
                            <div key={s.id}
                                 onClick={() => router.push('/dev-portal/sprints')}
                                 title={`${s.name} — ${s.start_date} → ${s.end_date}`}
                                 className={`h-4 px-1.5 text-[9px] font-medium text-white truncate cursor-pointer hover:opacity-80 ${SPRINT_STATUS_COLORS[s.status] || 'bg-gray-400'} ${isEdgeLeft ? 'rounded-l-md' : ''} ${isEdgeRight ? 'rounded-r-md' : ''}`}>
                              {isStart ? s.name : isEdgeLeft ? '…' : ''}
                            </div>
                          );
                        })}
                        {daySprints.length > 2 && (
                          <div className="text-[9px] text-gray-400 pl-1">+{daySprints.length - 2} more</div>
                        )}
                      </div>

                      {/* Task due chips */}
                      <div className="mt-1 space-y-0.5">
                        {dayTasks.slice(0, 3).map(t => (
                          <div key={t.id}
                               onClick={() => router.push(`/dev-portal/tasks/${t.id}`)}
                               title={`${t.title} — due ${t.due_date}`}
                               className="flex items-center gap-1 text-[10px] text-gray-700 cursor-pointer hover:text-indigo-600 truncate">
                            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || 'bg-gray-300'}`} />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[9px] text-gray-400 pl-2.5">+{dayTasks.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {sprints.length === 0 && tasks.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-500">No sprints or tasks to display yet.</p>
          </div>
        )}
      </div>
    </DevPortalLayout>
  );
}
