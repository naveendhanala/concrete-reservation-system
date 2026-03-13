// src/pages/NewReservationPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { reservationsApi, slotsApi, usersApi } from '../api/index';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { AlertCircle, Info } from 'lucide-react';

const GRADES = ['M15', 'M20', 'M25', 'M30', 'M30_SRC', 'M45'];
const POURING_TYPES = ['BoomPlacer', 'ConcretePump', 'Chute'];

export default function NewReservationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    quantity_m3: '',
    grade: 'M25',
    structure: '',
    chainage: '',
    nature_of_work: '',
    pouring_type: 'BoomPlacer',
    site_engineer_id: '',
    contractor_id: '',
    slotId: '',
    selectedDate: '',
  });
  const [contractorSearch, setContractorSearch] = useState('');
  const [splitWarning, setSplitWarning] = useState<string | null>(null);
  const [isSameDay, setIsSameDay] = useState(false);

  // Fetch today + tomorrow with their predefined shifts
  const { data: bookableDates = [], isLoading: datesLoading } = useQuery({
    queryKey: ['bookable-dates'],
    queryFn: () => slotsApi.getBookableDates(),
  });

  // Slots for the selected date (from the already-fetched bookable data)
  const selectedDayData = bookableDates.find((d: any) => d.date === form.selectedDate);
  const availableSlots = selectedDayData?.slots || [];

  // Detect same-day when date changes
  useEffect(() => {
    if (!form.selectedDate) return;
    const today = new Date().toISOString().split('T')[0];
    setIsSameDay(form.selectedDate === today);
    setForm((f) => ({ ...f, slotId: '' }));
  }, [form.selectedDate]);

  // Split warning when slot + quantity selected
  useEffect(() => {
    if (form.slotId && form.quantity_m3) {
      const slot = availableSlots.find((s: any) => s.slot_id === form.slotId);
      if (slot && parseFloat(form.quantity_m3) > slot.available_m3) {
        setSplitWarning(`Quantity exceeds shift capacity (${slot.available_m3} m³ available). Request will auto-split across consecutive shifts.`);
      } else {
        setSplitWarning(null);
      }
    }
  }, [form.slotId, form.quantity_m3]);

  const { data: engineers = [] } = useQuery({
    queryKey: ['engineers', user?.packageIds?.[0]],
    queryFn: () => usersApi.getEngineers(user?.packageIds?.[0] || ''),
    enabled: !!user?.packageIds?.[0],
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors', contractorSearch],
    queryFn: () => usersApi.getContractors(contractorSearch),
  });

  const selectedEngineer = engineers.find((e: any) => e.engineer_id === form.site_engineer_id);

  const createMutation = useMutation({
    mutationFn: (data: any) => reservationsApi.create(data),
    onSuccess: (res) => {
      toast.success(`Reservation ${res.reservation_number} created!`);
      navigate(`/reservations/${res.reservation_id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create reservation');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.slotId) { toast.error('Please select a time slot'); return; }
    createMutation.mutate({
      slotId: form.slotId,
      quantity_m3: parseFloat(form.quantity_m3),
      grade: form.grade,
      structure: form.structure,
      chainage: form.chainage,
      nature_of_work: form.nature_of_work,
      pouring_type: form.pouring_type,
      site_engineer_id: form.site_engineer_id,
      contractor_id: form.contractor_id,
    });
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Concrete Reservation</h1>
        <p className="text-sm text-gray-500 mt-0.5">{user?.packageNames?.[0]}</p>
      </div>

      {isSameDay && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-700">
            <p className="font-medium">Same-Day Request</p>
            <p>This requires VP approval. Your same-day request count: <strong>{user?.sameDayRequestCount || 0}</strong></p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Day Selection — Today or Tomorrow */}
        <div>
          <label className="label">Day <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-3">
            {datesLoading ? (
              <div className="col-span-2 text-sm text-gray-400">Loading available days...</div>
            ) : (
              bookableDates.map((day: any) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, selectedDate: day.date, slotId: '' }))}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    form.selectedDate === day.date
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className="font-semibold text-sm text-gray-900">{day.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{day.date}</p>
                  <p className="text-xs text-gray-400 mt-1">{day.slots.length} shift{day.slots.length !== 1 ? 's' : ''} available</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Shift Selection */}
        {form.selectedDate && (
          <div>
            <label className="label">Shift <span className="text-red-500">*</span></label>
            {availableSlots.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No shifts available for this day.</p>
            ) : (
              <div className="space-y-2">
                {availableSlots.map((slot: any) => {
                  const startTime = (slot.start_time ?? '').slice(11, 16);
                  const endTime = (slot.end_time ?? '').slice(11, 16);
                  const utilPct = Math.round(((slot.capacity_m3 - slot.available_m3) / slot.capacity_m3) * 100);
                  const isSelected = form.slotId === slot.slot_id;
                  return (
                    <button
                      key={slot.slot_id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, slotId: slot.slot_id }))}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-sm text-gray-900">{slot.shift_name}</span>
                          <span className="text-gray-400 text-sm ml-2">{startTime} – {endTime}</span>
                        </div>
                        <span className="text-sm font-medium text-green-600">{slot.available_m3} m³ free</span>
                      </div>
                      {/* Capacity bar */}
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full">
                        <div
                          className={`h-1.5 rounded-full ${utilPct > 80 ? 'bg-red-400' : utilPct > 50 ? 'bg-yellow-400' : 'bg-green-400'}`}
                          style={{ width: `${utilPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{utilPct}% utilized · {slot.capacity_m3} m³ total</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Split warning */}
        {splitWarning && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">{splitWarning}</p>
          </div>
        )}

        {/* Quantity & Grade */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Quantity (m³) <span className="text-red-500">*</span></label>
            <input type="number" className="input" placeholder="e.g. 30" step="0.5" min="0.5" max="50"
              value={form.quantity_m3} onChange={set('quantity_m3')} required />
          </div>
          <div>
            <label className="label">Grade <span className="text-red-500">*</span></label>
            <select className="input" value={form.grade} onChange={set('grade')} required>
              {GRADES.map((g) => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {/* Structure & Chainage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Structure <span className="text-red-500">*</span></label>
            <input type="text" className="input" placeholder="e.g. Pier Cap P12"
              value={form.structure} onChange={set('structure')} required />
          </div>
          <div>
            <label className="label">Chainage <span className="text-red-500">*</span></label>
            <input type="text" className="input" placeholder="e.g. CH 12+450"
              value={form.chainage} onChange={set('chainage')} required />
          </div>
        </div>

        {/* Nature of Work */}
        <div>
          <label className="label">Nature of Work <span className="text-red-500">*</span></label>
          <textarea className="input" rows={2} placeholder="Describe the work..."
            value={form.nature_of_work} onChange={set('nature_of_work')} required />
        </div>

        {/* Pouring Type */}
        <div>
          <label className="label">Pouring Type <span className="text-red-500">*</span></label>
          <select className="input" value={form.pouring_type} onChange={set('pouring_type')} required>
            {POURING_TYPES.map((p) => <option key={p} value={p}>{p.replace(/([A-Z])/g, ' $1').trim()}</option>)}
          </select>
        </div>

        {/* Site Engineer */}
        <div>
          <label className="label">Site Engineer <span className="text-red-500">*</span></label>
          <select className="input" value={form.site_engineer_id} onChange={set('site_engineer_id')} required>
            <option value="">Select engineer</option>
            {engineers.map((e: any) => (
              <option key={e.engineer_id} value={e.engineer_id}>{e.name}</option>
            ))}
          </select>
          {selectedEngineer && (
            <p className="text-xs text-gray-500 mt-1">Contact: {selectedEngineer.contact}</p>
          )}
        </div>

        {/* Contractor */}
        <div>
          <label className="label">Contractor <span className="text-red-500">*</span></label>
          <input type="text" className="input mb-1" placeholder="Search contractor..."
            value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)} />
          <select className="input" value={form.contractor_id} onChange={set('contractor_id')} required>
            <option value="">Select contractor</option>
            {contractors.map((c: any) => (
              <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={() => navigate('/reservations')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Submitting...' : isSameDay ? 'Submit (Needs VP Approval)' : 'Submit Reservation'}
          </button>
        </div>
      </form>
    </div>
  );
}