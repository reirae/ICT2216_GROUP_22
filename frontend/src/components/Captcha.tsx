import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  refreshKey?: number;
}

export function Captcha({ value, onChange, refreshKey }: Props) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchOne = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ question: string }>('/auth/captcha');
      setQuestion(data.question);
      onChange('');
    } catch {
      setQuestion('Unavailable. Click refresh.');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => { fetchOne(); }, [fetchOne, refreshKey]);

  return (
    <div>
      <label className="block text-sm sm:text-base text-gray-700 mb-2">Security Check</label>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800">
          {loading ? 'Loading…' : question}
        </div>
        <button
          type="button"
          onClick={fetchOne}
          className="p-2 text-gray-600 hover:text-gray-900"
          aria-label="Refresh captcha"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Enter the answer"
        maxLength={6}
        inputMode="numeric"
      />
    </div>
  );
}
