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
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [role, setRole] = useState('user'); // 'viewer', 'user', 'admin'
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]); // Default all days
  const [historyLimit, setHistoryLimit] = useState(60); // Default 1 hour (60 min)
  const [usageLogs, setUsageLogs] = useState([]);

  const fetchData = async () => {
    try {
      const [statusRes, settingsRes, historyRes, schedulesRes, logsRes] = await Promise.all([
        axios.get(`${API_BASE}/status/`),
        axios.get(`${API_BASE}/settings/`),
        axios.get(`${API_BASE}/status/history?limit=${historyLimit}`),
        axios.get(`${API_BASE}/schedules/`),
        axios.get(`${API_BASE}/status/logs`)
      ]);
      setStatus(statusRes.data);
      setSettings(settingsRes.data);
      setSchedules(schedulesRes.data);
      setUsageLogs(logsRes.data);
      
      const historyData = Array.isArray(historyRes.data) ? historyRes.data : [];
      setHistory(historyData.map(h => ({
        ...h,
        time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })).reverse());
      
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data", err);
      setError("Cannot connect to Hot Tub API. Please ensure the backend is running.");
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [historyLimit]);

  const toggleControl = async (key, val) => {
    if (role === 'viewer') return;
    if (role === 'user' && (key === 'circ_pump' || key === 'ozone')) return;
    
    try {
      await axios.post(`${API_BASE}/control/`, { [key]: val });
      fetchData();
    } catch (err) {
      console.error("Error updating control", err);
    }
  };

  const resetFaults = async () => {
    if (role !== 'admin') return;
    try {
      await axios.post(`${API_BASE}/control/reset-faults`);
      fetchData();
    } catch (err) {
      console.error("Error resetting faults", err);
    }
  };

  const masterShutdown = async () => {
    if (role !== 'admin') return;
    if (!window.confirm("Are you sure you want to shut down ALL systems and lock the tub?")) return;
    try {
      await axios.post(`${API_BASE}/control/master-shutdown`);
      fetchData();
    } catch (err) {
      console.error("Error in master shutdown", err);
    }
  };

  const createSchedule = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      type: formData.get('type'),
      start_time: formData.get('start'),
      end_time: formData.get('end'),
      target_temp: parseFloat(formData.get('temp')) || null,
      light_on: formData.get('light_on') === 'on',
      days_of_week: selectedDays.join(','),
      active: true
    };
    try {
      await axios.post(`${API_BASE}/schedules/`, data);
      fetchData();
      e.target.reset();
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } catch (err) {
      console.error("Error creating schedule", err);
    }
  };

  const deleteSchedule = async (id) => {
    if (role !== 'admin') return;
    try {
      await axios.delete(`${API_BASE}/schedules/${id}`);
      fetchData();
    } catch (err) {
      console.error("Error deleting schedule", err);
    }
  };

  const toggleDay = (day) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a,b) => a - b)
    );
  };

  const updateRestTemp = async (delta) => {
    if (role !== 'admin') return;
    try {
      const newTemp = settings.default_rest_temp + delta;
      await axios.post(`${API_BASE}/settings/`, { default_rest_temp: newTemp });
      fetchData();
    } catch (err) {
      console.error("Error updating rest temp", err);
    }
  };

  const updateSetPoint = async (delta) => {
    if (role === 'viewer') return;
    try {
      const newTemp = settings.set_point + delta;
      await axios.post(`${API_BASE}/settings/`, { set_point: newTemp });
      fetchData();
    } catch (err) {
      console.error("Error updating set point", err);
    }
  };

  if (loading && !error) return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      <Zap className="animate-pulse mr-2" /> Loading OpenSoak...
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-4 text-center">
      <Zap className="text-red-500 mb-4 w-12 h-12" />
      <h1 className="text-xl font-bold mb-2">Connection Error</h1>
      <p className="text-slate-400 mb-6">{error}</p>
      <button 
        onClick={() => { setError(null); setLoading(true); fetchData(); }}
        className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-full font-bold transition"
      >
        Retry Connection
      </button>
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
            {status?.safety_status !== 'OK' && role === 'admin' && (
              <button 
                onClick={resetFaults}
                className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded border border-red-500/50 transition"
              >
                Reset Faults
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Temporary Role Switcher */}
          <select 
            value={role} 
            onChange={(e) => setRole(e.target.value)}
            className="bg-slate-900 text-xs text-slate-400 border border-slate-800 rounded px-2 py-1 outline-none"
          >
            <option value="viewer">Viewer Mode</option>
            <option value="user">User Mode</option>
            <option value="admin">Admin Mode</option>
          </select>

          <div className="bg-slate-900 px-4 py-2 rounded-full border border-slate-800 flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
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
                  {role !== 'viewer' && (
                    <div className="flex space-x-1">
                      <button onClick={() => updateSetPoint(0.5)} className="p-1 hover:bg-slate-800 rounded transition"><ChevronUp /></button>
                      <button onClick={() => updateSetPoint(-0.5)} className="p-1 hover:bg-slate-800 rounded transition"><ChevronDown /></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-10 w-px bg-slate-800 mx-4"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Rest Temp</span>
                <div className="flex items-center space-x-4">
                  <span className="text-lg font-bold text-slate-400">{settings?.default_rest_temp}°F</span>
                  {role === 'admin' && (
                    <div className="flex space-x-1">
                      <button onClick={() => updateRestTemp(0.5)} className="p-1 hover:bg-slate-800 rounded transition scale-75"><ChevronUp /></button>
                      <button onClick={() => updateRestTemp(-0.5)} className="p-1 hover:bg-slate-800 rounded transition scale-75"><ChevronDown /></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-10 w-px bg-slate-800 mx-4"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Status</span>
                <span className={`text-lg font-semibold ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>
                  {isHeaterOn ? 'Heating...' : 'Ready'}
                </span>
                {status?.desired_state?.jet_pump && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">Jets Active</span>}
              </div>
            </div>
          </div>

          <div className="mt-12">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-500 text-xs font-bold uppercase">Temperature History</h3>
              <select 
                value={historyLimit} 
                onChange={(e) => setHistoryLimit(parseInt(e.target.value))}
                className="bg-slate-950 text-[10px] text-slate-400 border border-slate-800 rounded px-2 py-1 outline-none"
              >
                <option value="60">Last 1 Hour</option>
                <option value="360">Last 6 Hours</option>
                <option value="1440">Last 24 Hours</option>
              </select>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis 
                    domain={[70, 115]} 
                    stroke="#475569" 
                    fontSize={10} 
                    tickFormatter={(val) => `${val}°`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#60a5fa' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    name="Temperature"
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={false} 
                    animationDuration={1000}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
              disabled={role === 'viewer'}
            />
            <ControlToggle 
              label="Jets" 
              icon={<Wind />} 
              active={status?.desired_state?.jet_pump} 
              onToggle={(v) => toggleControl('jet_pump', v)}
              color="blue"
              disabled={role === 'viewer'}
            />
            <ControlToggle 
              label="Light" 
              icon={<Lightbulb />} 
              active={status?.desired_state?.light} 
              onToggle={(v) => toggleControl('light', v)}
              color="yellow"
              disabled={role === 'viewer'}
            />
            
            {(role === 'admin') && (
              <>
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Admin Controls</h3>
                  <div className="space-y-4">
                    <ControlToggle 
                      label="Circ Pump" 
                      icon={<Droplets />} 
                      active={status?.desired_state?.circ_pump} 
                      onToggle={(v) => toggleControl('circ_pump', v)}
                      color="emerald"
                    />
                    <ControlToggle 
                      label="Ozone" 
                      icon={<Zap />} 
                      active={status?.desired_state?.ozone} 
                      onToggle={(v) => toggleControl('ozone', v)}
                      color="blue"
                    />
                    <button 
                      onClick={masterShutdown}
                      className="w-full flex items-center justify-center p-4 rounded-2xl border border-red-500/50 bg-red-500/10 text-red-500 font-black uppercase tracking-tighter hover:bg-red-500/20 transition"
                    >
                      <Zap className="mr-2" /> Master Shutdown
                    </button>
                  </div>
                </div>
              </>
            )}
            
            {role === 'user' && (
              <div className="pt-4 border-t border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center">
                  Admin features locked
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
             <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Recent Activity</h3>
             <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
               {usageLogs.length === 0 ? (
                 <p className="text-[10px] text-slate-600 italic">No recent activity</p>
               ) : (
                 usageLogs.map(l => (
                   <div key={l.id} className="text-[10px] border-l-2 border-blue-500/30 pl-2 py-1">
                     <p className="text-slate-300 font-bold">{l.event}</p>
                     <p className="text-slate-500 truncate">{l.details}</p>
                     <p className="text-[8px] text-slate-600 italic">{new Date(l.timestamp).toLocaleString([], {month: 'short', day:'numeric', hour: '2-digit', minute:'2-digit'})}</p>
                   </div>
                 ))
               )}
             </div>
          </div>

          <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
             <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Current Schedules</h3>
             {schedules.length === 0 ? (
               <p className="text-[10px] text-slate-600 italic">No schedules active</p>
             ) : (
               <div className="space-y-2 mb-4">
                 {schedules.map(s => (
                   <div key={s.id} className="group flex justify-between items-center text-[10px]">
                     <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="text-slate-300 font-bold">{s.name}</span>
                          <span className="text-slate-500 ml-2">({s.type})</span>
                        </div>
                        <span className="text-slate-500">{s.start_time} - {s.end_time}</span>
                     </div>
                     {role === 'admin' && (
                       <button onClick={() => deleteSchedule(s.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 p-1 transition">
                         ✕
                       </button>
                     )}
                   </div>
                 ))}
               </div>
             )}

             {role === 'admin' && (
               <form onSubmit={createSchedule} className="pt-4 border-t border-slate-900 space-y-2">
                 <input name="name" placeholder="Name" className="w-full bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                 
                 {/* Day Selection */}
                 <div className="flex justify-between px-1">
                   {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, idx) => (
                     <button
                       key={idx}
                       type="button"
                       onClick={() => toggleDay(idx)}
                       className={`w-5 h-5 rounded-full text-[8px] flex items-center justify-center font-bold transition ${selectedDays.includes(idx) ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}
                     >
                       {label}
                     </button>
                   ))}
                 </div>

                 <div className="flex space-x-2">
                   <select name="type" className="flex-1 bg-slate-900 text-xs p-2 rounded outline-none border border-slate-800">
                     <option value="soak">Soak Cycle</option>
                     <option value="clean">Clean Cycle</option>
                   </select>
                   <input name="temp" type="number" placeholder="Temp" className="w-16 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" />
                   <div className="flex items-center bg-slate-900 px-2 rounded border border-slate-800">
                      <input name="light_on" type="checkbox" defaultChecked className="w-3 h-3" />
                      <Lightbulb size={12} className="ml-1 text-slate-500" />
                   </div>
                 </div>
                 <div className="flex space-x-2">
                   <input name="start" type="time" className="flex-1 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                   <input name="end" type="time" className="flex-1 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                 </div>
                 <button className="w-full bg-blue-600 text-[10px] py-2 rounded font-bold uppercase tracking-widest">Add Schedule</button>
               </form>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}

function ControlToggle({ label, icon, active, onToggle, color, disabled }) {
  const colors = {
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/50",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    gray: "bg-slate-800 text-slate-400 border-slate-700"
  };

  return (
    <button 
      onClick={() => !disabled && onToggle(!active)}
      disabled={disabled}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${active ? colors[color] : colors.gray}`}
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
