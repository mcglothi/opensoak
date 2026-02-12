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
  Umbrella,
  HelpCircle
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
  const [energyData, setEnergyData] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [weather, setWeather] = useState(null);
  const [tempInput, setTempInput] = useState("");
  const [isEditingTemp, setIsEditingTemp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugSubmitting, setBugSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [statusRes, settingsRes, historyRes, schedulesRes, logsRes, weatherRes, energyRes] = await Promise.all([
        axios.get(`${API_BASE}/status/`),
        axios.get(`${API_BASE}/settings/`),
        axios.get(`${API_BASE}/status/history?limit=${historyLimit}`),
        axios.get(`${API_BASE}/schedules/`),
        axios.get(`${API_BASE}/status/logs`),
        axios.get(`${API_BASE}/status/weather`),
        axios.get(`${API_BASE}/status/energy`)
      ]);
      
      setStatus(statusRes.data);
      if (!isEditingTemp) {
        setSettings(settingsRes.data);
        setTempInput(settingsRes.data?.set_point?.toString() || "");
      }
      setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
      setUsageLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      setWeather(weatherRes.data);
      setEnergyData(energyRes.data);
      
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

  useEffect(() => {
    if (status?.desired_state?.manual_soak_active && status?.desired_state?.manual_soak_expires) {
      const timer = setInterval(() => {
        const now = new Date();
        const expires = new Date(status.desired_state.manual_soak_expires);
        const diff = expires - now;
        
        if (diff <= 0) {
          setTimeLeft(null);
          clearInterval(timer);
        } else {
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
        }
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setTimeLeft(null);
    }
  }, [status]);

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

  const submitBugReport = async (e) => {
    e.preventDefault();
    setBugSubmitting(true);
    const formData = new FormData(e.target);
    try {
      const res = await axios.post(`${API_BASE}/support/report-bug`, {
        title: formData.get('title'),
        description: formData.get('description')
      });
      alert(`Bug reported successfully! Issue created at: ${res.data.issue_url}`);
      setShowBugReport(false);
    } catch (err) {
      console.error("Error reporting bug", err);
      alert(`Failed to report bug: ${err.response?.data?.detail || err.message}`);
    } finally {
      setBugSubmitting(false);
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
      
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 relative z-10 space-y-6 md:space-y-0">
        <div className="flex items-center group cursor-default">
          <div className="relative mr-4">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full group-hover:bg-emerald-500/30 transition-colors duration-700"></div>
            <div className="relative bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-center">
              <Droplets className="text-blue-400 w-8 h-8 absolute animate-pulse" />
              <Zap className="text-emerald-400 w-5 h-5 relative mt-1 ml-1" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter bg-gradient-to-br from-blue-400 via-white to-emerald-400 bg-clip-text text-transparent drop-shadow-sm">
              OpenSoak
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-1">
              <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] flex items-center">
                <ShieldCheck className={`w-3 h-3 mr-2 ${status?.safety_status === 'OK' ? 'text-emerald-500' : 'text-red-500 animate-pulse'}`} /> 
                System: {status?.safety_status}
              </p>
              {status?.safety_status !== 'OK' && role === 'admin' && (
                <button 
                  onClick={resetFaults}
                  className="text-[10px] font-black uppercase bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1 rounded-lg border border-red-500/50 transition-all active:scale-95"
                >
                  Clear Faults
                </button>
              )}
            </div>
          </div>
        </div>
        
                <div className="flex flex-wrap items-center gap-4 md:space-x-6">
        
                            {weather && !weather.error && weather.current && (
        
                              <div className="bg-slate-900 px-6 py-4 rounded-full border border-slate-800 flex items-center space-x-5 shadow-lg transition-transform hover:scale-105">
        
                                {React.cloneElement(getWeatherIcon(weather.current.weather_code, weather.current.is_day), { size: 40 })}
        
                                <div className="flex flex-col leading-tight">
        
                                  <span className="text-2xl md:text-3xl font-black text-white">{weather.current.temperature_2m?.toFixed(0) || "--"}°F</span>
        
                                  <span className="text-xs md:text-sm text-slate-500 uppercase font-black tracking-[0.1em]">{weather.city || "Unknown"}</span>
        
                                </div>
        
                              </div>
        
                            )}
        
                  
        
                            {/* Temporary Role Switcher */}
        
                            <select 
        
                              value={role} 
        
                              onChange={(e) => setRole(e.target.value)}
        
                              className="bg-slate-900 text-base md:text-lg text-slate-400 border border-slate-800 rounded-xl px-4 py-2 outline-none focus:border-blue-500 transition font-black"
        
                            >
        
                              <option value="viewer">Viewer Mode</option>
        
                              <option value="user">User Mode</option>
        
                              <option value="admin">Admin Mode</option>
        
                            </select>
        
                  
        
                            <div className="bg-slate-900 px-6 py-4 rounded-full border border-slate-800 flex items-center space-x-4 shadow-lg">
        
                              <Clock className="w-8 h-8 text-blue-400" />
        
                              <span className="text-xl md:text-2xl font-black text-slate-100">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        
                            </div>
        
                  
        
        
        
                  <button 
        
                    onClick={() => setShowBugReport(true)}
        
                    className="p-3 bg-slate-900 rounded-full border border-slate-800 text-slate-400 hover:text-white hover:border-blue-500 transition-all shadow-lg group relative"
        
                    title="Report a Bug"
        
                  >
        
                    <HelpCircle className="w-7 h-7" />
        
                    <div className="absolute top-full mt-2 right-0 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 w-24 z-50 text-center shadow-2xl">
        
                      Support
        
                    </div>
        
                  </button>
        
                </div>
        
              </header>
        
        

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Temp Card */}
        <div className={`lg:col-span-2 bg-slate-900 rounded-3xl p-6 md:p-8 border transition-all duration-500 shadow-xl relative overflow-hidden ${isHeaterOn ? 'border-orange-500/50 bg-glow-orange' : 'border-slate-800'}`}>
          <div className={`absolute top-0 right-0 p-4 md:p-8 opacity-10 transition-transform duration-[5000ms] ${isHeaterOn ? 'text-orange-500' : 'text-slate-700'}`}>
            <div className="relative">
               <Thermometer className="w-32 h-32 md:w-48 md:h-48" />
               {isHeaterOn && (
                 <div className="absolute inset-0 bg-orange-500 animate-fill" style={{ maskImage: 'url("/vite.svg")', maskRepeat: 'no-repeat', maskPosition: 'center' }}>
                   <Thermometer className="w-32 h-32 md:w-48 md:h-48" />
                 </div>
               )}
            </div>
          </div>
          
          <div className="relative z-10">
            <h2 className="text-slate-400 uppercase tracking-widest text-xs font-bold mb-4">Current Water Temperature</h2>
            <div className="flex flex-wrap items-baseline gap-4 md:gap-0">
              <span className={`text-6xl md:text-8xl font-black text-white transition-all ${isHeaterOn ? 'animate-float' : ''}`}>{currentTemp}</span>
              <span className="text-2xl md:text-4xl font-light text-slate-500 ml-2">°F</span>
              {timeLeft && (
                <div className="md:ml-8 flex flex-col items-center justify-center bg-slate-950/50 border border-blue-500/30 px-3 py-1.5 md:px-4 md:py-2 rounded-2xl animate-pulse">
                  <span className="text-[10px] md:text-xs font-black text-blue-400 uppercase tracking-tighter">Time Remaining</span>
                  <span className="text-xl md:text-3xl font-mono font-bold text-white">{timeLeft}</span>
                </div>
              )}
            </div>
            
            <div className="mt-10 flex flex-wrap items-center gap-6 md:gap-0 md:space-x-8">
              <div className="flex flex-col group relative">
                <span className="text-slate-500 text-sm uppercase font-black tracking-[0.2em]">Target Temp</span>
                <div className="absolute bottom-full left-0 mb-3 hidden group-hover:block bg-slate-800 text-sm text-white p-3 rounded-xl border border-slate-700 w-64 z-50 shadow-2xl">
                  Temperature the tub will maintain while in use.
                </div>
                <div className="flex items-center space-x-5 mt-1">
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
                      className="bg-slate-950 border border-slate-800 text-4xl font-black text-blue-400 w-32 px-3 py-2 rounded-2xl outline-none focus:border-blue-500 transition shadow-inner"
                    />
                  ) : (
                    <span className="text-4xl font-black text-blue-400">{settings?.set_point}°F</span>
                  )}
                  {role !== 'viewer' && (
                    <div className="flex space-x-2">
                      <button onClick={() => updateSetPoint(0.5)} title="Increase Target Temp" className="p-2 hover:bg-slate-800 rounded-xl transition scale-125"><ChevronUp /></button>
                      <button onClick={() => updateSetPoint(-0.5)} title="Decrease Target Temp" className="p-2 hover:bg-slate-800 rounded-xl transition scale-125"><ChevronDown /></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-14 w-px bg-slate-800 mx-6 hidden md:block"></div>
              <div className="flex flex-col group relative">
                <span className="text-slate-500 text-sm uppercase font-black tracking-[0.2em]">Rest Temp</span>
                <div className="absolute bottom-full left-0 mb-3 hidden group-hover:block bg-slate-800 text-sm text-white p-3 rounded-xl border border-slate-700 w-64 z-50 shadow-2xl">
                  Temperature the tub maintains when not in use.
                </div>
                <div className="flex items-center space-x-5 mt-1">
                  <span className="text-3xl font-black text-slate-400">{settings?.default_rest_temp}°F</span>
                  {role === 'admin' && (
                    <div className="flex space-x-2">
                      <button onClick={() => updateRestTemp(0.5)} title="Increase Rest Temp" className="p-2 hover:bg-slate-800 rounded-xl transition scale-110"><ChevronUp /></button>
                      <button onClick={() => updateRestTemp(-0.5)} title="Decrease Rest Temp" className="p-2 hover:bg-slate-800 rounded-xl transition scale-110"><ChevronDown /></button>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-14 w-px bg-slate-800 mx-6 hidden md:block"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-sm uppercase font-black tracking-[0.2em]">Status</span>
                <div className="flex items-center space-x-4 mt-1">
                  <span className={`text-2xl font-black ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>
                    {isHeaterOn ? 'Heating...' : 'Ready'}
                  </span>
                  {status?.desired_state?.manual_soak_active && (
                    <button 
                      onClick={cancelSoak} 
                      className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 rounded-2xl transition shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95"
                      title="End current session and return to rest temperature"
                    >
                      <Zap size={14} className="fill-current" />
                      <span>Stop Session</span>
                    </button>
                  )}
                </div>
                {status?.desired_state?.manual_soak_active && (
                   <span className="text-sm text-blue-400 font-black uppercase tracking-widest animate-pulse mt-2">Manual Soak Active</span>
                )}
                {status?.desired_state?.jet_pump && !status?.desired_state?.manual_soak_active && <span className="text-sm text-blue-400 font-black uppercase tracking-widest mt-2 animate-pulse">Jets Active</span>}
              </div>
            </div>
                )}
                {status?.desired_state?.jet_pump && !status?.desired_state?.manual_soak_active && <span className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1 animate-pulse">Jets Active</span>}
              </div>
            </div>

            {/* Quick Soak Controls */}
            {role !== 'viewer' && !status?.desired_state?.manual_soak_active && (
              <div className="mt-8 p-6 bg-slate-950/50 rounded-3xl border border-slate-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between group relative gap-6">
                <div className="absolute -top-8 left-0 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                  Start an immediate heating session.
                </div>
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-2xl bg-orange-500/10 ${isHeaterOn ? 'animate-pulse' : ''}`}>
                    <Zap className="text-orange-400 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter">Soak Now!</h3>
                    <p className="text-xs text-slate-500 font-medium">Temporary target override</p>
                  </div>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  startSoak(formData.get('temp'), formData.get('duration'));
                }} className="flex items-center space-x-4 w-full sm:w-auto">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-black ml-1">Temp</span>
                    <input name="temp" type="number" step="0.5" defaultValue={settings?.default_soak_temp || 104} className="w-16 bg-slate-900 border border-slate-800 rounded-xl text-sm p-2 text-orange-400 font-black outline-none focus:border-orange-500 transition shadow-inner" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-black ml-1">Min</span>
                    <input name="duration" type="number" defaultValue={settings?.default_soak_duration || 60} className="w-16 bg-slate-900 border border-slate-800 rounded-xl text-sm p-2 text-slate-300 font-black outline-none focus:border-slate-700 transition shadow-inner" />
                  </div>
                  <button type="submit" className="flex-1 sm:flex-none h-12 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase px-8 rounded-2xl transition-all shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95">
                    Start Soak!
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
              <h3 className="text-slate-500 text-base font-black uppercase mb-8 tracking-widest">7-Day Forecast</h3>
              <div className="flex lg:grid lg:grid-cols-7 gap-5 overflow-x-auto lg:overflow-visible pb-6 lg:pb-0 custom-scrollbar">
                {weather.daily.time.slice(0, 7).map((date, idx) => (
                  <div key={date} className="flex-shrink-0 w-32 lg:w-auto flex flex-col items-center p-5 rounded-[2rem] bg-slate-950 border border-slate-800/50 shadow-xl transition-all hover:scale-105 hover:border-blue-500/30 hover:bg-slate-900">
                    <span className="text-sm text-slate-400 uppercase font-black mb-5 tracking-tighter">
                      {new Date(date + "T00:00:00").toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <div className="mb-5 text-blue-400">
                      {React.cloneElement(getWeatherIcon(weather.daily.weather_code[idx]), { size: 48 })}
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-black text-white">{weather.daily.temperature_2m_max[idx].toFixed(0)}°</span>
                      <span className="text-sm text-slate-500 font-bold">{weather.daily.temperature_2m_min[idx].toFixed(0)}°</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hourly Forecast */}
          {weather && weather.hourly && (
            <div className="mt-8 pt-8 border-t border-slate-800">
              <h3 className="text-slate-500 text-base font-black uppercase mb-8 tracking-widest">Hourly Forecast (Next 12h)</h3>
              <div className="flex space-x-5 overflow-x-auto pb-6 custom-scrollbar">
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
                      <div key={time} className="flex-shrink-0 flex flex-col items-center p-5 w-32 rounded-[2rem] bg-slate-950/50 border border-slate-800/50 hover:bg-slate-800/20 transition-colors shadow-xl">
                        <span className="text-sm text-slate-500 font-black mb-4">{displayTime}</span>
                        <span className="text-2xl font-black text-white mb-3">{temp?.toFixed(0)}°</span>
                        
                        <div className="flex items-center text-sm text-blue-400 mb-3 font-black">
                          <Umbrella size={18} className="mr-1.5" />
                          {rainProb}%
                        </div>
                        
                        <div className="flex flex-col items-center text-xs text-slate-500 font-bold">
                          <div className="flex items-center space-x-2 mb-1.5">
                            <Wind size={16} />
                            <span>{windSpeed?.toFixed(0)} mph</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Navigation size={14} style={{ transform: `rotate(${windDir}deg)` }} className="text-slate-400" />
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
                  color="orange" 
                  isLarge={true}
                  icon={<Zap size={20} />}
                />
                <ControlToggle 
                  label="Jets" 
                  icon={<Wind />} 
                  active={status?.actual_relay_state?.jet_pump} 
                  loading={status?.desired_state?.jet_pump !== status?.actual_relay_state?.jet_pump}
                  onToggle={(v) => toggleControl('jet_pump', v)}
                  color="blue"
                  tooltip="Toggle high-power jet pump for hydrotherapy."
                />
                <ControlToggle 
                  label="Light" 
                  icon={<Lightbulb />} 
                  active={status?.actual_relay_state?.light} 
                  loading={status?.desired_state?.light !== status?.actual_relay_state?.light}
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
                          active={status?.actual_relay_state?.circ_pump} 
                          loading={status?.desired_state?.circ_pump !== status?.actual_relay_state?.circ_pump}
                          disabled={!status?.system_locked} // Always ON unless system is locked/shutdown
                          onToggle={(v) => toggleControl('circ_pump', v)}
                          color="emerald"
                          tooltip="Continuous water circulation. Only disabled during maintenance or shutdown."
                        />
                        <ControlToggle 
                          label="Ozone" 
                          icon={<Zap />} 
                          active={status?.actual_relay_state?.ozone} 
                          loading={status?.desired_state?.ozone !== status?.actual_relay_state?.ozone}
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
              <div className="space-y-4">
                <StatusIndicator 
                  label="Heater" 
                  active={status?.actual_relay_state?.heater} 
                  color="orange" 
                  isLarge={true}
                  icon={<Zap size={20} />}
                />
                <StatusIndicator 
                  label="Jets" 
                  active={status?.actual_relay_state?.jet_pump} 
                  color="blue" 
                  isLarge={true}
                  icon={<Wind size={20} />}
                />
                <StatusIndicator 
                  label="Light" 
                  active={status?.actual_relay_state?.light} 
                  color="yellow" 
                  isLarge={true}
                  icon={<Lightbulb size={20} />}
                />
              </div>
            </>
          )}

          {/* Energy Dashboard */}
          <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800 bg-glow-blue/5">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center">
                 <Zap size={12} className="mr-1 text-orange-400" /> Operating Costs
               </h3>
               <span className="text-[8px] text-slate-600 font-bold uppercase">Live Estimates</span>
             </div>
             
             {energyData ? (
               <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-900/50 p-4 rounded-[1.5rem] border border-slate-800">
                     <span className="text-xs text-slate-500 uppercase block font-black mb-1">Today</span>
                     <span className="text-3xl font-black text-emerald-400">${Object.values(energyData.today).reduce((a, b) => a + b.cost, 0).toFixed(2)}</span>
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-[1.5rem] border border-slate-800">
                     <span className="text-xs text-slate-500 uppercase block font-black mb-1">This Month</span>
                     <span className="text-3xl font-black text-blue-400">${Object.values(energyData.month).reduce((a, b) => a + b.cost, 0).toFixed(2)}</span>
                   </div>
                 </div>
                 
                 {role === 'admin' && (
                   <div className="space-y-3 pt-4 border-t border-slate-900">
                     {Object.entries(energyData.today).map(([component, stats]) => (
                       <div key={component} className="flex justify-between items-center text-sm">
                         <span className="text-slate-400 capitalize font-bold">{component.replace('_', ' ')}</span>
                         <div className="flex items-center space-x-4">
                           <span className="text-slate-600 font-bold">{(stats.runtime / 3600).toFixed(1)}h</span>
                           <span className="text-slate-300 font-black">${stats.cost.toFixed(2)}</span>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             ) : (
               <p className="text-[10px] text-slate-600 italic">Calculating usage...</p>
             )}
          </div>

          <div className="mt-8 p-6 bg-slate-950 rounded-3xl border border-slate-800">
             <h3 className="text-base font-black text-slate-500 uppercase mb-6 tracking-widest">Recent Activity</h3>
             <div className="space-y-4 max-h-80 overflow-y-auto pr-3 custom-scrollbar">
               {usageLogs.length === 0 ? (
                 <p className="text-sm text-slate-600 italic">No recent activity</p>
               ) : (
                 usageLogs.map(l => (
                   <div key={l.id} className="text-sm border-l-4 border-blue-500/30 pl-4 py-2 hover:bg-slate-900/50 transition-colors">
                     <p className="text-slate-100 font-black text-base">{l.event}</p>
                     <p className="text-slate-400 font-bold truncate">{l.details}</p>
                     <p className="text-xs text-slate-600 italic mt-1.5 font-black">{new Date(l.timestamp).toLocaleString([], {month: 'short', day:'numeric', hour: '2-digit', minute:'2-digit'})}</p>
                   </div>
                 ))
               )}
             </div>
          </div>

          <div className="mt-8 p-6 bg-slate-950 rounded-3xl border border-slate-800">
             <h3 className="text-base font-black text-slate-500 uppercase mb-6 tracking-widest">Current Schedules</h3>
             {schedules.length === 0 ? (
               <p className="text-sm text-slate-600 italic">No schedules active</p>
             ) : (
               <div className="space-y-4 mb-8">
                 {schedules.map(s => (
                   <div key={s.id} className="group flex justify-between items-center text-sm">
                     <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="text-slate-100 font-black text-base">{s.name}</span>
                          <span className="text-slate-500 ml-2 font-black text-xs">({s.type})</span>
                        </div>
                        <span className="text-slate-400 font-black mt-1 text-xs">{s.start_time} - {s.end_time}</span>
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
            <div className="mt-8 p-6 bg-slate-950 rounded-3xl border border-slate-800 shadow-xl">
               <h3 className="text-sm font-black text-slate-500 uppercase mb-6 flex items-center tracking-widest">
                 <SettingsIcon size={16} className="mr-2" /> System Settings
               </h3>
               <div className="space-y-6">
                 <div className="group relative">
                   <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest">Weather Location</label>
                   <div className="flex items-center space-x-3 mt-1">
                     <MapPin size={16} className="text-slate-500" />
                     <input 
                       defaultValue={settings?.location || ''} 
                       onBlur={(e) => updateLocation(e.target.value)}
                       placeholder="Zip / City" 
                       className="flex-1 bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition shadow-inner font-bold text-white"
                     />
                   </div>
                   <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                     Used to fetch local weather & forecast.
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="group relative">
                      <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest">Rest Temperature</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <Thermometer size={16} className="text-slate-500" />
                        <input 
                          type="number"
                          step="0.5"
                          key={`rest-input-${settings?.default_rest_temp}`}
                          defaultValue={settings?.default_rest_temp}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) updateRestTemp(val - settings.default_rest_temp);
                          }}
                          className="w-full bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition font-black text-slate-100 shadow-inner"
                        />
                      </div>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                        Base temperature maintained when tub is idle.
                      </div>
                    </div>
                    <div className="group relative">
                      <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest">Default Soak Duration</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <Clock size={16} className="text-slate-500" />
                        <input 
                          type="number"
                          defaultValue={settings?.default_soak_duration || 60} 
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) axios.post(`${API_BASE}/settings/`, { default_soak_duration: val });
                          }}
                          className="w-full bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition font-black text-slate-100 shadow-inner"
                        />
                      </div>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                        Default time for manual Quick Heat sessions.
                      </div>
                    </div>
                    <div className="group relative">
                      <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest">Default Soak Temp</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <Thermometer size={16} className="text-slate-500" />
                        <input 
                          type="number"
                          step="0.5"
                          defaultValue={settings?.default_soak_temp || 104} 
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) axios.post(`${API_BASE}/settings/`, { default_soak_temp: val });
                          }}
                          className="w-full bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition font-black text-slate-100 shadow-inner"
                        />
                      </div>
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                        Initial temperature for new soak sessions.
                      </div>
                    </div>
                    <div className="group relative">
                      <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest font-black">Safety High-Limit</label>
                      <div className="flex items-center space-x-2 mt-1">
                        <ShieldCheck size={16} className="text-slate-500" />
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
                          className="w-full bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-red-500 transition font-black text-red-400 shadow-inner"
                        />
                      </div>
                      <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl">
                        Hard safety limit for water temperature. Trigger emergency shutdown if exceeded.
                      </div>
                    </div>
                 </div>

                 <div className="pt-6 border-t border-slate-900">
                    <h4 className="text-xs font-black text-slate-500 uppercase mb-4 tracking-widest">Energy & Power Settings</h4>
                    <div className="space-y-4">
                      <div className="group relative">
                        <label className="text-xs text-slate-500 uppercase font-black ml-1 tracking-widest">Electric Cost ($/kWh)</label>
                        <input 
                          type="number"
                          step="0.01"
                          defaultValue={settings?.kwh_cost} 
                          onBlur={(e) => axios.post(`${API_BASE}/settings/`, { kwh_cost: parseFloat(e.target.value) })}
                          className="w-full bg-slate-900 text-sm p-3 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition shadow-inner font-bold text-white"
                        />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 z-50 shadow-2xl w-48">
                          Your local electricity rate per kilowatt-hour. Used for cost estimation.
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                          { label: "Heater Watts", key: "heater_watts", tip: "Power draw of the main heating element (usually 5500W)." },
                          { label: "Circ Pump Watts", key: "circ_pump_watts", tip: "Power draw of the low-speed circulation pump." },
                          { label: "Jet Pump Watts", key: "jet_pump_watts", tip: "Power draw of the high-speed therapy pump." },
                          { label: "Light Watts", key: "light_watts", tip: "Power draw of the underwater lighting." },
                          { label: "Ozone Watts", key: "ozone_watts", tip: "Power draw of the ozone purification system." }
                        ].map(p => (
                          <div key={p.key} className="group relative">
                            <label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-tighter">{p.label}</label>
                            <input 
                              type="number"
                              defaultValue={settings?.[p.key]} 
                              onBlur={(e) => axios.post(`${API_BASE}/settings/`, { [p.key]: parseFloat(e.target.value) })}
                              className="w-full bg-slate-900 text-xs p-2 rounded-xl outline-none border border-slate-800 focus:border-blue-500 transition shadow-inner font-bold text-white"
                            />
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-[10px] text-white p-2 rounded border border-slate-700 z-50 shadow-2xl w-40">
                              {p.tip}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                 </div>
               </div>
            </div>
          )}
        </div>

      </div>

      {/* Bug Report Modal */}
      {showBugReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-float">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center">
                <HelpCircle className="mr-2 text-blue-400" /> Report a Problem
              </h2>
              <button onClick={() => setShowBugReport(false)} className="text-slate-500 hover:text-white transition">✕</button>
            </div>
            
            <form onSubmit={submitBugReport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Title</label>
                <input 
                  name="title" 
                  required 
                  placeholder="What is the problem?"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Description</label>
                <textarea 
                  name="description" 
                  required 
                  rows="4"
                  placeholder="Please describe what happened..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-blue-500 transition resize-none"
                />
              </div>
              
              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={bugSubmitting}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg ${bugSubmitting ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'}`}
                >
                  {bugSubmitting ? 'Submitting...' : 'Submit to GitHub'}
                </button>
                <p className="text-[10px] text-slate-600 text-center mt-4">
                  This will create a public issue on the OpenSoak repository.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function StatusIndicator({ label, active, color, isLarge, icon }) {
  const colorMaps = {
    orange: {
      text: "text-orange-400",
      bg: "bg-orange-500/20",
      border: "border-orange-500/30",
      glow: "bg-glow-orange",
      dot: "bg-orange-500",
      shadow: "shadow-[0_0_8px_rgba(249,115,22,0.5)]"
    },
    blue: {
      text: "text-blue-400",
      bg: "bg-blue-500/20",
      border: "border-blue-500/30",
      glow: "bg-glow-blue",
      dot: "bg-blue-500",
      shadow: "shadow-[0_0_8px_rgba(59,130,246,0.5)]"
    },
    yellow: {
      text: "text-yellow-400",
      bg: "bg-yellow-500/20",
      border: "border-yellow-500/30",
      glow: "bg-glow-yellow",
      dot: "bg-yellow-500",
      shadow: "shadow-[0_0_8px_rgba(234,179,8,0.5)]"
    },
    emerald: {
      text: "text-emerald-400",
      bg: "bg-emerald-500/20",
      border: "border-emerald-500/30",
      glow: "bg-glow-emerald",
      dot: "bg-emerald-500",
      shadow: "shadow-[0_0_8px_rgba(16,185,129,0.5)]"
    }
  };

  const c = colorMaps[color] || colorMaps.orange;

  if (isLarge) {
    return (
      <div className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 bg-slate-800 border-slate-700 ${active ? `opacity-100 ${c.glow} ${c.border}` : 'opacity-50'}`}>
        <div className="flex items-center">
          <div className={`p-2 rounded-lg transition-colors ${active ? `${c.bg} ${c.text}` : 'bg-slate-900 text-slate-600'}`}>
            {React.cloneElement(icon, { className: active ? 'animate-pulse' : '' })}
          </div>
          <span className="ml-4 font-bold text-slate-300">{label}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-[10px] font-black uppercase tracking-widest ${active ? c.text : 'text-slate-500'}`}>
            {active ? 'Active' : 'Standby'}
          </span>
          <div className={`w-3 h-3 rounded-full ${active ? `${c.dot} animate-pulse ${c.shadow}` : 'bg-slate-700'}`} />
        </div>
      </div>
    );
  }
  return (
    <div className={`p-3 rounded-xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center space-y-1 transition-all ${active ? `opacity-100 ${c.border} ${c.glow}` : 'opacity-40'}`}>
      <div className={`w-2 h-2 rounded-full ${active ? c.dot : 'bg-slate-700'} ${active ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
    </div>
  );
}

function ControlToggle({ label, icon, active, onToggle, color, disabled, tooltip, loading }) {
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 w-32 z-50 text-center shadow-2xl">
          {tooltip}
        </div>
      )}
      <button 
        onClick={() => !disabled && onToggle(!active)}
        disabled={disabled || loading}
        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${active ? colors[color] : colors.gray} ${loading ? 'animate-pulse-subtle brightness-110' : ''}`}
      >
        <div className="flex items-center">
          <div className={`p-2 rounded-lg transition-all ${active ? 'bg-white/10' : 'bg-slate-900'} ${active && (color === 'blue' ) ? 'animate-wave' : ''} ${active && (color === 'emerald') ? 'animate-pulse' : ''} ${active && (color === 'yellow') ? 'animate-pulse' : ''}`}>
            {React.cloneElement(icon, { size: 20 })}
          </div>
          <div className="flex flex-col items-start ml-4 text-left">
            <span className="font-bold">{label}</span>
            {loading && <span className="text-[10px] font-black uppercase tracking-tighter text-blue-400 animate-pulse">Syncing...</span>}
          </div>
        </div>
        <div className={`w-12 h-6 rounded-full relative transition-colors ${active ? 'bg-current opacity-80' : 'bg-slate-700'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${active ? 'right-1' : 'left-1'} ${loading ? 'opacity-50 scale-75' : ''}`} />
        </div>
      </button>
    </div>
  );
}

export default App;