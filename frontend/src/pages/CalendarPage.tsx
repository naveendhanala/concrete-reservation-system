// src/pages/CalendarPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { slotsApi } from '../api/index';
import { format, addDays, startOfWeek } from 'date-fns';

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => slotsApi.getCalendar(from, to),
  });

  // Group by date
  const byDate: Record<string, any[]> = {};
  slots.forEach((s: any) => {
    const d = (s.slot_date as string).slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });

  const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900">Capacity Calendar</h1>
        <div className="flex gap-2 items-center">
          <button className="btn-secondary text-xs" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <span className="text-sm text-gray-600 flex-1 text-center">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</span>
          <button className="btn-secondary text-xs" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" /><span>Available</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" /><span>&gt;50% utilized</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /><span>&gt;80% utilized</span></div>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />
      ) : (
        <div className="overflow-x-auto -mx-1 pb-2">
        <div className="grid grid-cols-7 gap-2 min-w-[640px] px-1">
          {days.map((day) => (
            <div key={day} className="card overflow-hidden">
              <div className="bg-gray-50 px-2 py-1.5 border-b border-gray-100 text-center">
                <p className="text-xs font-semibold text-gray-700">{format(new Date(day + 'T00:00:00'), 'EEE')}</p>
                <p className="text-sm font-bold text-gray-900">{format(new Date(day + 'T00:00:00'), 'd MMM')}</p>
              </div>
              <div className="p-1 space-y-0.5 max-h-96 overflow-y-auto">
                {(byDate[day] || []).map((slot: any) => {
                  const util = slot.utilization_pct || 0;
                  const bg = util > 80 ? 'bg-red-100 border-red-200' : util > 50 ? 'bg-yellow-100 border-yellow-200' : 'bg-green-50 border-green-200';
                  const bar = util > 80 ? 'bg-red-400' : util > 50 ? 'bg-yellow-400' : 'bg-green-400';
                  return (
                    <div key={slot.slot_id} className={`border rounded p-1.5 text-xs ${bg}`}>
                      <p className="font-medium">{(slot.start_time ?? '').slice(11, 16)}</p>
                      <div className="h-1 bg-gray-200 rounded mt-1">
                        <div className={`h-1 rounded ${bar}`} style={{ width: `${Math.min(util, 100)}%` }} />
                      </div>
                      <p className="text-gray-500 mt-0.5">Requested: {slot.total_allocated || 0}/{slot.capacity_m3}m³</p>
                      <p className="text-blue-600 mt-0.5">Actual: {slot.total_actual || 0}m³</p>
                    </div>
                  );
                })}
                {!byDate[day] && <p className="text-xs text-gray-400 p-2 text-center">No slots</p>}
              </div>
            </div>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
