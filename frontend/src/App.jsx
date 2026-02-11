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
  ChevronDown,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Moon,
  MapPin,
  Navigation,
  Umbrella
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
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [weather, setWeather] = useState(null);
  const [tempInput, setTempInput] = useState("");
  const [isEditingTemp, setIsEditingTemp] = useState(false);

  const fetchData = async () => {
    try {
      const [statusRes, settingsRes, historyRes, schedulesRes, logsRes, weatherRes] = await Promise.all([
        axios.get(`${API_BASE}/status/`),
        axios.get(`${API_BASE}/settings/`),
        axios.get(`${API_BASE}/status/history?limit=${historyLimit}`),
        axios.get(`${API_BASE}/schedules/`),
        axios.get(`${API_BASE}/status/logs`),
        axios.get(`${API_BASE}/status/weather`)
      ]);
      
      setStatus(statusRes.data);
      if (!isEditingTemp) {
        setSettings(settingsRes.data);
        setTempInput(settingsRes.data?.set_point?.toString() || "");
      }
      setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
      setUsageLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      setWeather(weatherRes.data);
      
      const historyData = Array.isArray(historyRes.data) ? historyRes.data : [];
      setHistory(historyData.map(h => ({
        ...h,
        time: h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"
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
  }, [historyLimit, isEditingTemp]);

  const toggleControl = async (key, val) => {
    if (role === 'viewer') return;
    if (role === 'user' && (key === 'circ_pump' || key === 'ozone')) return;
    
    if (key === 'circ_pump' && val === false) {
      if (!window.confirm("Warning: Turning off the Circulation Pump will automatically shut down the heater and all other active cycles to prevent equipment damage. Continue?")) {
        return;
      }
    }

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
      target_temp: formData.get('temp') ? parseFloat(formData.get('temp')) : null,
      light_on: formData.get('light_on') === 'on',
      days_of_week: selectedDays.join(','),
      active: true
    };
    try {
      if (editingSchedule) {
        await axios.put(`${API_BASE}/schedules/${editingSchedule.id}`, data);
      } else {
        await axios.post(`${API_BASE}/schedules/`, data);
      }
      fetchData();
      e.target.reset();
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setEditingSchedule(null);
    } catch (err) {
      console.error("Error saving schedule", err);
      const msg = err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || err.message;
      alert(`Error: ${msg}`);
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

  const editSchedule = (sched) => {
    setEditingSchedule(sched);
    setSelectedDays(sched.days_of_week.split(',').map(Number));
  };

  const cancelEdit = () => {
    setEditingSchedule(null);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const toggleDay = (day) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a,b) => a - b)
    );
  };

  const updateRestTemp = async (delta) => {
    if (role !== 'admin') return;
    
    // Optimistic update
    const newTemp = Math.round((settings.default_rest_temp + delta) * 2) / 2;
    setSettings(prev => ({ ...prev, default_rest_temp: newTemp }));
    
    try {
      await axios.post(`${API_BASE}/settings/`, { default_rest_temp: newTemp });
      // fetchData();
    } catch (err) {
      console.error("Error updating rest temp", err);
    }
  };

  const updateLocation = async (zip) => {
    if (role !== 'admin') return;
    try {
      await axios.post(`${API_BASE}/settings/`, { location: zip });
      fetchData();
    } catch (err) {
      console.error("Error updating location", err);
    }
  };

  const getWeatherIcon = (code, isDay = true) => {
    if (code === 0) return isDay ? <Sun className="text-yellow-400" /> : <Moon className="text-slate-400" />;
    if (code <= 3) return <Cloud className="text-slate-400" />;
    if (code <= 48) return <Cloud className="text-slate-500" />;
    if (code <= 67) return <CloudRain className="text-blue-400" />;
    if (code <= 77) return <Snowflake className="text-blue-200" />;
    if (code <= 82) return <CloudRain className="text-blue-500" />;
    if (code <= 99) return <CloudLightning className="text-yellow-600" />;
    return <Cloud />;
  };

  const getWindDirLabel = (deg) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  const updateSetPoint = async (delta) => {
    if (role === 'viewer') return;
    
    // Optimistic update for responsiveness
    const newTemp = Math.round((settings.set_point + delta) * 2) / 2;
    setSettings(prev => ({ ...prev, set_point: newTemp }));
    setTempInput(newTemp.toString());

    try {
      await axios.post(`${API_BASE}/settings/`, { set_point: newTemp });
      // fetchData() is handled by the interval, but we could call it if we wanted immediate confirmation
    } catch (err) {
      console.error("Error updating set point", err);
      // Revert on error if necessary, but fetchData will naturally correct it
    }
  };

  const startSoak = async (temp, duration) => {
    try {
      await axios.post(`${API_BASE}/control/start-soak`, { target_temp: temp, duration_minutes: parseInt(duration) });
      fetchData();
    } catch (err) {
      console.error("Error starting soak", err);
    }
  };

  const cancelSoak = async () => {
    try {
      await axios.post(`${API_BASE}/control/cancel-soak`);
      fetchData();
    } catch (err) {
      console.error("Error cancelling soak", err);
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
    <div className="min-h-screen bg-transparent p-4 md:p-8 text-slate-100 font-sans relative overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      <header className="flex justify-between items-center mb-8 relative z-10">
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
        
        <div className="flex items-center space-x-6">
          {weather && !weather.error && weather.current && (
            <div className="bg-slate-900 px-5 py-3 rounded-full border border-slate-800 flex items-center space-x-4 shadow-lg">
              {React.cloneElement(getWeatherIcon(weather.current.weather_code, weather.current.is_day), { size: 28 })}
              <div className="flex flex-col leading-tight">
                <span className="text-xl font-bold text-white">{weather.current.temperature_2m?.toFixed(0) || "--"}°F</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{weather.city || "Unknown"}</span>
              </div>
            </div>
          )}

          {/* Temporary Role Switcher */}
          <select 
            value={role} 
            onChange={(e) => setRole(e.target.value)}
            className="bg-slate-900 text-sm text-slate-400 border border-slate-800 rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition"
          >
            <option value="viewer">Viewer Mode</option>
            <option value="user">User Mode</option>
            <option value="admin">Admin Mode</option>
          </select>

          <div className="bg-slate-900 px-5 py-3 rounded-full border border-slate-800 flex items-center space-x-3 shadow-lg">
            <Clock className="w-6 h-6 text-blue-400" />
            <span className="text-lg font-bold text-slate-100">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Temp Card */}
        <div className={`lg:col-span-2 bg-slate-900 rounded-3xl p-8 border transition-all duration-500 shadow-xl relative overflow-hidden ${isHeaterOn ? 'border-orange-500/50 bg-glow-orange' : 'border-slate-800'}`}>
          <div className={`absolute top-0 right-0 p-8 opacity-10 ${isHeaterOn ? 'text-orange-500' : 'text-slate-700'}`}>
            <div className="relative">
               <Thermometer className="w-48 h-48" />
               {isHeaterOn && (
                 <div className="absolute inset-0 bg-orange-500 animate-fill" style={{ maskImage: 'url("/vite.svg")', maskRepeat: 'no-repeat', maskPosition: 'center' }}>
                   <Thermometer className="w-48 h-48" />
                 </div>
               )}
            </div>
          </div>
          
          <div className="relative z-10">
            <h2 className="text-slate-400 uppercase tracking-widest text-xs font-bold mb-4">Current Water Temperature</h2>
            <div className="flex items-baseline">
              <span className={`text-8xl font-black text-white transition-all ${isHeaterOn ? 'animate-float' : ''}`}>{currentTemp}</span>
              <span className="text-4xl font-light text-slate-500 ml-2">°F</span>
            </div>
            
            <div className="mt-8 flex items-center space-x-4">
              <div className="flex flex-col group relative">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Target Temp</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-800 text-[10px] text-white p-2 rounded border border-slate-700 w-32 z-50">
                  Temperature the tub will maintain while in use.
                </div>
                <div className="flex items-center space-x-4">
                  {role !== 'viewer' ? (
                    <input 
                      type="number" 
                      step="0.5"
                      value={tempInput}
                      onFocus={() => setIsEditingTemp(true)}
                      onChange={(e) => setTempInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(tempInput);
                          if (!isNaN(val)) {
                            updateSetPoint(val - settings.set_point);
                            setIsEditingTemp(false);
                            e.target.blur();
                          }
                        }
                        if (e.key === 'Escape') {
                          setTempInput(settings.set_point.toString());
                          setIsEditingTemp(false);
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        const val = parseFloat(tempInput);
                        if (!isNaN(val)) {
                          updateSetPoint(val - settings.set_point);
                        }
                        setIsEditingTemp(false);
                      }}
                      className="bg-slate-950 border border-slate-800 text-2xl font-bold text-blue-400 w-24 px-2 py-1 rounded outline-none focus:border-blue-500 transition"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-blue-400">{settings?.set_point}°F</span>
                  )}
                  {role !== 'viewer' && (
                    <div className="flex space-x-1">
                      <button onClick={() => updateSetPoint(0.5)} title="Increase Target Temp" className="p-1 hover:bg-slate-800 rounded transition"><ChevronUp /></button>
                      <button onClick={() => updateSetPoint(-0.5)} title="Decrease Target Temp" className="p-1 hover:bg-slate-800 rounded transition"><ChevronDown /></button>
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
                      <button onClick={() => updateRestTemp(0.5)} title="Increase Rest Temp" className="p-1 hover:bg-slate-800 rounded transition scale-75"><ChevronUp /></button>
                      <button onClick={() => updateRestTemp(-0.5)} title="Decrease Rest Temp" className="p-1 hover:bg-slate-800 rounded transition scale-75"><ChevronDown /></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-10 w-px bg-slate-800 mx-4"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-tight">Status</span>
                <div className="flex items-center space-x-2">
                  <span className={`text-lg font-semibold ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>
                    {isHeaterOn ? 'Heating...' : 'Ready'}
                  </span>
                  {status?.desired_state?.manual_soak_active && (
                    <button 
                      onClick={cancelSoak} 
                      className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase px-2 py-1 rounded-md transition shadow-lg shadow-red-500/20"
                      title="End current session and return to rest temperature"
                    >
                      <Zap size={10} className="fill-current" />
                      <span>Stop Session</span>
                    </button>
                  )}
                </div>
                {status?.desired_state?.manual_soak_active && (
                   <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest animate-pulse mt-1">Manual Soak Active</span>
                )}
                {status?.desired_state?.jet_pump && !status?.desired_state?.manual_soak_active && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1 animate-pulse">Jets Active</span>}
              </div>
            </div>

            {/* Quick Soak Controls */}
            {role !== 'viewer' && !status?.desired_state?.manual_soak_active && (
              <div className="mt-8 p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50 flex items-center justify-between group relative">
                <div className="absolute -top-8 left-0 hidden group-hover:block bg-slate-800 text-[10px] text-white p-2 rounded border border-slate-700 z-50">
                  Start an immediate heating session. Jets and lights can be toggled manually.
                </div>
                <div className="flex items-center space-x-4">
                  <Zap className={`text-orange-400 w-5 h-5 ${isHeaterOn ? 'animate-pulse' : ''}`} />
                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-tight">Quick Heat</h3>
                    <p className="text-[10px] text-slate-500">Override thermostat</p>
                  </div>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  startSoak(formData.get('temp'), formData.get('duration'));
                }} className="flex items-center space-x-2">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-slate-500 uppercase font-bold ml-1">Temp</span>
                    <input name="temp" type="number" step="0.5" defaultValue="104" className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-orange-400 font-bold outline-none focus:border-orange-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-slate-500 uppercase font-bold ml-1">Min</span>
                    <input name="duration" type="number" defaultValue={settings?.default_soak_duration || 60} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-slate-300 outline-none focus:border-slate-700" />
                  </div>
                  <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold uppercase px-4 py-2 rounded-xl transition-all shadow-lg shadow-orange-500/20">
                    Heat Now
                  </button>
                </form>
              </div>
            )}
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

          {/* Weekly Forecast */}
          {weather && weather.daily && (
            <div className="mt-8 pt-8 border-t border-slate-800">
              <h3 className="text-slate-500 text-xs font-bold uppercase mb-4">7-Day Forecast</h3>
              <div className="grid grid-cols-7 gap-3">
                {weather.daily.time.slice(0, 7).map((date, idx) => (
                  <div key={date} className="flex flex-col items-center p-3 rounded-2xl bg-slate-950 border border-slate-800/50 shadow-sm transition-transform hover:scale-105">
                    <span className="text-[10px] text-slate-400 uppercase font-black mb-3">
                      {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <div className="mb-3 text-blue-400">
                      {React.cloneElement(getWeatherIcon(weather.daily.weather_code[idx]), { size: 28 })}
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold text-white">{weather.daily.temperature_2m_max[idx].toFixed(0)}°</span>
                      <span className="text-[10px] text-slate-500 font-medium">{weather.daily.temperature_2m_min[idx].toFixed(0)}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hourly Forecast */}
          {weather && weather.hourly && (
            <div className="mt-8 pt-8 border-t border-slate-800">
              <h3 className="text-slate-500 text-xs font-bold uppercase mb-4">Hourly Forecast (Next 12h)</h3>
              <div className="flex space-x-3 overflow-x-auto pb-4 custom-scrollbar">
                {(() => {
                  const now = new Date();
                  const currentHourIndex = weather.hourly.time.findIndex(t => new Date(t) >= now);
                  const startIndex = currentHourIndex >= 0 ? currentHourIndex : 0;
                  
                  return weather.hourly.time.slice(startIndex, startIndex + 12).map((time, idx) => {
                    const actualIdx = startIndex + idx;
                    const hourDate = new Date(time);
                    const hour = hourDate.getHours();
                    const displayTime = hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                    const rainProb = weather.hourly.precipitation_probability[actualIdx];
                    const windSpeed = weather.hourly.wind_speed_10m[actualIdx];
                    const windDir = weather.hourly.wind_direction_10m[actualIdx];
                    const temp = weather.hourly.temperature_2m[actualIdx];
                    
                    return (
                      <div key={time} className="flex-shrink-0 flex flex-col items-center p-3 w-24 rounded-2xl bg-slate-950/50 border border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <span className="text-[10px] text-slate-500 font-bold mb-2">{displayTime}</span>
                        <span className="text-lg font-bold text-white mb-1">{temp?.toFixed(0)}°</span>
                        
                        <div className="flex items-center text-[10px] text-blue-400 mb-1 font-bold">
                          <Umbrella size={10} className="mr-1" />
                          {rainProb}%
                        </div>
                        
                        <div className="flex flex-col items-center text-[8px] text-slate-500">
                          <div className="flex items-center space-x-1 mb-0.5">
                            <Wind size={10} />
                            <span>{windSpeed?.toFixed(0)} mph</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Navigation size={8} style={{ transform: `rotate(${windDir}deg)` }} className="text-slate-400" />
                            <span className="uppercase">{getWindDirLabel(windDir)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Controls Card / Info Sidebar */}
        <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl">
          {role !== 'viewer' ? (
            <>
              <h2 className="text-white text-xl font-bold mb-6 flex items-center">
                <SettingsIcon className="w-5 h-5 mr-2 text-slate-400" /> Device Controls
              </h2>
              
              <div className="space-y-4">
                <StatusIndicator 
                  label="Heater" 
                  active={status?.actual_relay_state?.heater} 
                  color="text-orange-400" 
                  isLarge={true}
                  icon={<Zap size={20} />}
                />
                <ControlToggle 
                  label="Jets" 
                  icon={<Wind />} 
                  active={status?.desired_state?.jet_pump} 
                  onToggle={(v) => toggleControl('jet_pump', v)}
                  color="blue"
                  tooltip="Toggle high-power jet pump for hydrotherapy."
                />
                <ControlToggle 
                  label="Light" 
                  icon={<Lightbulb />} 
                  active={status?.desired_state?.light} 
                  onToggle={(v) => toggleControl('light', v)}
                  color="yellow"
                  tooltip="Toggle underwater LED lighting."
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
                          tooltip="Toggle water circulation and filtration."
                        />
                        <ControlToggle 
                          label="Ozone" 
                          icon={<Zap />} 
                          active={status?.desired_state?.ozone} 
                          onToggle={(v) => toggleControl('ozone', v)}
                          color="blue"
                          tooltip="Toggle ozone generator for water purification."
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
            </>
          ) : (
            <>
              <h2 className="text-white text-xl font-bold mb-6 flex items-center">
                <ShieldCheck className="w-5 h-5 mr-2 text-emerald-400" /> System Information
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <StatusIndicator label="Heater" active={status?.actual_relay_state?.heater} color="text-orange-400" />
                <StatusIndicator label="Jets" active={status?.actual_relay_state?.jet_pump} color="text-blue-400" />
                <StatusIndicator label="Light" active={status?.actual_relay_state?.light} color="text-yellow-400" />
                <StatusIndicator label="Pump" active={status?.actual_relay_state?.circ_pump} color="text-emerald-400" />
              </div>
            </>
          )}

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
                       <div className="opacity-0 group-hover:opacity-100 flex space-x-2 transition">
                         <button onClick={() => editSchedule(s)} className="text-blue-500 hover:text-blue-400 p-1">
                           ✎
                         </button>
                         <button onClick={() => deleteSchedule(s.id)} className="text-red-500 hover:text-red-400 p-1">
                           ✕
                         </button>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             )}

             {role === 'admin' && (
               <form key={editingSchedule ? `edit-${editingSchedule.id}` : 'new'} onSubmit={createSchedule} className="pt-4 border-t border-slate-900 space-y-2">
                 <div className="flex justify-between items-center">
                    <h4 className="text-[10px] text-slate-500 font-bold uppercase">{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</h4>
                    {editingSchedule && <button type="button" onClick={cancelEdit} className="text-[8px] text-red-500 font-bold uppercase">Cancel</button>}
                 </div>
                 <input name="name" defaultValue={editingSchedule?.name || ''} placeholder="Name" className="w-full bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                 
                 {/* Day Selection */}
                 <div className="flex justify-between px-1">
                   {[
                     { label: 'S', val: 6 },
                     { label: 'M', val: 0 },
                     { label: 'T', val: 1 },
                     { label: 'W', val: 2 },
                     { label: 'T', val: 3 },
                     { label: 'F', val: 4 },
                     { label: 'S', val: 5 }
                   ].map((day) => (
                     <button
                       key={day.val}
                       type="button"
                       onClick={() => toggleDay(day.val)}
                       className={`w-5 h-5 rounded-full text-[8px] flex items-center justify-center font-bold transition ${selectedDays.includes(day.val) ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}
                     >
                       {day.label}
                     </button>
                   ))}
                 </div>

                 <div className="flex space-x-2">
                   <select name="type" defaultValue={editingSchedule?.type || 'soak'} className="flex-1 bg-slate-900 text-xs p-2 rounded outline-none border border-slate-800">
                     <option value="soak">Soak Cycle</option>
                     <option value="clean">Clean Cycle</option>
                     <option value="ozone">Ozone Cycle</option>
                   </select>
                   <input name="temp" type="number" step="0.1" defaultValue={editingSchedule?.target_temp || ''} placeholder="Temp" className="w-16 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" />
                   <div className="flex items-center bg-slate-900 px-2 rounded border border-slate-800">
                      <input name="light_on" type="checkbox" defaultChecked={editingSchedule ? editingSchedule.light_on : true} className="w-3 h-3" />
                      <Lightbulb size={12} className="ml-1 text-slate-500" />
                   </div>
                 </div>
                 <div className="flex space-x-2">
                   <input name="start" type="time" defaultValue={editingSchedule?.start_time || "18:00"} className="flex-1 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                   <input name="end" type="time" defaultValue={editingSchedule?.end_time || "20:00"} className="flex-1 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800" required />
                 </div>
                 <button className={`w-full ${editingSchedule ? 'bg-emerald-600' : 'bg-blue-600'} text-[10px] py-2 rounded font-bold uppercase tracking-widest transition-colors`}>
                    {editingSchedule ? 'Save Changes' : 'Add Schedule'}
                 </button>
               </form>
             )}
          </div>

          {role === 'admin' && (
            <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800">
               <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center">
                 <SettingsIcon size={12} className="mr-1" /> System Settings
               </h3>
               <div className="space-y-4">
                 <div className="group relative">
                   <label className="text-[8px] text-slate-500 uppercase font-bold ml-1">Weather Location</label>
                   <div className="flex items-center space-x-2">
                     <MapPin size={12} className="text-slate-500" />
                     <input 
                       defaultValue={settings?.location || ''} 
                       onBlur={(e) => updateLocation(e.target.value)}
                       placeholder="Zip / City" 
                       className="flex-1 bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800 focus:border-blue-500 transition"
                     />
                   </div>
                   <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-slate-800 text-[8px] text-white p-1 rounded border border-slate-700 z-50">
                     Used to fetch local weather & forecast.
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="group relative">
                      <label className="text-[8px] text-slate-500 uppercase font-bold ml-1">Rest Temperature</label>
                      <div className="flex items-center space-x-1">
                        <Thermometer size={12} className="text-slate-500" />
                        <input 
                          type="number"
                          step="0.5"
                          key={`rest-input-${settings?.default_rest_temp}`}
                          defaultValue={settings?.default_rest_temp}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) updateRestTemp(val - settings.default_rest_temp);
                          }}
                          className="w-full bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800 focus:border-blue-500 transition font-bold text-slate-300"
                        />
                      </div>
                      <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-slate-800 text-[8px] text-white p-1 rounded border border-slate-700 z-50">
                        Base temperature maintained when tub is idle.
                      </div>
                    </div>
                    <div className="group relative">
                      <label className="text-[8px] text-slate-500 uppercase font-bold ml-1">Default Soak Duration</label>
                      <div className="flex items-center space-x-1">
                        <Clock size={12} className="text-slate-500" />
                        <input 
                          type="number"
                          defaultValue={settings?.default_soak_duration || 60} 
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) axios.post(`${API_BASE}/settings/`, { default_soak_duration: val });
                          }}
                          className="w-full bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800 focus:border-blue-500 transition font-bold text-slate-300"
                        />
                      </div>
                      <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-slate-800 text-[8px] text-white p-1 rounded border border-slate-700 z-50">
                        Default time for manual Quick Heat sessions.
                      </div>
                    </div>
                 </div>

                 <div className="group relative">
                   <label className="text-[8px] text-slate-500 uppercase font-bold ml-1">Safety High-Limit</label>
                   <div className="flex items-center space-x-1">
                     <ShieldCheck size={12} className="text-slate-500" />
                     <input 
                       type="number"
                       defaultValue={settings?.max_temp_limit || 110} 
                       onBlur={(e) => {
                         const val = parseFloat(e.target.value);
                         if (!isNaN(val)) {
                           if (val > 110 && !window.confirm("Safety Warning: Setting the high-limit above 110°F is dangerous and could lead to scalding or equipment damage. Are you sure?")) {
                             e.target.value = settings.max_temp_limit;
                             return;
                           }
                           axios.post(`${API_BASE}/settings/`, { max_temp_limit: val });
                         }
                       }}
                       className="w-full bg-slate-900 text-[10px] p-2 rounded outline-none border border-slate-800 focus:border-red-500 transition font-bold text-red-400"
                     />
                   </div>
                   <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-slate-800 text-[8px] text-white p-1 rounded border border-slate-700 z-50">
                     Hard safety limit for water temperature. Trigger emergency shutdown if exceeded.
                   </div>
                 </div>
               </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


