import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Thermometer, 
  Droplets, 
  Wind, 
  Lightbulb, 
  Zap, 
  ShieldCheck, 
  Settings as SettingsIcon,
  Clock,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const API_BASE = "http://localhost:8000/api";

function App() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statusRes, settingsRes, historyRes] = await Promise.all([
        axios.get(`${API_BASE}/status/`),
        axios.get(`${API_BASE}/settings/`),
        axios.get(`${API_BASE}/status/history`)
      ]);
      setStatus(statusRes.data);
      setSettings(settingsRes.data);
      setHistory(historyRes.data.map(h => ({
        ...h,
        time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })).reverse());
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleControl = async (key, val) => {
    try {
      await axios.post(`${API_BASE}/control/`, { [key]: val });
      fetchData();
    } catch (err) {
      console.error("Error updating control", err);
    }
  };

  const resetFaults = async () => {
    try {
      await axios.post(`${API_BASE}/control/reset-faults`);
      fetchData();
    } catch (err) {
      console.error("Error resetting faults", err);
    }
  };

  const updateSetPoint = async (delta) => {
    try {
      const newTemp = settings.set_point + delta;
      await axios.post(`${API_BASE}/settings/`, { set_point: newTemp });
      fetchData();
    } catch (err) {
      console.error("Error updating set point", err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      <Zap className="animate-pulse mr-2" /> Loading OpenSoak...
    </div>
  );

  const currentTemp = status?.current_temp?.toFixed(1) || "--";
  const isHeaterOn = status?.actual_relay_state?.heater;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 text-slate-100 font-sans">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            OpenSoak
          </h1>
          <div className="flex items-center space-x-4">
            <p className="text-slate-400 text-sm flex items-center">
              <ShieldCheck className={`w-3 h-3 mr-1 ${status?.safety_status === 'OK' ? 'text-emerald-500' : 'text-red-500'}`} /> 
              System: {status?.safety_status}
            </p>
            {status?.safety_status !== 'OK' && (
              <button 
                onClick={resetFaults}
                className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded border border-red-500/50 transition"
              >
                Reset Faults
              </button>
            )}
          </div>
        </div>
        <div className="bg-slate-900 px-4 py-2 rounded-full border border-slate-800 flex items-center space-x-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Temp Card */}
        <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Thermometer className="w-48 h-48 text-blue-400" />
          </div>
          
          <div className="relative z-10">
            <h2 className="text-slate-400 uppercase tracking-widest text-xs font-bold mb-4">Current Water Temperature</h2>
            <div className="flex items-baseline">
              <span className="text-8xl font-black text-white">{currentTemp}</span>
              <span className="text-4xl font-light text-slate-500 ml-2">°F</span>
            </div>
            
            <div className="mt-8 flex items-center space-x-4">
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Target Temp</span>
                <div className="flex items-center space-x-4">
                  <span className="text-2xl font-bold text-blue-400">{settings?.set_point}°F</span>
                  <div className="flex space-x-1">
                    <button onClick={() => updateSetPoint(0.5)} className="p-1 hover:bg-slate-800 rounded transition"><ChevronUp /></button>
                    <button onClick={() => updateSetPoint(-0.5)} className="p-1 hover:bg-slate-800 rounded transition"><ChevronDown /></button>
                  </div>
                </div>
              </div>
              <div className="h-10 w-px bg-slate-800 mx-4"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Status</span>
                <span className={`text-lg font-semibold ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>
                  {isHeaterOn ? 'Heating...' : 'Ready'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-12 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  dot={false} 
                  animationDuration={1000}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Controls Card */}
        <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl">
          <h2 className="text-white text-xl font-bold mb-6 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2 text-slate-400" /> Device Controls
          </h2>
          
          <div className="space-y-4">
            <ControlToggle 
              label="Heater" 
              icon={<Zap />} 
              active={status?.desired_state?.heater} 
              onToggle={(v) => toggleControl('heater', v)}
              color="orange"
            />
            <ControlToggle 
              label="Jets" 
              icon={<Wind />} 
              active={status?.desired_state?.jet_pump} 
              onToggle={(v) => toggleControl('jet_pump', v)}
              color="blue"
            />
            <ControlToggle 
              label="Light" 
              icon={<Lightbulb />} 
              active={status?.desired_state?.light} 
              onToggle={(v) => toggleControl('light', v)}
              color="yellow"
            />
            <ControlToggle 
              label="Circ Pump" 
              icon={<Droplets />} 
              active={status?.desired_state?.circ_pump} 
              onToggle={(v) => toggleControl('circ_pump', v)}
              color="emerald"
            />
          </div>

          <div className="mt-12 p-4 bg-slate-950 rounded-2xl border border-slate-800">
             <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Safety Info</h3>
             <ul className="text-xs text-slate-400 space-y-2">
                <li className="flex items-start">
                  <span className="text-emerald-500 mr-2">✓</span> Heater interlocked with circulation pump
                </li>
                <li className="flex items-start">
                  <span className="text-emerald-500 mr-2">✓</span> High-temp cutoff at {settings?.max_temp_limit}°F
                </li>
             </ul>
          </div>
        </div>

      </div>
    </div>
  );
}

function ControlToggle({ label, icon, active, onToggle, color }) {
  const colors = {
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/50",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    gray: "bg-slate-800 text-slate-400 border-slate-700"
  };

  return (
    <button 
      onClick={() => onToggle(!active)}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${active ? colors[color] : colors.gray}`}
    >
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${active ? 'bg-white/10' : 'bg-slate-900'}`}>
          {React.cloneElement(icon, { size: 20 })}
        </div>
        <span className="ml-4 font-bold">{label}</span>
      </div>
      <div className={`w-12 h-6 rounded-full relative transition-colors ${active ? 'bg-current opacity-80' : 'bg-slate-700'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${active ? 'right-1' : 'left-1'}`} />
      </div>
    </button>
  );
}

export default App;