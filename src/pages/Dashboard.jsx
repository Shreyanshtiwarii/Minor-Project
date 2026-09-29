import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyImpact } from '../services/impactService';
import { getPools } from '../services/vehiclePoolService';

export default function Dashboard() {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departure, setDeparture] = useState('Leave now');
  const [passengers, setPassengers] = useState('1');
  const [priority, setPriority] = useState('Eco');

  const [impactData, setImpactData] = useState(null);
  const [topMatch, setTopMatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [impactRes, poolsRes] = await Promise.allSettled([
          getMyImpact(),
          getPools()
        ]);

        if (isMounted) {
          if (impactRes.status === 'fulfilled' && impactRes.value) {
            setImpactData(impactRes.value);
          }

          if (poolsRes.status === 'fulfilled' && Array.isArray(poolsRes.value)) {
            const activePools = poolsRes.value.filter(
              (p) => !p.past && p.status !== 'TERMINATED' && p.status !== 'COMPLETED'
            );
            if (activePools.length > 0) {
              activePools.sort((a, b) => {
                const scoreA = a.matchScore != null ? a.matchScore : 0;
                const scoreB = b.matchScore != null ? b.matchScore : 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                return new Date(a.departureTime) - new Date(b.departureTime);
              });
              setTopMatch(activePools[0]);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate(
      `/plan-route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&passengers=${passengers}&priority=${priority}`
    );
  };

  const formatDepartureTime = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="flex-1 p-md md:p-lg lg:p-xl max-w-7xl mx-auto w-full space-y-6">
      {/* 1. Existing Plan Journey Card */}
      <div className="bg-surface-container-lowest rounded-[20px] border border-tertiary-fixed shadow-[0px_4px_20px_rgba(16,32,21,0.04)] p-md md:p-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-fixed-dim/20 to-transparent rounded-bl-full pointer-events-none"></div>
        <h3 className="text-headline-md font-headline-md text-on-surface mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">route</span>
          Plan Journey
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm mb-6 relative">
            <div className="space-y-sm">
              <div>
                <label className="block text-label-xs font-label-xs text-on-surface-variant mb-1">From</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">my_location</span>
                  <input
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg py-2 pl-10 pr-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Current Location"
                    type="text"
                  />
                </div>
              </div>
              <div className="relative flex justify-center -my-2 z-10 md:hidden">
                <button
                  type="button"
                  onClick={() => {
                    const temp = from;
                    setFrom(to);
                    setTo(temp);
                  }}
                  className="bg-surface-container border border-tertiary-fixed rounded-full p-1 text-on-surface-variant hover:text-primary transition-colors shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">swap_vert</span>
                </button>
              </div>
              <div>
                <label className="block text-label-xs font-label-xs text-on-surface-variant mb-1">To</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">location_on</span>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg py-2 pl-10 pr-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Where to?"
                    type="text"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-sm">
              <div>
                <label className="block text-label-xs font-label-xs text-on-surface-variant mb-1">Departure</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">schedule</span>
                  <select
                    value={departure}
                    onChange={(e) => setDeparture(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg py-2 pl-10 pr-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                  >
                    <option>Leave now</option>
                    <option>Set time...</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-label-xs font-label-xs text-on-surface-variant mb-1">Passengers</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">person</span>
                    <select
                      value={passengers}
                      onChange={(e) => setPassengers(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg py-2 pl-10 pr-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3+</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-label-xs font-label-xs text-on-surface-variant mb-1">Priority</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">tune</span>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg py-2 pl-10 pr-3 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                    >
                      <option>Eco</option>
                      <option>Balanced</option>
                      <option>Budget</option>
                      <option>Fast</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-primary-container text-on-primary font-label-sm px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-primary transition-colors shadow-sm cursor-pointer"
            >
              Find Sustainable Route
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3 Compact Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 2. Best Carpool Match */}
        <div className="bg-surface-container-lowest rounded-[20px] border border-tertiary-fixed shadow-[0px_4px_20px_rgba(16,32,21,0.04)] p-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-base">directions_car</span>
                Best Carpool Match
              </h4>
              {topMatch && (
                <span className="bg-primary-container/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full border border-primary/20">
                  {topMatch.matchScore != null ? `${Math.round(topMatch.matchScore)}% Match` : 'Top Match'}
                </span>
              )}
            </div>

            {loading ? (
              <div className="py-6 text-center text-body-md text-on-surface-variant animate-pulse">
                Checking available matches...
              </div>
            ) : topMatch ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-on-surface text-base">{topMatch.creatorName || 'Available Pool'}</span>
                  <span className="text-headline-sm font-headline-sm text-primary">
                    ₹{Math.round(topMatch.passengerFare || topMatch.costPerPassenger || 0)}
                  </span>
                </div>
                <div className="text-body-sm text-on-surface-variant space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-outline">navigation</span>
                    <span>
                      Pickup dist:{' '}
                      {topMatch.pickupDistanceMeters != null
                        ? `${(topMatch.pickupDistanceMeters / 1000).toFixed(1)} km`
                        : topMatch.startLocation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-outline">location_on</span>
                    <span>
                      Dropoff dist:{' '}
                      {topMatch.dropoffDistanceMeters != null
                        ? `${(topMatch.dropoffDistanceMeters / 1000).toFixed(1)} km`
                        : topMatch.destination}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs text-outline">schedule</span>
                    <span>Departure: {formatDepartureTime(topMatch.departureTime)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-body-md text-on-surface-variant">
                No active carpool match available right now.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-tertiary-fixed flex justify-end">
            <button
              onClick={() => navigate('/vehicle-pool')}
              className="text-label-sm font-label-sm text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              Browse Pools
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>

        {/* 3. Today's Recommendation */}
        <div className="bg-surface-container-lowest rounded-[20px] border border-tertiary-fixed shadow-[0px_4px_20px_rgba(16,32,21,0.04)] p-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-base">recommend</span>
                Today's Recommendation
              </h4>
              <span className="bg-secondary-fixed/30 text-primary-container text-xs font-bold px-2 py-0.5 rounded">
                Recommended
              </span>
            </div>

            <div className="flex items-start gap-3 my-2">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-primary-fixed shrink-0">
                <span className="material-symbols-outlined text-2xl text-primary">directions_bus</span>
              </div>
              <div>
                <h4 className="text-title-md font-headline-sm text-on-surface">Transit & Carpool Combo</h4>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  {topMatch
                    ? `Sharing a ride to ${topMatch.destination} saves up to 1.8 kg CO₂ vs driving alone.`
                    : 'Opting for public transit or carpooling today reduces emissions and commute costs.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-tertiary-fixed">
            <span className="text-label-xs text-secondary bg-surface px-2.5 py-1 rounded border border-tertiary-fixed-dim block text-center">
              Save energy and cost on your daily commute.
            </span>
          </div>
        </div>

        {/* 4. Small Weekly Snapshot */}
        <div className="bg-surface-container-lowest rounded-[20px] border border-tertiary-fixed shadow-[0px_4px_20px_rgba(16,32,21,0.04)] p-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-base">insights</span>
                Weekly Snapshot
              </h4>
            </div>

            {loading ? (
              <div className="py-6 text-center text-body-md text-on-surface-variant animate-pulse">
                Loading snapshot...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 my-2">
                <div className="bg-surface-container/50 border border-tertiary-fixed rounded-xl p-3 text-center">
                  <span className="material-symbols-outlined text-primary text-xl mb-1 opacity-80">co2</span>
                  <div className="text-headline-sm font-headline-sm text-on-surface">
                    {impactData ? impactData.co2SavedKg.toFixed(1) : '0.0'} <span className="text-label-xs text-on-surface-variant">kg</span>
                  </div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant uppercase mt-0.5">CO₂ Saved</div>
                </div>

                <div className="bg-surface-container/50 border border-tertiary-fixed rounded-xl p-3 text-center">
                  <span className="material-symbols-outlined text-primary text-xl mb-1 opacity-80">done_all</span>
                  <div className="text-headline-sm font-headline-sm text-on-surface">
                    {impactData ? impactData.completedTrips : 0}
                  </div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant uppercase mt-0.5">Trips Done</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-tertiary-fixed flex justify-end">
            <button
              onClick={() => navigate('/my-impact')}
              className="bg-primary-container text-on-primary font-label-sm px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-primary transition-colors shadow-sm cursor-pointer"
            >
              View Impact
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
