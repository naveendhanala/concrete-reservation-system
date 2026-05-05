// src/pages/LabourMobilizationReportPage.tsx
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/index';
import { Users } from 'lucide-react';

const TOTAL_REQUIRED: Record<string, number> = {
  'E6': 230,
  'N11': 200,
  'N13': 290,
  'N14': 150,
  'E8': 260,
  'E9': 250,
  'N7': 350,
  'N10': 550,
  'Zone 3A': 538,
  'Zone 4': 600,
  'Zone 5B': 400,
  'Zone 10': 950,
};

interface MobilizerRow {
  mobilized_by: string;
  labour_count: number;
  additional_expected_by_date: Record<string, number>;
}

interface ReportData {
  total_labour: number;
  by_package: { package_id: string; package_name: string; labour_count: number }[];
  by_type_of_work: { type_of_work: string; labour_count: number }[];
  by_mobilized_by: MobilizerRow[];
  mobilized_by_dates: string[];
}

function formatDate(iso: string) {
  // iso is "YYYY-MM-DD"
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function SimpleSummaryTable({
  title,
  columnLabel,
  rows,
  total,
  totalRequired,
}: {
  title: string;
  columnLabel: string;
  rows: { label: string; labour_count: number }[];
  total: number;
  totalRequired?: Record<string, number>;
}) {
  const showRequired = !!totalRequired;
  const colSpan = showRequired ? 3 : 2;
  const reqGrandTotal = showRequired
    ? rows.reduce((sum, r) => sum + (totalRequired![r.label] ?? 0), 0)
    : 0;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-500">{rows.length} groups</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">{columnLabel}</th>
            {showRequired && (
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-36">Total Required</th>
            )}
            <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide w-36">Labour Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-400 text-sm">No data yet.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-800">{r.label}</td>
                {showRequired && (
                  <td className="px-4 py-2 text-right font-mono text-gray-500">
                    {totalRequired![r.label] ?? '—'}
                  </td>
                )}
                <td className="px-4 py-2 text-right font-mono text-gray-900">{r.labour_count}</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Total</td>
              {showRequired && (
                <td className="px-4 py-2 text-right font-mono font-semibold text-gray-500">{reqGrandTotal}</td>
              )}
              <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">{total}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function MobilizerTable({ rows, dates }: { rows: MobilizerRow[]; dates: string[] }) {
  const availableTotal = rows.reduce((sum, r) => sum + r.labour_count, 0);
  const perDateTotals: Record<string, number> = Object.fromEntries(dates.map((d) => [d, 0]));
  for (const r of rows) {
    for (const d of dates) {
      perDateTotals[d] += r.additional_expected_by_date[d] || 0;
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">By Mobilized By</h2>
        <span className="text-xs text-gray-500">
          {rows.length} mobilizer{rows.length === 1 ? '' : 's'} · {dates.length} date{dates.length === 1 ? '' : 's'}
        </span>
      </div>
      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-3 py-2 font-medium text-gray-500 uppercase tracking-wide w-48">
              Mobilized By
            </th>
            <th className="text-right px-3 py-2 font-medium text-gray-500 uppercase tracking-wide w-32">
              Available Count
            </th>
            {dates.map((d) => (
              <th key={d} className="text-right px-2 py-2 font-medium text-gray-500 uppercase tracking-wide">
                {formatDate(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2 + dates.length} className="px-4 py-6 text-center text-gray-400">
                No data yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.mobilized_by} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-800 truncate" title={r.mobilized_by}>
                  {r.mobilized_by}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-900">{r.labour_count}</td>
                {dates.map((d) => (
                  <td key={d} className="px-2 py-2 text-right font-mono text-gray-700">
                    {r.additional_expected_by_date[d] ?? ''}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2 font-semibold text-gray-600 uppercase tracking-wide">Total</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{availableTotal}</td>
              {dates.map((d) => (
                <td key={d} className="px-2 py-2 text-right font-mono font-semibold text-gray-900">
                  {perDateTotals[d] || ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function LabourMobilizationReportPage() {
  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ['reports', 'labour-mobilization'],
    queryFn: () => reportsApi.labourMobilization(),
  });

  const apiByPackage = Object.fromEntries(
    (data?.by_package || []).map((r) => [r.package_name, r.labour_count])
  );
  const byPackage = Object.keys(TOTAL_REQUIRED).map((pkg) => ({
    label: pkg,
    labour_count: apiByPackage[pkg] ?? 0,
  }));
  const byType = (data?.by_type_of_work || []).map((r) => ({
    label: r.type_of_work,
    labour_count: r.labour_count,
  }));
  const mobilizerRows  = data?.by_mobilized_by || [];
  const mobilizerDates = data?.mobilized_by_dates || [];
  const totalLabour    = data?.total_labour ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Labour Mobilization Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">Active contractor assignments only</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-100">
          <Users className="w-4 h-4 text-blue-600" />
          <span className="text-xs text-blue-700 font-medium">Total Labour</span>
          <span className="text-lg font-bold text-blue-900 font-mono">{totalLabour}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-gray-400">Loading…</div>
      ) : error ? (
        <div className="card p-8 text-center text-red-500 text-sm">Failed to load report.</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SimpleSummaryTable title="By Package" columnLabel="Package" rows={byPackage} total={totalLabour} totalRequired={TOTAL_REQUIRED} />
            <SimpleSummaryTable title="By Type of Work" columnLabel="Type of Work" rows={byType} total={totalLabour} />
          </div>
          <MobilizerTable rows={mobilizerRows} dates={mobilizerDates} />
        </div>
      )}
    </div>
  );
}
