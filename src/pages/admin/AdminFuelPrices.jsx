import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

export default function AdminFuelPrices() {
  const [prices, setPrices] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editSource, setEditSource] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/fuel-prices`);
      if (res.ok) {
        const data = await res.json();
        setPrices(data);
      }
    } catch (err) {
      console.warn('[AdminFuelPrices] Failed to fetch fuel prices:', err);
    }
  };

  const handleStartEdit = (p) => {
    setEditingId(p.id);
    setEditPrice(p.price);
    setEditSource(p.source);
  };

  const handleSave = async (id) => {
    const numPrice = Number(editPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      setMsg({ type: 'error', text: 'Price must be a positive numeric value.' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/fuel-prices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'ADMIN' },
        body: JSON.stringify({ price: numPrice, source: editSource })
      });

      if (res.ok) {
        setMsg({ type: 'success', text: `Updated ${id} price to ₹${numPrice}` });
        setEditingId(null);
        fetchPrices();
      }
    } catch (err) {
      console.error('[AdminFuelPrices] Save failed:', err);
      setMsg({ type: 'error', text: 'Failed to update fuel price.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Fuel & Energy Prices</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Core source-of-truth tariff parameters feeding GreenMove route cost calculations.
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
            <span className="material-symbols-outlined text-primary">local_gas_station</span>
            <span>Active Fuel & Energy Tariffs</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Fuel / Energy Type</th>
                <th className="py-3.5 px-4">Current Price</th>
                <th className="py-3.5 px-4">Unit</th>
                <th className="py-3.5 px-4">Source / Authority</th>
                <th className="py-3.5 px-4">Last Updated</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {prices.map((p) => (
                <tr key={p.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4 font-semibold text-on-surface">{p.fuelType}</td>
                  <td className="py-4 px-4 font-bold text-primary">
                    {editingId === p.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-24 bg-surface-container-low border border-primary rounded px-2 py-1 text-label-sm font-bold text-on-surface"
                      />
                    ) : (
                      `₹${p.price.toFixed(2)}`
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{p.unit}</td>
                  <td className="py-4 px-4 text-label-xs">
                    {editingId === p.id ? (
                      <input
                        type="text"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        className="w-full max-w-xs bg-surface-container-low border border-primary rounded px-2 py-1 text-label-xs text-on-surface"
                      />
                    ) : (
                      <span className="text-on-surface-variant">{p.source}</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">
                    {p.updatedAt} by <strong className="text-on-surface">{p.updatedBy}</strong>
                  </td>
                  <td className="py-4 px-4 text-right">
                    {editingId === p.id ? (
                      <div className="space-x-2">
                        <button
                          onClick={() => handleSave(p.id)}
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
                        onClick={() => handleStartEdit(p)}
                        className="px-3 py-1 bg-surface-variant hover:bg-surface-container text-primary text-label-xs font-semibold rounded-lg border border-outline-variant cursor-pointer transition-colors"
                      >
                        Edit Price
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