function StatusIndicator({ label, active, color, isLarge, icon }) {
  if (isLarge) {
    return (
      <div className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 bg-slate-800 border-slate-700 ${active ? 'opacity-100 bg-glow-orange border-orange-500/30' : 'opacity-50'}`}>
        <div className="flex items-center">
          <div className={`p-2 rounded-lg transition-colors ${active ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-900 text-slate-600'}`}>
            {React.cloneElement(icon, { className: active ? 'animate-pulse' : '' })}
          </div>
          <span className="ml-4 font-bold text-slate-300">{label}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-orange-400' : 'text-slate-500'}`}>
            {active ? 'Active' : 'Standby'}
          </span>
          <div className={`w-3 h-3 rounded-full ${active ? 'bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'bg-slate-700'}`} />
        </div>
      </div>
    );
  }
  return (
    <div className={`p-3 rounded-xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center space-y-1 transition-all ${active ? 'opacity-100 border-blue-500/30 bg-glow-blue' : 'opacity-40'}`}>
      <div className={`w-2 h-2 rounded-full ${active ? color.replace('text', 'bg') : 'bg-slate-700'} ${active ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
    </div>
  );
}

function ControlToggle({ label, icon, active, onToggle, color, disabled, tooltip }) {
  const colors = {
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/50 bg-glow-orange",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/50 bg-glow-blue",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50 bg-glow-yellow",
    emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 bg-glow-emerald",
    gray: "bg-slate-800 text-slate-400 border-slate-700"
  };

  return (
    <div className="group relative">
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-[8px] text-white p-2 rounded border border-slate-700 w-32 z-50 text-center">
          {tooltip}
        </div>
      )}
      <button 
        onClick={() => !disabled && onToggle(!active)}
        disabled={disabled}
        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${active ? colors[color] : colors.gray}`}
      >
        <div className="flex items-center">
          <div className={`p-2 rounded-lg transition-all ${active ? 'bg-white/10' : 'bg-slate-900'} ${active && (color === 'blue' ) ? 'animate-wave' : ''} ${active && (color === 'emerald') ? 'animate-pulse' : ''} ${active && (color === 'yellow') ? 'animate-pulse' : ''}`}>
            {React.cloneElement(icon, { size: 20 })}
          </div>
          <span className="ml-4 font-bold">{label}</span>
        </div>
        <div className={`w-12 h-6 rounded-full relative transition-colors ${active ? 'bg-current opacity-80' : 'bg-slate-700'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${active ? 'right-1' : 'left-1'}`} />
        </div>
      </button>
    </div>
  );
}

export default App;