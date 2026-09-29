import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

export default function AdminEmissionFactors() {
  const [factors, setFactors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editFactor, setEditFactor] = useState('');
  const [editSource, setEditSource] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/emission-factors`);
      if (res.ok) {
        const data = await res.json();
        setFactors(data);
      }
    } catch (err) {
      console.warn('[AdminEmissionFactors] Failed to fetch factors:', err);
    }
  };

  const handleStartEdit = (f) => {
    setEditingId(f.id);
    setEditFactor(f.factor);
    setEditSource(f.source);
  };

  const handleSave = async (id) => {
    const numFactor = Number(editFactor);
    if (isNaN(numFactor) || numFactor <= 0) {
      setMsg({ type: 'error', text: 'Factor must be a positive numeric value.' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/emission-factors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'ADMIN' },
        body: JSON.stringify({ factor: numFactor, source: editSource })
      });

      if (res.ok) {
        setMsg({ type: 'success', text: `Updated emission factor for ${id} to ${numFactor}` });
        setEditingId(null);
        fetchFactors();
      }
    } catch (err) {
      console.error('[AdminEmissionFactors] Save failed:', err);
      setMsg({ type: 'error', text: 'Failed to update emission factor.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Emission Factors</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Authoritative greenhouse gas emission benchmarks feeding GreenMove CO₂ calculations.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          Source of Truth
        </span>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-label-xs flex justify-between items-center border ${
          msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-error-container/20 text-error border-error/30'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="font-bold text-xs">✕</button>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">factory</span>
            <span>Active Transport Emission Benchmarks</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Category / Transport Mode</th>
                <th className="py-3.5 px-4">Emission Factor</th>
                <th className="py-3.5 px-4">Unit</th>
                <th className="py-3.5 px-4">Source / Authority</th>
                <th className="py-3.5 px-4">Last Updated</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {factors.map((f) => (
                <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4 font-semibold text-on-surface">{f.category}</td>
                  <td className="py-4 px-4 font-bold text-primary">
                    {editingId === f.id ? (
                      <input
                        type="number"
                        step="0.001"
                        value={editFactor}
                        onChange={(e) => setEditFactor(e.target.value)}
                        className="w-24 bg-surface-container-low border border-primary rounded px-2 py-1 text-label-sm font-bold text-on-surface"
                      />
                    ) : (
                      f.factor.toFixed(3)
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">
                    <span className="bg-surface-container-high px-2 py-1 rounded">{f.unit}</span>
                  </td>
                  <td className="py-4 px-4 text-label-xs">
                    {editingId === f.id ? (
                      <input
                        type="text"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        className="w-full max-w-xs bg-surface-container-low border border-primary rounded px-2 py-1 text-label-xs text-on-surface"
                      />
                    ) : (
                      <span className="text-on-surface-variant">{f.source}</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">
                    {f.updatedAt} by <strong className="text-on-surface">{f.updatedBy}</strong>
                  </td>
                  <td className="py-4 px-4 text-right">
                    {editingId === f.id ? (
                      <div className="space-x-2">
                        <button
                          onClick={() => handleSave(f.id)}
                          className="px-3 py-1 bg-primary text-on-primary text-label-xs font-semibold rounded-lg cursor-pointer hover:bg-primary/90"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-surface-variant text-on-surface text-label-xs rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(f)}
                        className="px-3 py-1 bg-surface-variant hover:bg-surface-container text-primary text-label-xs font-semibold rounded-lg border border-outline-variant cursor-pointer transition-colors"
                      >
                        Edit Factor
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
