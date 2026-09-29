import React, { useState, useRef, useEffect } from 'react';

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'user',
      text: "I need to reach college before 9 AM. I don't want to spend more than ₹50 and I want to minimize pollution."
    },
    {
      id: 2,
      sender: 'ai',
      text: "I've analyzed the optimal routes balancing cost, time, and emissions. Here is the most sustainable option that fits your budget:",
      hasCard: true
    }
  ]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text) => {
    if (!text.trim()) return;

    const newMsg = {
      id: messages.length + 1,
      sender: 'user',
      text: text
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');

    // Trigger mock AI response
    setTimeout(() => {
      let aiText = "I'm looking into your request right now. Let me find the most eco-friendly routes for you.";
      let hasCard = false;

      const lowerText = text.toLowerCase();
      if (lowerText.includes('greenest') || lowerText.includes('route')) {
        aiText = "Based on current traffic, the greenest option is cycling (0 kg CO2) via the north park corridor. Alternatively, taking the electric bus costs ₹20 and emits only 0.31 kg CO2.";
      } else if (lowerText.includes('carpool')) {
        aiText = "I found 2 carpool matches heading toward Tech Park in the next 30 minutes. Booking a carpool seat will save you ₹75 and offset 2.4 kg of CO2.";
      } else if (lowerText.includes('charge') || lowerText.includes('charging')) {
        aiText = "Your battery is at 23%. Station A (120kW Fast Charger) is 4.2 km away on your route and has an open bay. It will take 15 minutes to charge to 80%.";
      }

      setMessages(prev => [...prev, {
        id: prev.length + 1,
        sender: 'ai',
        text: aiText,
        hasCard: hasCard
      }]);
    }, 1000);
  };

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-md lg:p-lg gap-lg overflow-hidden h-[calc(100vh-64px)]">
      {/* Chat History Area */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-lg custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'user' ? (
              <div className="bg-surface-container-high rounded-2xl rounded-tr-sm p-4 max-w-[80%] border border-outline-variant shadow-sm">
                <p className="text-body-md font-body-md text-on-surface">{msg.text}</p>
              </div>
            ) : (
              <div className="w-full max-w-[90%]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-xl">smart_toy</span>
                  <span className="text-label-sm font-label-sm text-primary">GreenMove AI</span>
                </div>
                <p className="text-body-md font-body-md text-on-surface-variant mb-4 ml-8">{msg.text}</p>
                
                {msg.hasCard && (
                  /* Multi-modal Recommendation Card */
                  <div className="ml-8 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-[0px_4px_20px_rgba(16,32,21,0.04)] overflow-hidden">
                    <div className="p-6 border-b border-outline-variant flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-[#F3F8E8] text-[#005B00] px-2 py-1 rounded-[8px] text-label-xs font-label-xs uppercase tracking-wider font-bold">Recommended</span>
                          <h3 className="text-headline-md font-headline-md text-on-surface">Carpool Match</h3>
                        </div>
                        <p className="text-body-md font-body-md text-on-surface-variant">Shared EV ride with 2 others along your route.</p>
                      </div>
                      <div className="text-right">
                        <div className="text-display-metrics font-display-metrics text-primary mb-1">₹35</div>
                        <p className="text-label-sm font-label-sm text-on-surface-variant">Total Cost</p>
                      </div>
                    </div>
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-outline-variant bg-surface">
                      <div className="p-4 flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-primary mb-2 text-2xl" style={{ fontVariationSettings: "'wght' 300" }}>timer</span>
                        <span className="text-headline-md font-headline-md text-on-surface">25 min</span>
                        <span className="text-label-xs font-label-xs text-on-surface-variant">Est. Time (Arrive by 8:45 AM)</span>
                      </div>
                      <div className="p-4 flex flex-col items-center justify-center text-center bg-[#F3F8E8]">
                        <span className="material-symbols-outlined text-primary mb-2 text-2xl" style={{ fontVariationSettings: "'wght' 300" }}>co2</span>
                        <span className="text-headline-md font-headline-md text-primary">0.41 kg</span>
                        <span className="text-label-xs font-label-xs text-primary font-bold">CO2 Emitted</span>
                      </div>
                      <div className="p-4 flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-primary mb-2 text-2xl" style={{ fontVariationSettings: "'wght' 300" }}>trending_down</span>
                        <span className="text-headline-md font-headline-md text-secondary">68%</span>
                        <span className="text-label-xs font-label-xs text-on-surface-variant">Cheaper than driving alone</span>
                      </div>
                    </div>
                    {/* Progress/Impact Bar */}
                    <div className="px-6 py-4 border-t border-outline-variant">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-label-xs font-label-xs text-on-surface-variant">Green Progress</span>
                        <span className="text-label-xs font-label-xs text-primary font-bold">High Impact</span>
                      </div>
                      <div className="w-full h-2 bg-tertiary-fixed rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#005B00] to-[#8DB600] w-[85%] rounded-full"></div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="p-4 bg-surface-container-low flex flex-wrap gap-3 justify-end border-t border-outline-variant">
                      <button className="px-4 py-2 rounded-[8px] text-label-sm font-label-sm text-[#005B00] bg-transparent hover:bg-surface-variant transition-colors cursor-pointer">Change Preference</button>
                      <button className="px-4 py-2 rounded-[8px] border border-[#005B00] text-[#005B00] text-label-sm font-label-sm bg-transparent hover:bg-surface-variant transition-colors cursor-pointer">Compare Options</button>
                      <button className="px-6 py-2 rounded-[8px] bg-[#005B00] text-white text-label-sm font-label-sm hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer">
                        View Route <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-auto">
        {/* Quick Prompts */}
        <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar mb-2">
          <button 
            onClick={() => handleSend("Find the greenest route")}
            className="whitespace-nowrap px-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm hover:border-primary hover:text-primary transition-colors cursor-pointer"
          >
            "Find the greenest route"
          </button>
          <button 
            onClick={() => handleSend("Can I carpool?")}
            className="whitespace-nowrap px-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm hover:border-primary hover:text-primary transition-colors cursor-pointer"
          >
            "Can I carpool?"
          </button>
          <button 
            onClick={() => handleSend("Where should I charge?")}
            className="whitespace-nowrap px-4 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm hover:border-primary hover:text-primary transition-colors cursor-pointer"
          >
            "Where should I charge?"
          </button>
        </div>
        
        {/* Input Field */}
        <div className="relative bg-surface-container-lowest rounded-[20px] border border-outline-variant shadow-sm focus-within:border-[#005B00] focus-within:ring-2 focus-within:ring-[#005B00]/20 transition-all duration-300 flex flex-col">
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(inputText);
              }
            }}
            className="w-full bg-transparent border-none focus:ring-0 resize-none p-4 pb-12 text-body-md font-body-md text-on-surface placeholder:text-on-surface-variant/50 outline-none" 
            placeholder="Ask GreenMove AI for travel advice..." 
            rows="2"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:text-primary rounded-full hover:bg-surface-variant transition-colors cursor-pointer">
              <span className="material-symbols-outlined">mic</span>
            </button>
            <button 
              onClick={() => handleSend(inputText)}
              className="bg-[#005B00] text-white p-2 rounded-full hover:opacity-90 transition-opacity shadow-sm flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
