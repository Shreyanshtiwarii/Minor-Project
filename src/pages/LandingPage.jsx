import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  // Setup intersection observer for scroll reveals (.lp-reveal)
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.lp-reveal');
    revealElements.forEach(el => observer.observe(el));

    return () => {
      revealElements.forEach(el => observer.unobserve(el));
    };
  }, []);

  return (
    <div className="font-body-md text-on-surface antialiased bg-[#F7F9F5] min-h-screen selection:bg-primary-container selection:text-on-primary">
      {/* Top Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-md py-4 bg-surface/90 backdrop-blur-md border-b border-outline-variant/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
          <span className="font-headline-md text-headline-md text-primary tracking-tight">GreenMove</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-8">
          <a className="hidden sm:inline-block font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#how-it-works">How it Works</a>
          <button 
            onClick={() => navigate('/signin')}
            className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors cursor-pointer px-2 py-1"
          >
            Sign In
          </button>
          <button 
            onClick={() => navigate('/signup')}
            className="bg-primary-container text-on-primary font-label-sm text-label-sm px-4 sm:px-6 py-2 rounded-lg hover:bg-primary transition-colors shadow-sm cursor-pointer"
          >
            Sign Up
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 md:pt-40 md:pb-32 px-4 md:px-md overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="z-10 relative">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-6 leading-tight">
              Your destination matters. <br/>
              <span className="text-primary-container">How you get there matters more.</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 sm:mb-10 max-w-xl">
              Intelligent routing that balances time, cost, and carbon footprint. Make sustainable choices effortlessly and track your real-world impact.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="bg-primary-container text-on-primary font-label-sm text-label-sm px-6 sm:px-8 py-3 rounded-lg hover:bg-primary transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                Plan a Sustainable Route
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              <a 
                href="#how-it-works"
                className="bg-surface text-primary-container border border-primary-container font-label-sm text-label-sm px-6 sm:px-8 py-3 rounded-lg hover:bg-surface-container transition-colors flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                See How It Works
                <span className="material-symbols-outlined text-sm">play_circle</span>
              </a>
            </div>
          </div>

          {/* Hero Visual & Floating Metrics */}
          <div className="relative h-[380px] sm:h-[450px] md:h-[500px] w-full rounded-[24px] bg-white border border-tertiary-fixed card-shadow overflow-hidden group">
            {/* Abstract Map/Route Background placeholder */}
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-multiply" 
              style={{ 
                backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBmC5aEEVghWAnJ7cW4RAIKpQQ40LAsY-Ju1IAT9bh5t_fbimoh8xrj4zuN-1cDya7sIMiDc0XLveAjA4Mw3r6Y-tfGRmxLeCKgW0vwfeiS7w6DsWzwLUTjq-M_2x92E_cDFZQRH_syonZom49w0sZQhyAAkIZ_jlfkwBk6auK1risebcmI7A41gzXBcJ6vl-XV4gblESzOwA2_EL6l4D4H94Ou1i2YDHAFsEWJkY-SqeictUq6S94E')" 
              }}
            ></div>
            {/* Simulated Route Lines */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path d="M 10 90 Q 30 50 80 10" fill="none" stroke="#707a6b" strokeDasharray="2 2" strokeWidth="0.5"></path>
              <path className="opacity-80" d="M 10 90 Q 50 80 90 40" fill="none" stroke="#8DB600" strokeWidth="2"></path>
              <circle cx="90" cy="40" fill="#005B00" r="2"></circle>
              <circle cx="10" cy="90" fill="#181d16" r="1.5"></circle>
            </svg>
            {/* Floating Metric Cards */}
            <div className="absolute top-4 left-4 sm:top-8 sm:left-8 bg-white/90 backdrop-blur rounded-xl p-3 sm:p-4 border border-outline-variant/30 card-shadow lp-animate-float-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-secondary-container text-sm sm:text-base" style={{ fontVariationSettings: "'FILL' 1" }}>cloud</span>
                </div>
                <div>
                  <p className="font-label-xs text-label-xs text-on-surface-variant">CO2 Saved</p>
                  <p className="font-headline-md text-headline-md text-on-surface">12.8kg</p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-6 left-4 sm:bottom-12 sm:left-12 bg-white/90 backdrop-blur rounded-xl p-3 sm:p-4 border border-outline-variant/30 card-shadow lp-animate-float-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-sm sm:text-base">payments</span>
                </div>
                <div>
                  <p className="font-label-xs text-label-xs text-on-surface-variant">Money Saved</p>
                  <p className="font-headline-md text-headline-md text-on-surface">₹840</p>
                </div>
              </div>
            </div>
            <div className="absolute top-4 right-4 sm:top-20 sm:right-8 bg-white/90 backdrop-blur rounded-xl p-3 sm:p-4 border border-outline-variant/30 card-shadow lp-animate-float-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F3F8E8] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-sm sm:text-base">stars</span>
                </div>
                <div>
                  <p className="font-label-xs text-label-xs text-on-surface-variant">Eco Score</p>
                  <p className="font-headline-md text-headline-md text-primary">87</p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-6 right-4 sm:bottom-24 sm:right-12 bg-white/90 backdrop-blur rounded-xl p-3 sm:p-4 border border-outline-variant/30 card-shadow">
              <p className="font-label-xs text-label-xs text-on-surface-variant mb-1">Solo Trips Avoided</p>
              <div className="flex items-center gap-1 text-primary">
                <span className="material-symbols-outlined text-xs sm:text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                <span className="material-symbols-outlined text-xs sm:text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                <span className="font-headline-md text-headline-md ml-1">14</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How GreenMove Works */}
      <section className="py-20 px-md bg-white lp-reveal" id="how-it-works">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-4">How GreenMove Works</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Three simple steps to smarter, greener travel.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/30 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-primary text-3xl">place</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3">1. Enter Destination</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Simply tell us where you need to go. We'll handle the complex calculations in the background.</p>
            </div>
            {/* Step 2 */}
            <div className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/30 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-primary text-3xl">compare_arrows</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3">2. Compare Options</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">See a side-by-side comparison of routes based on time, cost, and your carbon footprint.</p>
            </div>
            {/* Step 3 */}
            <div className="bg-surface-container-low rounded-xl p-8 border border-outline-variant/30 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
              <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-primary text-3xl">check_circle</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-3">3. Choose Better</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Select the route that aligns with your priorities and track your positive environmental impact over time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem / Solution Section */}
      <section className="py-20 px-md bg-surface-container-low border-y border-tertiary-fixed lp-reveal" id="problem">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-4">Smarter Choices, Tangible Impact</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Compare real-world options to see how small shifts in routing lead to massive environmental and financial savings.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white rounded-[20px] p-6 md:p-10 border border-outline-variant/30 card-shadow">
            {/* Conventional Route */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-tertiary-fixed opacity-70">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant">directions_car</span>
                  <span className="font-label-sm text-label-sm text-on-surface">Standard Solo Drive</span>
                </div>
                <span className="bg-surface-variant text-on-surface-variant font-label-xs text-label-xs px-2 py-1 rounded">Fastest</span>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-tertiary-fixed pb-2">
                  <span className="font-body-md text-body-md text-on-surface-variant">Time</span>
                  <span className="font-label-sm text-label-sm text-on-surface">24 min</span>
                </div>
                <div className="flex justify-between border-b border-tertiary-fixed pb-2">
                  <span className="font-body-md text-body-md text-on-surface-variant">Cost</span>
                  <span className="font-label-sm text-label-sm text-error">₹110</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">Emissions</span>
                  <span className="font-label-sm text-label-sm text-error">1.65 kg CO2</span>
                </div>
              </div>
            </div>
            {/* Recommended Route */}
            <div className="bg-white rounded-xl p-6 border-2 border-primary-container relative card-shadow transform md:scale-105 z-10">
              <div className="absolute -top-3 -right-3 bg-secondary-container text-on-secondary-container font-label-xs text-label-xs px-3 py-1 rounded-full flex items-center gap-1 shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                GreenMove Pick
              </div>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container">group</span>
                  <span className="font-label-sm text-label-sm text-on-surface">Recommended Carpool</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-tertiary-fixed pb-2">
                  <span className="font-body-md text-body-md text-on-surface-variant">Time</span>
                  <span className="font-label-sm text-label-sm text-on-surface">25 min</span>
                </div>
                <div className="flex justify-between border-b border-tertiary-fixed pb-2">
                  <span className="font-body-md text-body-md text-on-surface-variant">Cost</span>
                  <span className="font-label-sm text-label-sm text-primary">₹35</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">Emissions (per person)</span>
                  <span className="font-label-sm text-label-sm text-primary">0.41 kg CO2</span>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-tertiary-fixed">
                <p className="font-label-sm text-label-sm text-primary-container text-center">
                  Only 1 minute slower. 75% lower CO2. 68% cheaper.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* One Journey. Multiple Choices. */}
      <section className="py-20 px-md bg-white lp-reveal">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-4">One Journey. Multiple Choices.</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">See how different modes stack up for a typical 10km commute.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Option 1 */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 hover:border-primary-container transition-colors text-center">
              <span className="material-symbols-outlined text-on-surface text-3xl mb-4">directions_bus</span>
              <h4 className="font-label-sm text-label-sm text-on-surface mb-4">Public Transit</h4>
              <div className="space-y-2 text-left">
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Time:</span> <span class="text-on-surface font-semibold">40m</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Cost:</span> <span class="text-primary font-semibold">₹20</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>CO2:</span> <span class="text-primary font-semibold">0.3kg</span></p>
              </div>
            </div>
            {/* Option 2 */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 hover:border-primary-container transition-colors text-center">
              <span className="material-symbols-outlined text-on-surface text-3xl mb-4">group</span>
              <h4 className="font-label-sm text-label-sm text-on-surface mb-4">Carpool</h4>
              <div className="space-y-2 text-left">
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Time:</span> <span class="text-on-surface font-semibold">25m</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Cost:</span> <span class="text-primary font-semibold">₹35</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>CO2:</span> <span class="text-primary font-semibold">0.4kg</span></p>
              </div>
            </div>
            {/* Option 3 */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 hover:border-primary-container transition-colors text-center">
              <span className="material-symbols-outlined text-on-surface text-3xl mb-4">electric_car</span>
              <h4 className="font-label-sm text-label-sm text-on-surface mb-4">EV Drive</h4>
              <div className="space-y-2 text-left">
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Time:</span> <span class="text-on-surface font-semibold">24m</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Cost:</span> <span class="text-on-surface font-semibold">₹60</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>CO2:</span> <span class="text-primary font-semibold">0.1kg</span></p>
              </div>
            </div>
            {/* Option 4 */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 hover:border-primary-container transition-colors text-center">
              <span className="material-symbols-outlined text-on-surface text-3xl mb-4">pedal_bike</span>
              <h4 className="font-label-sm text-label-sm text-on-surface mb-4">Cycling</h4>
              <div className="space-y-2 text-left">
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Time:</span> <span class="text-error font-semibold">45m</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Cost:</span> <span class="text-primary font-semibold">₹0</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>CO2:</span> <span class="text-primary font-semibold">0kg</span></p>
              </div>
            </div>
            {/* Option 5 */}
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 hover:border-primary-container transition-colors text-center">
              <span className="material-symbols-outlined text-on-surface text-3xl mb-4">directions_walk</span>
              <h4 className="font-label-sm text-label-sm text-on-surface mb-4">Walking</h4>
              <div className="space-y-2 text-left">
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Time:</span> <span class="text-error font-semibold">2h</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>Cost:</span> <span class="text-primary font-semibold">₹0</span></p>
                <p className="font-label-xs text-label-xs text-on-surface-variant flex justify-between"><span>CO2:</span> <span class="text-primary font-semibold">0kg</span></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose GreenMove? */}
      <section className="py-20 px-md bg-white lp-reveal">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-4">Why Choose GreenMove?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Designed for the modern commuter who cares about the future.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex gap-4 p-6 bg-surface-container-low rounded-xl">
              <span className="material-symbols-outlined text-primary text-3xl">eco</span>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Lower Carbon Footprint</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Make meaningful reductions to your daily emissions with smarter choices.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-surface-container-low rounded-xl">
              <span className="material-symbols-outlined text-primary text-3xl">savings</span>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Save Money</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Discover cost-effective travel alternatives that don't compromise convenience.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-surface-container-low rounded-xl">
              <span className="material-symbols-outlined text-primary text-3xl">schedule</span>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Save Time</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Optimize your routes using real-time traffic and transit data.</p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-surface-container-low rounded-xl">
              <span className="material-symbols-outlined text-primary text-3xl">insights</span>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Smarter Mobility</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Gain insights into your travel habits and continuously improve your eco-score.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-md bg-surface-container text-center lp-reveal border-y border-outline-variant/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface mb-6">Your next commute can make a difference.</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-10">Start planning sustainable routes today and join the movement towards greener mobility.</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-primary-container text-on-primary font-label-sm text-label-sm px-8 py-4 rounded-lg hover:bg-primary transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1 flex items-center justify-center gap-2 mx-auto cursor-pointer"
          >
            Plan My Sustainable Route
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 px-md border-t border-outline-variant/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
            <span className="font-headline-md text-headline-md text-primary tracking-tight">GreenMove</span>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant text-center md:text-left">
            © 2024 GreenMove. Empowering sustainable transit choices.
          </p>
          <div className="flex gap-6">
            <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy</a>
            <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms</a>
            <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
