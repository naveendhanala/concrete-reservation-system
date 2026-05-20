import { useEffect, useState } from 'react';

const CHECK_INTERVAL = 30;

export default function MaintenancePage() {
  const [countdown, setCountdown] = useState(CHECK_INTERVAL);
  const [checking, setChecking] = useState(false);

  async function checkIfBack() {
    setChecking(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        window.location.href = '/';
      }
    } catch {
      // still down
    } finally {
      setChecking(false);
      setCountdown(CHECK_INTERVAL);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          checkIfBack();
          return CHECK_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-6">🔧</div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          System Maintenance
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          We're performing a database upgrade to improve performance.
          <br />
          We'll be back in just a few minutes.
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700 mb-8">
          Please do not refresh or submit any forms during this time.
        </div>

        <button
          onClick={checkIfBack}
          disabled={checking}
          className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {checking ? 'Checking...' : 'Check now'}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Auto-checking in {countdown}s
        </p>
      </div>
    </div>
  );
}
