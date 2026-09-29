import React, { useState, useEffect } from 'react';
import { getMyImpact } from '../services/impactService';

export default function MyImpact() {
  const [commuters, setCommuters] = useState(10000);
  const [percent, setPercent] = useState(30);
  const [avgDistance, setAvgDistance] = useState(15);
  const [avgMileage, setAvgMileage] = useState(15);
  const [fuelPrice, setFuelPrice] = useState(100);

  const [impactData, setImpactData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadImpact = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMyImpact();
        setImpactData(data);
      } catch (err) {
        console.error('Failed to load impact data', err);
        setError('Failed to load impact data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    loadImpact();
  }, []);

  if (loading) {
    return (
      <main className="flex-1 pt-24 px-4 md:px-md pb-xl max-w-[1400px] w-full mx-auto">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 pt-24 px-4 md:px-md pb-xl max-w-[1400px] w-full mx-auto">
        <div className="bg-error/10 text-error p-4 rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
        </div>
      </main>
    );
  }

  const completedTrips = impactData?.completedTrips || 0;
  const ecoScoreDisplay = impactData?.ecoScore ?? 0;
  const co2SavedDisplay = (impactData?.co2SavedKg || 0).toFixed(1);
  const moneySavedDisplay = `₹${Math.round(impactData?.moneySaved || 0).toLocaleString()}`;
  const soloTripsAvoided = impactData?.soloTripsAvoided || 0;

  const driverCompletedPools = impactData?.driverCompletedPools || 0;
  const driverSharedDistanceKm = (impactData?.driverSharedDistanceKm || 0).toFixed(1);
  const passengersServed = impactData?.passengersServed || 0;
  const carpoolEarningsDisplay = `₹${Math.round(impactData?.carpoolEarnings || 0).toLocaleString()}`;

  const dayEmissions = impactData?.weeklyData || [];
  const maxWeeklyCO2 = Math.max(...dayEmissions.map(d => d.co2Saved || 0), 0.5);

  // Simulator Math
  const dailyAvoidedTrips = commuters * (percent / 100);
  const monthlyAvoidedTrips = dailyAvoidedTrips * 30;
  const fuelPerTrip = avgDistance / avgMileage;
  const co2PerTrip = fuelPerTrip * 2.3;
  const monthlyCO2Reduction = monthlyAvoidedTrips * co2PerTrip;
  const monthlyEconomicSaving = monthlyAvoidedTrips * (fuelPerTrip * fuelPrice);
  
  const co2ReductionTons = (monthlyCO2Reduction / 1000).toFixed(1);
  const savingsDisplay = monthlyEconomicSaving >= 100000 
    ? `₹${(monthlyEconomicSaving / 100000).toFixed(1)} lakh/mo`
    : `₹${Math.round(monthlyEconomicSaving).toLocaleString()}/mo`;

  const achievements = [
    { title: 'First Carpool', condition: completedTrips >= 1, icon: 'directions_car' },
    { title: '₹500 Saved', condition: (impactData?.realizedSavings || 0) >= 500, icon: 'payments' },
    { title: '5kg CO2 Saved', condition: (impactData?.co2SavedKg || 0) >= 5, icon: 'co2' },
    { title: '10 Completed Trips', condition: completedTrips >= 10, icon: 'done_all' },
    { title: '100km Shared', condition: (impactData?.sharedDistanceKm || 0) >= 100, icon: 'route' },
  ];

  return (
    <main className="flex-1 pt-24 px-4 md:px-md pb-xl max-w-[1400px] w-full mx-auto">
      <div className="mb-lg">
        <h2 className="text-headline-lg font-headline-lg text-on-surface">Your Impact</h2>
        <p className="text-body-md font-body-md text-on-surface-variant mt-1">
          {completedTrips > 0 
            ? `Dynamic personal sustainability metrics calculated from ${completedTrips} completed trip${completedTrips === 1 ? '' : 's'}.`
            : "Track and simulate your contribution to a sustainable future."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-1 lg:col-span-8 space-y-6">
          
          {/* Top Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-[20px] p-sm border border-tertiary-fixed card-shadow flex flex-col justify-center items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5"></div>
              <span className="text-display-metrics font-display-metrics text-primary relative z-10">{ecoScoreDisplay}</span>
              <span className="text-label-sm font-label-sm text-on-surface-variant relative z-10">Eco Score</span>
            </div>

            <div className="bg-white rounded-[20px] p-sm border border-tertiary-fixed card-shadow flex flex-col justify-between">
              <span className="material-symbols-outlined text-primary mb-2">co2</span>
              <div>
                <div className="text-headline-md font-headline-md text-on-surface">{co2SavedDisplay}<span className="text-label-sm text-on-surface-variant">kg</span></div>
                <div className="text-label-xs font-label-xs text-on-surface-variant">CO2 Saved</div>
              </div>
            </div>

            <div className="bg-white rounded-[20px] p-sm border border-tertiary-fixed card-shadow flex flex-col justify-between">
              <span className="material-symbols-outlined text-primary mb-2">payments</span>
              <div>
                <div className="text-headline-md font-headline-md text-on-surface">{moneySavedDisplay}</div>
                <div className="text-label-xs font-label-xs text-on-surface-variant">Money Saved</div>
              </div>
            </div>

            <div className="bg-white rounded-[20px] p-sm border border-tertiary-fixed card-shadow flex flex-col justify-between">
              <span className="material-symbols-outlined text-primary mb-2">directions_walk</span>
              <div>
                <div className="text-headline-md font-headline-md text-on-surface">{soloTripsAvoided}</div>
                <div className="text-label-xs font-label-xs text-on-surface-variant">Solo Trips Avoided</div>
              </div>
            </div>
          </div>

          {/* Passenger Impact Section */}
          <div className="bg-white rounded-[20px] p-md border border-tertiary-fixed card-shadow space-y-4">
            <h3 className="text-label-sm font-label-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">person</span>
              Passenger Impact
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">done_all</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{completedTrips}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Completed Trips</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">route</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{(impactData?.sharedDistanceKm || 0).toFixed(1)}<span className="text-label-sm text-on-surface-variant">km</span></div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Shared Distance</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">savings</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">₹{Math.round(impactData?.averageSavingPerTrip || 0).toLocaleString()}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Avg Saving/Trip</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-error mb-1 text-xl">local_gas_station</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">₹{Math.round(impactData?.totalSoloCost || 0).toLocaleString()}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Total Solo Cost</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">directions_car</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">₹{Math.round(impactData?.totalCarpoolCost || 0).toLocaleString()}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Total Carpool Cost</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">account_balance_wallet</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">₹{Math.round(impactData?.realizedSavings || 0).toLocaleString()}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Realized Savings</div>
                </div>
              </div>
            </div>
          </div>

          {/* Driver Impact Section */}
          <div className="bg-white rounded-[20px] p-md border border-tertiary-fixed card-shadow space-y-4">
            <h3 className="text-label-sm font-label-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">time_to_leave</span>
              Driver Impact
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">star</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{ecoScoreDisplay}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Eco Score</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">task_alt</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{driverCompletedPools}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Completed Pools</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">distance</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{driverSharedDistanceKm}<span className="text-label-sm text-on-surface-variant">km</span></div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Shared Distance</div>
                </div>
              </div>

              <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/30 flex flex-col justify-between">
                <span className="material-symbols-outlined text-primary mb-1 text-xl">group</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-on-surface">{passengersServed}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Passengers Served</div>
                </div>
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 border border-primary/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">monetization_on</span>
                <div>
                  <div className="text-headline-sm font-headline-sm text-primary">{carpoolEarningsDisplay}</div>
                  <div className="text-label-xs font-label-xs text-on-surface-variant">Carpool Earnings</div>
                </div>
              </div>
              <span className="text-label-xs text-on-surface-variant">Earned from hosting carpools</span>
            </div>
          </div>

          {/* Weekly CO2 Chart */}
          <div className="bg-white rounded-[20px] p-md border border-tertiary-fixed card-shadow h-72 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-label-sm font-label-sm text-on-surface">Weekly CO2 Savings</h3>
                <span className="text-label-xs text-on-surface-variant">Current Week (Mon – Sun)</span>
              </div>
            </div>

            <div className="flex-1 bg-surface-container-low rounded-lg border border-outline-variant flex items-end p-4 gap-3 md:gap-4 relative">
              {dayEmissions.map((d) => {
                const barHeightPct = maxWeeklyCO2 > 0 && d.co2Saved > 0
                  ? Math.max(6, Math.round((d.co2Saved / maxWeeklyCO2) * 100))
                  : 4;

                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer">
                    <div className="absolute -top-9 bg-surface text-on-surface text-label-xs px-2 py-1 rounded border border-outline shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none whitespace-nowrap">
                      {(d.co2Saved || 0).toFixed(2)} kg CO₂ {d.isToday ? '(Today)' : ''}
                    </div>

                    <div
                      className={`w-full max-w-[40px] rounded-t-md transition-all duration-500 ${
                        !d.co2Saved || d.co2Saved === 0
                          ? 'bg-outline-variant/40'
                          : d.isToday
                          ? 'bg-primary shadow-sm'
                          : 'bg-primary/60'
                      }`}
                      style={{ height: `${barHeightPct}%` }}
                    ></div>

                    <span className={`text-label-xs mt-2 font-medium ${d.isToday ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Achievements */}
          <div className="bg-white rounded-[20px] p-md border border-tertiary-fixed card-shadow">
            <h3 className="text-label-sm font-label-sm text-on-surface mb-4">Achievements</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {achievements.map((ach, i) => (
                <div key={i} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${ach.condition ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-surface-container text-on-surface-variant opacity-50'}`}>
                  <span className="material-symbols-outlined mb-2 text-3xl">{ach.icon}</span>
                  <span className="text-[10px] font-bold text-center uppercase tracking-wide">{ach.title}</span>
                  <span className="text-[10px] mt-1">{ach.condition ? 'Unlocked' : 'Locked'}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column Simulator */}
        <div className="col-span-1 lg:col-span-4 space-y-6">
          <div className="bg-white rounded-[20px] p-md border border-tertiary-fixed card-shadow">
            <h3 className="text-label-sm font-label-sm text-on-surface mb-1">Estimated Community Impact</h3>
            <p className="text-label-xs text-on-surface-variant mb-4">Simulator values do not affect your real impact.</p>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-label-xs font-label-xs text-on-surface-variant">Daily Commuters</label>
                  <span className="text-label-sm font-label-sm text-on-surface">{commuters.toLocaleString()}</span>
                </div>
                <input 
                  className="w-full h-1 bg-tertiary-fixed rounded-lg appearance-none cursor-pointer accent-primary" 
                  max="50000" 
                  min="1000" 
                  step="500"
                  type="range" 
                  value={commuters}
                  onChange={(e) => setCommuters(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-label-xs font-label-xs text-on-surface-variant">% Carpool Adoption</label>
                  <span className="text-label-sm font-label-sm text-on-surface">{percent}%</span>
                </div>
                <input 
                  className="w-full h-1 bg-tertiary-fixed rounded-lg appearance-none cursor-pointer accent-primary" 
                  max="100" 
                  min="0" 
                  type="range" 
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-label-xs font-label-xs text-on-surface-variant">Avg Commute (km)</label>
                  <span className="text-label-sm font-label-sm text-on-surface">{avgDistance} km</span>
                </div>
                <input 
                  className="w-full h-1 bg-tertiary-fixed rounded-lg appearance-none cursor-pointer accent-primary" 
                  max="100" 
                  min="1" 
                  type="range" 
                  value={avgDistance}
                  onChange={(e) => setAvgDistance(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-label-xs font-label-xs text-on-surface-variant">Avg Mileage (km/L)</label>
                  <span className="text-label-sm font-label-sm text-on-surface">{avgMileage} km/L</span>
                </div>
                <input 
                  className="w-full h-1 bg-tertiary-fixed rounded-lg appearance-none cursor-pointer accent-primary" 
                  max="50" 
                  min="5" 
                  type="range" 
                  value={avgMileage}
                  onChange={(e) => setAvgMileage(Number(e.target.value))}
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-label-xs font-label-xs text-on-surface-variant">Fuel Price (₹/L)</label>
                  <span className="text-label-sm font-label-sm text-on-surface">₹{fuelPrice}</span>
                </div>
                <input 
                  className="w-full h-1 bg-tertiary-fixed rounded-lg appearance-none cursor-pointer accent-primary" 
                  max="150" 
                  min="50" 
                  type="range" 
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-outline-variant space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-label-xs text-on-surface-variant">Monthly CO₂ Reduction</span>
                <span className="text-label-sm font-bold text-on-surface">{co2ReductionTons} Tons</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-label-xs text-on-surface-variant">Monthly Econ. Savings</span>
                <span className="text-label-sm font-bold text-primary">{savingsDisplay}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
