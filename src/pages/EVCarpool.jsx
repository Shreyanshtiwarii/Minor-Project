import React, { useState } from 'react';

export default function EVCarpool() {
  const [chargingStops, setChargingStops] = useState([]);
  
  const stations = [
    { id: 'A', name: 'Station A', distance: '4.2 km', power: '120kW Fast', cost: '₹180 est.' },
    { id: 'B', name: 'Station B (Level 2)', distance: '5.8 km', power: '22kW', cost: '₹45 est.' }
  ];

  const carpools = [
    {
      name: 'Anita S.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBG0PWVUKGUqB7fsqwdsW4oYHcBfDu1LnKM5A03Jajgr6RiOgJDm9gYqInZxq83k6XMgPnogazNtmrAzEfLkMa64k_tNiWOIPITWoT-4F21e0_YyFXw73uBZQFTMwBvx51RzXw4H0Af2uV7Jlyr9hvMq7Kf5erSxoqIEZg_Cob-Fu8JlK6MALePEkJIs15NQnXDXpEPl0rUWqUWU9lOt4FsBnkzUn32dd8Pz8MhYbX94hQcr1uQ0C2P',
      time: 'Departs in 15m',
      match: '92%',
      pickup: '0.8km Pickup',
      savings: '-2.4kg CO2'
    },
    {
      name: 'Rohan M.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCY8sM_Ltm8NwyGF_iCX1vKrMSULfqCwDUgE_xSBcOsejaccm_BMdZ2iVvZHG82LdEw5xRm-fp_iv1_Ub26CTrJMuIsqjtTV1PyQpHDxznVas9KMlpZkarGG0-NXKq_EfvfdAWGX0qATaXOsV6KGsNLATlzMTIrPSvbmfAYIGTFcSMxyuHEALEiDqJ4kVbPQ7SW9b9Zu0ScLjjQkzEh1y5HgafEZoY-l4zhDetyH26azhOFm1yuApc8',
      time: 'Departs in 45m',
      match: '87%',
      pickup: '1.1km Pickup',
      savings: '-1.8kg CO2'
    }
  ];

  const handleAddStop = (station) => {
    if (chargingStops.includes(station.id)) {
      setChargingStops(chargingStops.filter(id => id !== station.id));
    } else {
      setChargingStops([...chargingStops, station.id]);
    }
  };

  return (
    <main className="flex-1 w-full pt-[24px] px-md md:px-lg pb-xl max-w-7xl mx-auto">
      <header className="mb-lg flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg font-headline-lg text-on-surface mb-2">EV Intelligence</h2>
          <p className="text-body-md font-body-md text-on-surface-variant">Real-time route feasibility and charging recommendations.</p>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg">
        {/* LEFT COLUMN: Battery & Charging */}
        <div className="lg:col-span-8 space-y-lg">
          {/* Battery Widget */}
          <section className="bg-surface-container-lowest rounded-[20px] p-md border border-outline-variant card-shadow relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined text-primary">battery_2_bar</span>
                <h3 className="text-headline-md font-headline-md">Battery Status</h3>
              </div>
              <div className="bg-error-container text-on-error-container px-3 py-1 rounded-full flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">warning</span>
                <span className="text-label-xs font-label-xs">Low safety margin</span>
              </div>
            </div>
            <div className="flex items-end gap-6 mb-8">
              <div className="text-display-metrics font-display-metrics text-primary tracking-tighter">
                23<span className="text-headline-md text-on-surface-variant">%</span>
              </div>
              <div className="flex-1 flex gap-6 pb-2 border-b border-outline-variant/30">
                <div>
                  <p className="text-label-xs font-label-xs text-on-surface-variant uppercase tracking-wider">Current Range</p>
                  <p className="text-headline-md font-headline-md text-on-surface">78 km</p>
                </div>
                <div>
                  <p className="text-label-xs font-label-xs text-on-surface-variant uppercase tracking-wider">Required for Route</p>
                  <p className="text-headline-md font-headline-md text-on-surface">61 km</p>
                </div>
              </div>
            </div>

            {/* Large Horizontal Indicator */}
            <div className="relative w-full h-8 bg-tertiary-fixed rounded-full overflow-hidden border border-outline-variant/50">
              {/* Required Threshold Marker */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-error z-10" style={{ left: `${(61 / 78) * 100}%` }}></div>
              {/* Actual Fill */}
              <div className="h-full progress-fill transition-all duration-1000 ease-in-out rounded-r-full" style={{ width: '23%' }}></div>
            </div>
            <div className="flex justify-between mt-2 text-label-xs font-label-xs text-on-surface-variant">
              <span>0%</span>
              <span className="flex items-center gap-1 text-error" style={{ marginRight: `calc(100% - ${(61 / 78) * 100}% - 40px)` }}>
                <span className="material-symbols-outlined text-[14px]">flag</span> Route Dest.
              </span>
              <span>100%</span>
            </div>
          </section>

          {/* Charging Stations Map + List */}
          <section className="bg-surface-container-lowest rounded-[20px] border border-outline-variant card-shadow overflow-hidden flex flex-col md:flex-row h-[400px]">
            {/* Map Area */}
            <div 
              className="w-full md:w-3/5 h-48 md:h-full relative bg-surface-container-high border-b md:border-b-0 md:border-r border-outline-variant bg-cover bg-center" 
              style={{ 
                backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDS7w1haaZuh5XpsljOukhDH61QLkCEd3jqSi6vpzyOk1LZbo8VEnRUq_BFE1hRdSiwqB1M9z2Rk1k-VCQwbpoD4-n9jQXNFGTE9F2gmOV8us5EbUEo57cEBjHINCYlGgp5JTGGQMhjlJ5J5kYz-fXdOGBtuUnvOUlwp6-08taL8CdRtxcvpB1sXIbFHICdjFMQX-JV1WwfMk5upxwftjQTy8hms5plM-hMhzIOC14w8mP3CxWdTeqy')" 
              }}
            >
              {/* Simulated Charging Pins on Map */}
              <div className="absolute top-[40%] left-[30%] bg-primary-container text-on-primary rounded-full p-1.5 shadow-md border border-white cursor-pointer z-10 scale-95">
                <span className="material-symbols-outlined text-sm">ev_station</span>
              </div>
              <div className="absolute top-[60%] left-[70%] bg-secondary text-on-secondary rounded-full p-1.5 shadow-md border border-white cursor-pointer z-10 scale-95">
                <span className="material-symbols-outlined text-sm">ev_station</span>
              </div>
              {/* Map Controls Overlay */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                <button className="w-10 h-10 bg-surface-container-lowest rounded-lg shadow-sm flex items-center justify-center text-on-surface border border-outline-variant hover:bg-surface-variant transition cursor-pointer">
                  <span className="material-symbols-outlined">add</span>
                </button>
                <button className="w-10 h-10 bg-surface-container-lowest rounded-lg shadow-sm flex items-center justify-center text-on-surface border border-outline-variant hover:bg-surface-variant transition cursor-pointer">
                  <span className="material-symbols-outlined">remove</span>
                </button>
              </div>
            </div>
            {/* List Area */}
            <div className="w-full md:w-2/5 flex flex-col h-full bg-surface-container-lowest">
              <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface/50">
                <h3 className="text-label-sm font-label-sm text-on-surface">Optimal Charging Stops</h3>
                <span className="material-symbols-outlined text-on-surface-variant text-[20px] cursor-pointer">filter_list</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {stations.map((station) => (
                  <div key={station.id} className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    chargingStops.includes(station.id)
                      ? 'border-primary bg-surface-container-low'
                      : 'border-outline-variant bg-surface-container-low/50 hover:border-primary'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                          <span className="material-symbols-outlined text-[18px]">ev_station</span>
                        </div>
                        <h4 className="text-label-sm font-label-sm text-on-surface">{station.name}</h4>
                      </div>
                      <span className="text-label-xs font-label-xs bg-surface-variant px-2 py-1 rounded text-on-surface-variant">{station.distance}</span>
                    </div>
                    <div className="flex gap-4 text-label-xs font-label-xs text-on-surface-variant mb-4">
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">bolt</span> {station.power}</span>
                      <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">payments</span> {station.cost}</span>
                    </div>
                    <button 
                      onClick={() => handleAddStop(station)}
                      className={`w-full py-2 rounded-lg text-label-sm font-label-sm transition-colors cursor-pointer border ${
                        chargingStops.includes(station.id)
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface text-primary border-primary hover:bg-primary hover:text-on-primary'
                      }`}
                    >
                      {chargingStops.includes(station.id) ? 'Added Stop' : 'Add Stop'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Carpool */}
        <div className="lg:col-span-4 flex flex-col gap-lg">
          <section className="bg-surface-container-lowest rounded-[20px] p-md border border-outline-variant card-shadow flex-1">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-outline-variant">
              <div className="w-10 h-10 rounded-full bg-[#F3F8E8] text-[#005B00] flex items-center justify-center">
                <span className="material-symbols-outlined">group</span>
              </div>
              <div>
                <h3 className="text-headline-md font-headline-md text-on-surface">Carpool</h3>
                <p className="text-label-xs font-label-xs text-on-surface-variant">Reduce emissions together</p>
              </div>
            </div>
            {/* Matches List */}
            <div className="space-y-4">
              <h4 className="text-label-xs font-label-xs text-on-surface-variant uppercase tracking-wider mb-2">Top Matches along route</h4>
              {carpools.map((item, index) => (
                <div key={index} className="p-3 rounded-xl border border-outline-variant bg-surface-container-low flex flex-col gap-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary-fixed-dim/20 rounded-bl-full -mr-4 -mt-4 z-0"></div>
                  <div className="flex justify-between items-start z-10">
                    <div className="flex items-center gap-3">
                      <img 
                        className="w-10 h-10 rounded-full object-cover border-2 border-white" 
                        alt={item.name} 
                        src={item.avatar}
                      />
                      <div>
                        <p className="text-label-sm font-label-sm text-on-surface">{item.name}</p>
                        <p className="text-label-xs font-label-xs text-on-surface-variant">{item.time}</p>
                      </div>
                    </div>
                    <div className="bg-secondary-container text-on-secondary-container px-2 py-1 rounded text-label-xs font-label-xs font-bold">
                      {item.match} Match
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-label-xs font-label-xs text-on-surface-variant z-10 bg-surface/50 p-2 rounded-lg">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">directions_walk</span> {item.pickup}
                    </div>
                    <div className="flex items-center gap-1 text-primary">
                      <span className="material-symbols-outlined text-[14px]">eco</span> {item.savings}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-6 py-3 bg-primary text-on-primary rounded-lg text-label-sm font-label-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer">
              View All Matches <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
