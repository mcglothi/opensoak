import React, { useState, useEffect, useRef } from 'react';
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
  Play,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Moon,
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

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;
const ADMIN_KEY_FRONTEND_PLACEHOLDER = "supersecretadminkey";

// Defensive localStorage
const safeStorage = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
  setItem: (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} }
};

function App() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [historyLimit, setHistoryLimit] = useState(60);
  const [usageLogs, setUsageLogs] = useState([]);
  const [energyData, setEnergyData] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [weather, setWeather] = useState(null);
  const [tempInput, setTempInput] = useState("");
  const [isEditingTemp, setIsEditingTemp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [systemLogs, setSystemLogs] = useState("");
  const [weatherWarning, setWeatherWarning] = useState(null);
  const [showKioskControls, setShowKioskControls] = useState(false);
  const [lastValidTemp, setLastValidTemp] = useState("--");

  // Refs
  const statusRef = useRef(null);
  const flyoutRef = useRef(null);
  const lastTimerAdjRef = useRef(0);
  const optimisticExpiryRef = useRef(null);
  const lastTempAdjRef = useRef(0);
  const optimisticTempRef = useRef(null);
  const lastControlAdjRef = useRef({});
  const optimisticControlsRef = useRef({});

  // Initialize Role
  const [role, setRole] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      if (urlRole && ['viewer', 'user', 'admin'].includes(urlRole)) return urlRole;
      return safeStorage.getItem('opensoak_role') || 'user';
    } catch (e) { return 'user'; }
  });

  // Role Persistence
  useEffect(() => {
    safeStorage.setItem('opensoak_role', role);
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('role')) {
        const url = new URL(window.location);
        url.searchParams.delete('role');
        window.history.replaceState({}, '', url);
      }
    } catch (e) {}
  }, [role]);

  // Click-outside for Kiosk Flyout
  useEffect(() => {
    if (!showKioskControls) return;
    const handleGlobalClick = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) {
        setShowKioskControls(false);
      }
    };
    // Use 'click' for better compatibility across TV browsers
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [showKioskControls]);

  // Temp sync
  useEffect(() => {
    if (status && status.current_temp > 0) {
      setLastValidTemp(status.current_temp.toFixed(1));
    }
  }, [status]);

  const getAuthHeaders = () => role === 'admin' ? { 'X-Admin-Key': ADMIN_KEY_FRONTEND_PLACEHOLDER } : {};

  const fetchData = async () => {
    try {
      const [statusRes, settingsRes, historyRes, schedulesRes, logsRes, weatherRes, energyRes] = await Promise.all([
        axios.get(`${API_BASE}/status/`).catch(e => ({ data: null })),
        axios.get(`${API_BASE}/settings/`).catch(e => ({ data: null })),
        axios.get(`${API_BASE}/status/history?limit=${historyLimit}`).catch(e => ({ data: [] })),
        axios.get(`${API_BASE}/schedules/`).catch(e => ({ data: [] })),
        axios.get(`${API_BASE}/status/logs`).catch(e => ({ data: [] })),
        axios.get(`${API_BASE}/status/weather`).catch(e => ({ data: null })),
        axios.get(`${API_BASE}/status/energy`).catch(e => ({ data: null }))
      ]);
      
      const newStatus = statusRes.data;
      const newSettings = settingsRes.data;

      if (!newStatus) {
        setError("Waiting for backend status... (Verify port 8000 is running)");
        return;
      }

      if (Date.now() - lastTimerAdjRef.current < 4000 && optimisticExpiryRef.current) {
        if (newStatus.desired_state) newStatus.desired_state.manual_soak_expires = optimisticExpiryRef.current;
      }
      if (Date.now() - lastTempAdjRef.current < 4000 && optimisticTempRef.current !== null) {
        if (newSettings) newSettings.set_point = optimisticTempRef.current;
      }
      
      Object.keys(lastControlAdjRef.current).forEach(key => {
        if (Date.now() - lastControlAdjRef.current[key] < 4000) {
          const optVal = optimisticControlsRef.current[key];
          if (optVal !== undefined) {
            newStatus.actual_relay_state[key] = optVal;
            if (newStatus.desired_state) newStatus.desired_state[key] = optVal;
          }
        }
      });

      setStatus(newStatus);
      statusRef.current = newStatus;
      if (!isEditingTemp && newSettings) {
        setSettings(newSettings);
        setTempInput(newSettings.set_point?.toString() || "");
      }
      
      if (Array.isArray(schedulesRes.data)) setSchedules(schedulesRes.data);
      if (Array.isArray(logsRes.data)) setUsageLogs(logsRes.data);
      if (weatherRes.data && !weatherRes.data.error) setWeather(weatherRes.data);
      if (energyRes.data && !energyRes.data.error) setEnergyData(energyRes.data);

      if (role === 'admin') {
        const sysLogsRes = await axios.get(`${API_BASE}/support/logs`, { headers: getAuthHeaders() }).catch(e => ({ data: {} }));
        if (sysLogsRes.data && sysLogsRes.data.logs) setSystemLogs(sysLogsRes.data.logs);
      }
      
      if (Array.isArray(historyRes.data)) {
        setHistory(historyRes.data.map(h => {
          const timestamp = h.timestamp && !h.timestamp.endsWith('Z') ? `${h.timestamp}Z` : h.timestamp;
          return {
            ...h,
            time: timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "--:--"
          };
        }).reverse());
      }
      
      setError(null);
      setLoading(false);

      // Weather Warning
      if (weatherRes.data && weatherRes.data.hourly && schedulesRes.data && schedulesRes.data.length > 0) {
        const warnings = [];
        const now = new Date();
        const activeSchedules = schedulesRes.data.filter(s => s.active);
        activeSchedules.forEach(sched => {
          if (!sched.start_time || !sched.days_of_week) return;
          const [startH] = sched.start_time.split(':').map(Number);
          const schedDays = String(sched.days_of_week).split(',').map(Number);
          for (let i = 0; i < 24; i++) {
            const fTime = new Date(weatherRes.data.hourly.time[i]);
            if (fTime < now) continue;
            const fHour = fTime.getHours();
            const fDay = (fTime.getDay() + 6) % 7;
            if (schedDays.includes(fDay) && fHour === startH) {
              const rain = weatherRes.data.hourly.precipitation_probability?.[i];
              if (rain > 40) { warnings.push({ type: 'precip', time: fTime, name: sched.name }); break; }
            }
          }
        });
        if (warnings.length > 0) {
          setWeatherWarning(`Notice: Rain/Snow forecast during "${warnings[0].name}" at ${warnings[0].time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: true})}.`);
        } else { setWeatherWarning(null); }
      }
    } catch (err) {
      console.error(err);
      setError(`Connection Error: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [historyLimit, isEditingTemp, role]);

  useEffect(() => {
    const hasManual = status?.desired_state?.manual_soak_active && status?.desired_state?.manual_soak_expires;
    const hasScheduled = status?.desired_state?.scheduled_session_active && status?.desired_state?.scheduled_session_expires;

    if (hasManual || hasScheduled) {
      const calculate = () => {
        const now = new Date();
        const expiryStr = hasManual ? status.desired_state.manual_soak_expires : status.desired_state.scheduled_session_expires;
        const expires = new Date(expiryStr);
        const diff = expires.getTime() - now.getTime();
        
        if (diff <= 0) { setTimeLeft(null); return false; }
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        
        let timeStr = "";
        if (hrs > 0) timeStr += `${hrs}:`;
        timeStr += `${mins < 10 && hrs > 0 ? '0' : ''}${mins}:`;
        timeStr += `${secs < 10 ? '0' : ''}${secs}`;
        
        setTimeLeft(timeStr);
        return true;
      };
      calculate();
      const timer = setInterval(calculate, 1000);
      return () => clearInterval(timer);
    } else { setTimeLeft(null); }
  }, [status]);

  const toggleControl = async (key, val) => {
    if (role === 'viewer') return;
    lastControlAdjRef.current[key] = Date.now();
    optimisticControlsRef.current[key] = val;
    setStatus(prev => {
      if (!prev) return prev;
      const next = { ...prev, actual_relay_state: { ...prev.actual_relay_state, [key]: val }, desired_state: { ...prev.desired_state, [key]: val } };
      statusRef.current = next;
      return next;
    });
    try {
      await axios.post(`${API_BASE}/control/`, { [key]: val }, { headers: getAuthHeaders() });
    } catch (e) { delete optimisticControlsRef.current[key]; fetchData(); }
  };

  const updateSetPoint = async (delta) => {
    if (role === 'viewer' || !settings) return;
    lastTempAdjRef.current = Date.now();
    const newTemp = Math.round((settings.set_point + delta) * 2) / 2;
    optimisticTempRef.current = newTemp;
    setSettings(prev => ({ ...prev, set_point: newTemp }));
    setTempInput(newTemp.toString());
    try {
      await axios.post(`${API_BASE}/settings/`, { set_point: newTemp }, { headers: getAuthHeaders() });
    } catch (e) { lastTempAdjRef.current = 0; fetchData(); }
  };

  const adjustTimer = async (minutes) => {
    if (!status || !status.desired_state) return;
    lastTimerAdjRef.current = Date.now();
    setStatus(prev => {
      if (!prev || !prev.desired_state || !prev.desired_state.manual_soak_expires) return prev;
      const newExpiry = new Date(new Date(prev.desired_state.manual_soak_expires).getTime() + (minutes * 60000)).toISOString();
      optimisticExpiryRef.current = newExpiry;
      return { ...prev, desired_state: { ...prev.desired_state, manual_soak_expires: newExpiry }};
    });
    try {
      await axios.post(`${API_BASE}/control/adjust-soak-timer`, { minutes }, { headers: getAuthHeaders() });
    } catch (e) { lastTimerAdjRef.current = 0; fetchData(); }
  };

  const startSoak = async (temp, duration) => {
    try {
      await axios.post(`${API_BASE}/control/start-soak`, { target_temp: parseFloat(temp), duration_minutes: parseInt(duration) }, { headers: getAuthHeaders() });
      fetchData();
    } catch (err) { alert(err.message); }
  };

  const cancelSoak = async () => {
    try {
      await axios.post(`${API_BASE}/control/cancel-soak`, {}, { headers: getAuthHeaders() });
      fetchData();
    } catch (err) { alert(err.message); }
  };

  const cancelScheduledSession = async () => {
    try {
      await axios.post(`${API_BASE}/control/cancel-scheduled-session`, {}, { headers: getAuthHeaders() });
      fetchData();
    } catch (err) { alert(err.message); }
  };

  const triggerSchedule = async (id) => {
    try {
      await axios.post(`${API_BASE}/control/trigger-schedule/${id}`, {}, { headers: getAuthHeaders() });
      fetchData();
    } catch (err) { alert(err.message); }
  };

  const masterShutdown = async () => {
    if (!window.confirm("Master Shutdown?")) return;
    try { await axios.post(`${API_BASE}/control/master-shutdown`, {}, { headers: getAuthHeaders() }); fetchData(); } catch (err) { alert(err.message); }
  };

  const updateLocation = async (loc) => {
    try { await axios.post(`${API_BASE}/settings/`, { location: loc }, { headers: getAuthHeaders() }); fetchData(); } catch (err) { alert(err.message); }
  };

  const updateRestTemp = async (delta) => {
    if (!settings) return;
    const newTemp = Math.round((settings.default_rest_temp + delta) * 2) / 2;
    setSettings(prev => ({ ...prev, default_rest_temp: newTemp }));
    try { await axios.post(`${API_BASE}/settings/`, { default_rest_temp: newTemp }, { headers: getAuthHeaders() }); } catch (e) { fetchData(); }
  };

  const createSchedule = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { 
      name: fd.get('name'), 
      type: fd.get('type'), 
      start_time: fd.get('start'), 
      end_time: fd.get('end'), 
      target_temp: fd.get('temp') ? parseFloat(fd.get('temp')) : null, 
      light_on: fd.get('light_on') === 'on',
      jet_on: fd.get('jet_on') === 'on',
      ozone_on: fd.get('ozone_on') === 'on',
      days_of_week: selectedDays.join(','), 
      active: true 
    };
    try {
      if (editingSchedule) await axios.put(`${API_BASE}/schedules/${editingSchedule.id}`, data, { headers: getAuthHeaders() });
      else await axios.post(`${API_BASE}/schedules/`, data, { headers: getAuthHeaders() });
      setEditingSchedule(null); e.target.reset(); fetchData();
    } catch (err) { alert(err.message); }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm("Delete?")) return;
    try { await axios.delete(`${API_BASE}/schedules/${id}`, { headers: getAuthHeaders() }); fetchData(); } catch (err) { alert(err.message); }
  };

  const toggleDay = (day) => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());

  const getWeatherIcon = (code, isDay = true) => {
    if (code === 0) return isDay ? <Sun className="text-yellow-400" /> : <Moon className="text-slate-400" />;
    if (code <= 3) return <Cloud className="text-slate-400" />;
    if (code <= 67) return <CloudRain className="text-blue-400" />;
    if (code <= 77) return <Snowflake className="text-blue-200" />;
    if (code <= 99) return <CloudLightning className="text-yellow-600" />;
    return <Cloud />;
  };

  const getWeatherLink = () => `https://weather.com/weather/today/l/${settings?.location || '90210'}`;

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      return `${hour}:${m < 10 ? '0' : ''}${m} ${ampm}`;
    } catch (e) { return timeStr; }
  };

  // Calculate Next Scheduled Run
  const getNextRun = () => {
    if (!Array.isArray(schedules) || schedules.length === 0) return null;
    const now = new Date();
    const currentDay = (now.getDay() + 6) % 7; 
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let next = null;
    let minDiff = Infinity;

    schedules.forEach(s => {
      if (!s.active || !s.start_time || !s.days_of_week || s.type !== 'soak') return;
      try {
        const [h, m] = s.start_time.split(':').map(Number);
        const sDays = String(s.days_of_week).split(',').map(Number);
        const sTime = h * 60 + m;

        sDays.forEach(day => {
          let dayDiff = day - currentDay;
          if (dayDiff < 0 || (dayDiff === 0 && sTime <= currentTime)) dayDiff += 7;
          const totalDiff = dayDiff * 1440 + (sTime - currentTime);
          if (totalDiff < minDiff) {
            minDiff = totalDiff;
            next = { ...s, dayDiff };
          }
        });
      } catch (e) {}
    });

    if (!next) return null;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const targetDay = next.dayDiff === 0 ? 'Today' : next.dayDiff === 1 ? 'Tomorrow' : days[(currentDay + next.dayDiff) % 7];
    return `${next.name} (${targetDay} @ ${formatTime(next.start_time)})`;
  };

  if (loading && !error) return <div className="flex items-center justify-center h-screen bg-slate-950 text-white"><Zap className="animate-pulse mr-2" /> Loading OpenSoak...</div>;
  if (error) return <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white p-4 text-center"><Zap className="text-red-500 mb-4 w-12 h-12" /><h1 className="text-xl font-bold mb-2">Error</h1><p className="text-slate-400 mb-6">{error}</p><button onClick={() => { setError(null); setLoading(true); fetchData(); }} className="bg-blue-600 px-6 py-2 rounded-full font-bold">Retry</button></div>;

  const currentTemp = lastValidTemp;
  const isHeaterOn = status && status.actual_relay_state && status.actual_relay_state.heater;
  const nextRunText = getNextRun();

  if (role === 'viewer') {
    return (
      <div className="h-screen w-screen p-6 md:p-12 text-slate-100 font-sans relative overflow-hidden flex flex-col">
        <WaterBackground active={isHeaterOn} />
        <header className="flex justify-between items-start relative z-20 mb-auto">
          <div className="flex flex-col">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-br from-blue-400 via-white to-emerald-400 bg-clip-text text-transparent leading-none">OpenSoak</h1>
            <div className={`mt-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border w-fit ${status && status.safety_status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'}`}>SYSTEM: {status ? status.safety_status : 'UNKNOWN'}</div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-3xl md:text-5xl font-black tabular-nums">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}</span>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'})}</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center relative z-20 text-center">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline relative">
              <span className={`text-[12rem] md:text-[20rem] font-black tracking-tighter leading-none tabular-nums ${isHeaterOn ? 'animate-float bg-gradient-to-br from-white to-orange-200 bg-clip-text text-transparent drop-shadow-[0_0_50px_rgba(249,115,22,0.3)]' : 'text-white'}`}>{currentTemp}</span>
              <span className="text-5xl md:text-8xl font-black text-white/10 ml-4">°F</span>
            </div>
            <div className="flex items-center gap-12 mt-4">
              <div className="flex flex-col"><span className="text-slate-500 text-xs font-black uppercase tracking-[0.3em]">Status</span><span className={`text-3xl font-black ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>{isHeaterOn ? 'HEATING' : 'READY'}</span></div>
              {nextRunText && (
                <div className="flex items-center gap-12">
                  <div className="h-12 w-px bg-white/10"></div>
                  <div className="flex flex-col"><span className="text-slate-500 text-xs font-black uppercase tracking-[0.3em]">Next Event</span><span className="text-3xl font-black text-blue-400 uppercase tracking-tighter">{nextRunText}</span></div>
                </div>
              )}
              {timeLeft && (
                <div className="flex items-center gap-12">
                  <div className="h-12 w-px bg-white/10"></div>
                  <div className="flex flex-col"><span className="text-slate-500 text-xs font-black uppercase tracking-[0.3em]">Time Left</span><span className="text-3xl font-black text-blue-400 tabular-nums">{timeLeft}</span></div>
                </div>
              )}
            </div>
          </div>
        </main>
        <footer className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-20 mt-auto">
          <div className="glass-panel p-6 rounded-3xl flex items-center gap-4">
            {weather && weather.current && <>
              <div className="text-blue-400 scale-125">{React.cloneElement(getWeatherIcon(weather.current.weather_code, weather.current.is_day), { size: 40 })}</div>
              <div className="flex flex-col leading-tight"><span className="text-2xl font-black text-white">{weather.current.temperature_2m?.toFixed(0)}°</span><span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{weather.city}</span></div>
            </>}
          </div>
          <div className="glass-panel p-6 rounded-3xl flex items-center justify-between"><div className="flex flex-col"><span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Maintain</span><span className="text-2xl font-black text-slate-300">{settings ? settings.set_point : '--'}°F</span></div><Thermometer className="text-slate-700" size={24} /></div>
          <div className="glass-panel p-6 rounded-3xl flex items-center justify-between"><div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${status && status.actual_relay_state && status.actual_relay_state.jet_pump ? 'bg-blue-500 animate-pulse' : 'bg-white/10'}`}></div><span className="text-lg font-black text-slate-300 uppercase">Jets</span></div><Wind className="text-slate-700" size={24} /></div>
          <div className="glass-panel p-6 rounded-3xl flex items-center justify-between"><div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${status && status.actual_relay_state && status.actual_relay_state.light ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-white/10'}`}></div><span className="text-lg font-black text-slate-300 uppercase">Lights</span></div><Lightbulb className="text-slate-700" size={24} /></div>
        </footer>
        <div ref={flyoutRef} className={`fixed right-0 top-1/2 -translate-y-1/2 z-50 transition-transform duration-500 flex items-center ${showKioskControls ? 'translate-x-0' : 'translate-x-[calc(100%-12px)]'}`}>
          <button onClick={(e) => { e.stopPropagation(); setShowKioskControls(!showKioskControls); }} className="h-24 w-3 glass-panel rounded-l-full opacity-30 hover:opacity-100 transition-opacity"></button>
          <div className="glass-panel p-6 rounded-l-[2rem] flex flex-col gap-4 border-r-0 shadow-2xl backdrop-blur-3xl min-w-[140px]">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Switch Mode</h3>
            <button onClick={() => setRole('user')} className="px-4 py-3 glass-inset hover:bg-blue-500/20 rounded-xl transition font-black uppercase text-xs">User</button>
            <button onClick={() => setRole('admin')} className="px-4 py-3 glass-inset hover:bg-red-500/20 rounded-xl transition font-black uppercase text-xs">Admin</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 text-slate-100 font-sans relative">
      <WaterBackground active={isHeaterOn} />
      <div className="fixed inset-0 bg-blue-500/5 pointer-events-none z-10"></div>
      <header className="relative z-30 mb-8 md:mb-12">
        <div className="glass-panel rounded-[2rem] md:rounded-[2.5rem] p-2.5 md:p-6 flex items-center justify-between gap-2 md:gap-8 shadow-2xl">
          <div className="flex items-center group cursor-default min-w-0 flex-shrink-0">
            <div className="hidden md:flex relative mr-5 flex-shrink-0">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full group-hover:bg-emerald-500/30 transition-colors duration-700"></div>
              <div className="relative glass-inset p-4 rounded-[1.25rem] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <Droplets className="text-blue-400 w-8 h-8 absolute animate-pulse opacity-50" />
                <Zap className="text-emerald-400 w-5 h-5 relative z-10 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              </div>
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-5xl font-black tracking-tighter bg-gradient-to-br from-blue-400 via-white to-emerald-400 bg-clip-text text-transparent leading-tight drop-shadow-sm">OpenSoak</h1>
              <div className="hidden lg:flex items-center gap-2 mt-0.5">
                <div className={`px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest flex items-center border ${status && status.safety_status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'}`}>
                  <ShieldCheck className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1" /> {status ? status.safety_status : 'UNKNOWN'}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center glass-inset rounded-2xl md:rounded-3xl p-1 h-12 md:h-20 flex-shrink-0">
            <div className="flex items-center px-2 sm:px-3 md:px-6">
              <Clock className="w-4 h-4 md:w-8 md:h-8 text-blue-400 mr-1.5 md:mr-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs md:text-2xl font-black text-slate-100 tabular-nums">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}</span>
            </div>
            <div className="w-px h-5 md:h-8 bg-white/10"></div>
            {weather && weather.current && (
              <a href={getWeatherLink()} target="_blank" rel="noopener noreferrer" className="flex items-center px-2 sm:px-3 md:px-6 hover:bg-white/5 transition-colors group" title="View detailed local weather forecast">
                <div className="scale-50 sm:scale-75 md:scale-100 group-hover:scale-110 transition-transform flex-shrink-0">{React.cloneElement(getWeatherIcon(weather.current.weather_code, weather.current.is_day), { size: 36 })}</div>
                <div className="flex flex-col leading-tight -ml-1 md:ml-0">
                  <span className="text-[10px] sm:text-xs md:text-2xl font-black text-white">{weather.current.temperature_2m?.toFixed(0)}°</span>
                  <span className="hidden xl:block text-[10px] text-slate-500 uppercase font-black tracking-widest">{weather.city}</span>
                </div>
              </a>
            )}
            <div className="w-px h-5 md:h-8 bg-white/10"></div>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-transparent text-[9px] sm:text-[10px] md:text-base text-slate-400 px-1.5 sm:px-2 md:px-4 outline-none cursor-pointer font-black uppercase tracking-tighter md:tracking-widest hover:text-white" title="Switch between View, User, and Admin modes">
              <option value="viewer" className="bg-slate-900">View</option><option value="user" className="bg-slate-900">User</option><option value="admin" className="bg-slate-900">Adm</option>
            </select>
            <div className="w-px h-5 md:h-8 bg-white/10"></div>
            <button onClick={() => fetchData()} className="flex items-center justify-center aspect-square h-full px-2 sm:px-3 md:px-4 text-slate-500 hover:text-blue-400 group flex-shrink-0" title="Refresh all system data manually"><HelpCircle className="w-4 h-4 md:w-7 md:h-7 group-hover:scale-110 transition-transform" /></button>
          </div>
        </div>
      </header>

      {weatherWarning && (
        <div className="mb-8 p-4 bg-orange-500/10 border border-orange-500/30 backdrop-blur-xl rounded-2xl flex items-center space-x-4 animate-pulse-subtle relative z-20">
          <div className="p-2 bg-orange-500 rounded-lg"><Umbrella className="text-white w-5 h-5" /></div>
          <p className="text-orange-400 font-black uppercase text-xs tracking-widest">{weatherWarning}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-20">
        <div className={`lg:col-span-2 glass-panel rounded-3xl p-6 md:p-8 transition-all duration-500 relative overflow-hidden ${isHeaterOn ? 'border-orange-500/30 bg-orange-500/5 bg-glow-orange' : ''}`}>
          <div className={`absolute top-0 right-0 p-4 md:p-8 opacity-5 transition-transform duration-[5000ms] ${isHeaterOn ? 'text-orange-500' : 'text-slate-700'}`}>
            <Thermometer className="w-32 h-32 md:w-48 md:h-48" />
          </div>
          <div className="relative z-10">
            <h2 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-4 flex items-center"><Thermometer className={`w-4 h-4 mr-2 ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-blue-400'}`} /> Current Water Temperature</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex items-baseline min-w-[180px] md:min-w-[280px]"><span className={`text-7xl md:text-9xl font-black tracking-tighter text-white transition-all tabular-nums ${isHeaterOn ? 'animate-float bg-gradient-to-br from-white to-orange-200 bg-clip-text text-transparent' : ''}`}>{currentTemp}</span><span className="text-3xl md:text-5xl font-black text-white/10 ml-2 tracking-tighter">°F</span></div>
              {timeLeft && (
                <div className="flex items-center space-x-4 glass-inset p-3 md:p-4 rounded-[2rem] shadow-2xl backdrop-blur-3xl">
                  <div className="flex flex-col items-center justify-center min-w-[90px] md:min-w-[110px] border-r border-white/10 pr-4"><span className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Time Left</span><span className="text-2xl md:text-4xl font-mono font-bold text-blue-400">{timeLeft}</span></div>
                  {role !== 'viewer' && (
                    <div className="flex items-center space-x-3">
                      <div className="flex flex-col space-y-2">
                        <button onClick={() => adjustTimer(1)} className="p-3 glass-inset hover:bg-white/5 rounded-xl text-slate-300 active:scale-90 transition" title="Add 1 minute to session"><ChevronUp size={24} /></button>
                        <button onClick={() => adjustTimer(-1)} className="p-3 glass-inset hover:bg-white/5 rounded-xl text-slate-300 active:scale-90 transition" title="Subtract 1 minute from session"><ChevronDown size={24} /></button>
                      </div>
                      <button onClick={() => adjustTimer(15)} className="h-full px-5 py-4 bg-blue-600/80 hover:bg-blue-600 backdrop-blur-xl text-white text-sm font-black uppercase rounded-2xl transition shadow-xl active:scale-95 border border-white/10" title="Quick add 15 minutes to session">+15m</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 md:gap-0 md:space-x-8">
              {status && status.desired_state && status.desired_state.manual_soak_active && (
                <>
                  <div className="flex flex-col group relative">
                    <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">Target Temp</span>
                    <div className="flex items-center space-x-5 mt-1">
                      <input type="number" step="0.5" value={tempInput} onFocus={() => setIsEditingTemp(true)} onChange={(e) => setTempInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { updateSetPoint(parseFloat(tempInput) - (settings ? settings.set_point : 0)); setIsEditingTemp(false); e.target.blur(); }}} onBlur={() => { updateSetPoint(parseFloat(tempInput) - (settings ? settings.set_point : 0)); setIsEditingTemp(false); }} className="glass-inset text-4xl font-black text-blue-400 w-32 px-3 py-2 rounded-2xl outline-none shadow-inner" title="Enter specific target temperature" />
                      <div className="flex space-x-2">
                        <button onClick={() => updateSetPoint(0.5)} className="p-2 hover:bg-white/5 rounded-xl transition scale-125" title="Increase target 0.5°F"><ChevronUp /></button>
                        <button onClick={() => updateSetPoint(-0.5)} className="p-2 hover:bg-white/5 rounded-xl transition scale-125" title="Decrease target 0.5°F"><ChevronDown /></button>
                      </div>
                    </div>
                  </div>
                  <div className="h-14 w-px bg-white/10 mx-6 hidden md:block"></div>
                </>
              )}
              <div className="flex flex-col group relative">
                <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">Rest Temp</span>
                <div className="flex items-center space-x-5 mt-1"><span className="text-3xl font-black text-slate-400">{settings ? settings.default_rest_temp : '--'}°F</span>{role === 'admin' && <div className="flex space-x-2"><button onClick={() => updateRestTemp(0.5)} className="p-2 hover:bg-white/5 rounded-xl transition scale-110" title="Increase resting temperature"><ChevronUp /></button><button onClick={() => updateRestTemp(-0.5)} className="p-2 hover:bg-white/5 rounded-xl transition scale-110" title="Decrease resting temperature"><ChevronDown /></button></div>}</div>
              </div>
              <div className="h-14 w-px bg-white/10 mx-6 hidden md:block"></div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">Status</span>
                <div className="flex items-center space-x-4 mt-1">
                  <span className={`text-2xl font-black ${isHeaterOn ? 'text-orange-400 animate-pulse' : 'text-emerald-400'}`}>{isHeaterOn ? 'Heating...' : 'Ready'}</span>
                  {status?.desired_state?.manual_soak_active ? (
                    <button onClick={cancelSoak} className="flex items-center space-x-3 bg-red-600/80 hover:bg-red-600 backdrop-blur-xl text-white text-sm font-black uppercase px-6 py-4 rounded-[1.5rem] transition shadow-xl active:scale-90" title="Immediately stop manual session and turn off devices">
                      <Zap size={18} className="fill-current" /><span>Stop Session</span>
                    </button>
                  ) : status?.desired_state?.scheduled_session_active ? (
                    <button onClick={cancelScheduledSession} className="flex items-center space-x-3 bg-red-600/80 hover:bg-red-600 backdrop-blur-xl text-white text-sm font-black uppercase px-6 py-4 rounded-[1.5rem] transition shadow-xl active:scale-90" title="Override and stop the current automated schedule">
                      <Clock size={18} /><span>Stop Schedule</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {role !== 'viewer' && (!status || !status.desired_state || !status.desired_state.manual_soak_active) && (
              <div className="mt-8 p-6 glass-inset rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex items-center space-x-4"><div className={`p-3 rounded-2xl bg-orange-500/10 ${isHeaterOn ? 'animate-pulse' : ''}`}><Zap className="text-orange-400 w-6 h-6" /></div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Soak Now!</h3></div>
                <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); startSoak(fd.get('temp'), fd.get('duration')); }} className="flex items-center space-x-4 w-full sm:w-auto">
                  <div className="flex flex-col"><span className="text-[10px] text-slate-500 uppercase font-black ml-1">Temp</span><input name="temp" type="number" step="0.5" defaultValue={settings ? settings.default_soak_temp : 104} className="w-20 glass-inset rounded-xl text-sm p-3 text-orange-400 font-black outline-none" title="Set target temperature for this soak" /></div>
                  <div className="flex flex-col"><span className="text-[10px] text-slate-500 uppercase font-black ml-1">Min</span><input name="duration" type="number" defaultValue={settings ? settings.default_soak_duration : 60} className="w-20 glass-inset rounded-xl text-sm p-3 text-slate-300 font-black outline-none" title="Set duration in minutes" /></div>
                  <button type="submit" className="flex-1 sm:flex-none h-12 bg-orange-600/80 hover:bg-orange-600 backdrop-blur-xl text-white text-xs font-black uppercase px-8 rounded-2xl transition shadow-lg active:scale-95" title="Begin a manual soak session immediately">Start Soak!</button>
                </form>
              </div>
            )}
          </div>
          <div className="mt-12"><div className="flex justify-between items-center mb-4"><h3 className="text-slate-500 text-xs font-black uppercase tracking-widest">Temperature History</h3><select value={historyLimit} onChange={(e) => setHistoryLimit(parseInt(e.target.value))} className="glass-inset text-[10px] text-slate-400 rounded-lg px-3 py-1.5 outline-none font-black uppercase tracking-widest" title="Change the timeframe displayed on the graph"><option value="60">Last 1 Hour</option><option value="360">Last 6 Hours</option><option value="1440">Last 24 Hours</option></select></div><div className="h-64 w-full glass-inset rounded-2xl p-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{ left: -20, right: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="time" hide /><YAxis domain={[70, 115]} stroke="#475569" fontSize={10} tickFormatter={(val) => `${val}°`} /><Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} itemStyle={{ color: '#60a5fa' }} /><Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={false} animationDuration={1000} /></LineChart></ResponsiveContainer></div></div>
          {weather && weather.daily && <div className="mt-8 pt-8 border-t border-white/10"><h3 className="text-slate-500 text-base font-black uppercase mb-8 tracking-widest text-center md:text-left">7-Day Forecast</h3><div className="flex lg:grid lg:grid-cols-7 gap-5 overflow-x-auto lg:overflow-visible pb-6 custom-scrollbar">{weather.daily.time.slice(0, 7).map((date, idx) => (<a key={date} href={getWeatherLink()} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-32 lg:w-auto flex flex-col items-center p-5 rounded-[2rem] glass-inset shadow-xl transition-all hover:scale-105 hover:bg-white/5" title={`View details for ${new Date(date + "T00:00:00").toLocaleDateString([], { weekday: 'long' })}`}><span className="text-[10px] text-slate-400 uppercase font-black mb-5 tracking-tighter">{new Date(date + "T00:00:00").toLocaleDateString([], { weekday: 'short' })}</span><div className="mb-5 text-blue-400">{React.cloneElement(getWeatherIcon(weather.daily.weather_code[idx]), { size: 48 })}</div><div className="flex flex-col items-center"><span className="text-2xl font-black text-white">{weather.daily.temperature_2m_max[idx].toFixed(0)}°</span><span className="text-sm text-slate-500 font-bold">{weather.daily.temperature_2m_min[idx].toFixed(0)}°</span></div></a>))}</div></div>}
        </div>

        <div className="glass-panel rounded-3xl p-8 shadow-xl h-fit">
          <div className="space-y-4">
            <h2 className="text-white text-xl font-bold mb-6 flex items-center uppercase tracking-tighter"><SettingsIcon className="w-5 h-5 mr-2 text-slate-400" /> Device Controls</h2>
            <StatusIndicator label="Heater" active={isHeaterOn} color="orange" isLarge={true} icon={<Zap size={20} />} />
            <ControlToggle label="Jets" icon={<Wind />} active={status && status.actual_relay_state && status.actual_relay_state.jet_pump} loading={status && status.desired_state && status.actual_relay_state && status.desired_state.jet_pump !== status.actual_relay_state.jet_pump} onToggle={(v) => toggleControl('jet_pump', v)} color="blue" />
            <ControlToggle label="Light" icon={<Lightbulb />} active={status && status.actual_relay_state && status.actual_relay_state.light} loading={status && status.desired_state && status.actual_relay_state && status.desired_state.light !== status.actual_relay_state.light} onToggle={(v) => toggleControl('light', v)} color="yellow" />
            {role === 'admin' && (
              <div className="pt-4 border-t border-white/10 space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Administrative</h3>
                <ControlToggle label="Circ Pump" icon={<Droplets />} active={status && status.actual_relay_state && status.actual_relay_state.circ_pump} onToggle={(v) => toggleControl('circ_pump', v)} color="emerald" />
                <ControlToggle label="Ozone" icon={<Zap />} active={status && status.actual_relay_state && status.actual_relay_state.ozone} onToggle={(v) => toggleControl('ozone', v)} color="blue" />
                <button onClick={masterShutdown} className="w-full p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 font-black uppercase tracking-tighter hover:bg-red-500/20 transition-all backdrop-blur-xl active:scale-95 shadow-xl">Master Shutdown</button>
              </div>
            )}
          </div>

          {role !== 'viewer' && (
            <>
              <div className="mt-8 p-6 glass-inset rounded-3xl max-h-80 overflow-y-auto custom-scrollbar shadow-inner">
                <h3 className="text-base font-black text-slate-500 uppercase mb-6 tracking-widest">Recent Activity</h3>
                <div className="space-y-4">{usageLogs.map(l => (<div key={l.id} className="text-sm border-l-4 border-blue-500/30 pl-4 py-2 hover:bg-white/5 transition-colors"><p className="text-slate-100 font-black text-base">{l.event}</p><p className="text-slate-400 text-xs truncate font-bold">{l.details}</p><p className="text-[8px] text-slate-600 italic mt-1 font-black uppercase">{new Date(l.timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12: true})}</p></div>))}</div>
              </div>
              <div className="mt-8 p-6 glass-inset rounded-3xl">
                <h3 className="text-base font-black text-slate-500 uppercase mb-6 tracking-widest">Schedules</h3>
                <div className="space-y-6 mb-6">{schedules.map(s => (
                  <div key={s.id} className="glass-panel p-5 rounded-[1.5rem] border-white/5 hover:bg-white/5 transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-3 flex-1 min-w-0">
                        <span className="text-slate-100 font-black text-xl tracking-tight leading-tight">{s.name}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex gap-2 items-center">
                            {Boolean(s.jet_on) && <div className="flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20" title="Schedule includes Jets"><Wind size={14} className="text-blue-400" /><span className="text-[9px] font-black text-blue-400 uppercase">Jets</span></div>}
                            {Boolean(s.light_on) && <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-lg border border-yellow-500/20" title="Schedule includes Light"><Lightbulb size={14} className="text-yellow-400" /><span className="text-[9px] font-black text-yellow-400 uppercase">Light</span></div>}
                            {Boolean(s.ozone_on) && <div className="flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20" title="Schedule includes Ozone"><Sparkles size={14} className="text-emerald-400" /><span className="text-[9px] font-black text-emerald-400 uppercase">Ozone</span></div>}
                            {s.type === 'soak' && s.target_temp && (
                              <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10" title="Target temperature for this soak">
                                <Thermometer size={14} className="text-blue-400" />
                                <span className="text-[10px] font-black text-slate-300 tabular-nums">{s.target_temp}°F</span>
                              </div>
                            )}
                          </div>
                          <div className="h-4 w-px bg-white/10"></div>
                          <span className="text-slate-400 font-black text-xs tracking-[0.1em] uppercase">{formatTime(s.start_time)} - {formatTime(s.end_time)}</span>
                          <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest opacity-40 ml-auto">[{s.type}]</span>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start ml-6">
                        <button onClick={() => triggerSchedule(s.id)} className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 transition-all shadow-lg active:scale-90" title="Run/Resume Now">
                          <Play size={20} fill="currentColor" />
                        </button>
                        {role === 'admin' && (
                          <div className="flex flex-col gap-2">
                            <button onClick={() => { setEditingSchedule(s); setSelectedDays(String(s.days_of_week).split(',').map(Number)); }} className="p-2 text-blue-400 hover:text-blue-200 transition-colors" title="Edit schedule details">✎</button>
                            <button onClick={() => deleteSchedule(s.id)} className="p-2 text-red-400 hover:text-red-200 transition-colors" title="Permanently delete this schedule">✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}</div>
                {role === 'admin' && (
                  <form key={editingSchedule ? `edit-${editingSchedule.id}` : 'new-schedule'} onSubmit={createSchedule} className="pt-8 border-t border-white/10 space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-base font-black text-slate-500 uppercase tracking-widest">
                        {editingSchedule ? 'Edit Session' : 'Add Session'}
                      </h3>
                      {editingSchedule && <button type="button" onClick={() => setEditingSchedule(null)} className="text-xs text-red-500 font-black uppercase tracking-widest hover:text-red-400 transition-colors border-b border-red-500/20 pb-0.5">Cancel</button>}
                    </div>
                    <div className="space-y-1"><label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Schedule Name</label><input name="name" defaultValue={editingSchedule?.name} placeholder="Morning Soak" required className="w-full glass-inset p-3 rounded-xl text-sm outline-none focus:border-blue-500 transition shadow-inner font-bold" /></div>
                    <div className="flex justify-between gap-1">{['M','T','W','T','F','S','S'].map((l, i) => { const dayVal = (i + 1) % 7; return (<button key={i} type="button" onClick={() => toggleDay(dayVal)} className={`w-7 h-7 rounded-full text-[10px] font-black transition-all ${selectedDays.includes(dayVal) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110' : 'glass-inset text-slate-600'}`}>{l}</button>); })}</div>
                    <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Type</label><select name="type" defaultValue={editingSchedule?.type || 'soak'} className="w-full glass-inset p-3 rounded-xl text-[10px] bg-slate-900 font-black outline-none"><option value="soak">Soak</option><option value="clean">Clean</option><option value="ozone">Ozone</option></select></div><div className="space-y-1"><label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Temp</label><input name="temp" type="number" step="0.5" defaultValue={editingSchedule?.target_temp} placeholder="°F" className="w-full glass-inset p-3 rounded-xl text-sm font-black outline-none" /></div></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Start</label>
                        <input name="start" type="time" defaultValue={editingSchedule?.start_time || "18:00"} className="w-full glass-inset p-3 rounded-xl text-sm font-black outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">End</label>
                        <input name="end" type="time" defaultValue={editingSchedule?.end_time || "20:00"} className="w-full glass-inset p-3 rounded-xl text-sm font-black outline-none" />
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center px-2 py-2 glass-inset rounded-xl">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Initial State</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" name="jet_on" defaultChecked={editingSchedule?.jet_on} className="sr-only peer" />
                          <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 relative"></div>
                          <span className="text-[8px] font-black uppercase text-slate-400 peer-checked:text-white">Jets</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" name="light_on" defaultChecked={editingSchedule?.light_on ?? true} className="sr-only peer" />
                          <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:bg-yellow-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 relative"></div>
                          <span className="text-[8px] font-black uppercase text-slate-400 peer-checked:text-white">Light</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" name="ozone_on" defaultChecked={editingSchedule ? editingSchedule.ozone_on : false} className="sr-only peer" />
                          <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 relative"></div>
                          <Sparkles size={12} className="text-slate-400 peer-checked:text-emerald-400 transition-colors" />
                          <span className="text-[8px] font-black uppercase text-slate-400 peer-checked:text-white">Ozone</span>
                        </label>
                      </div>
                    </div>

                    <button type="submit" className="w-full py-3 bg-blue-600/80 hover:bg-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95">{editingSchedule ? 'Save Changes' : 'Create Schedule'}</button>
                  </form>
                )}
              </div>
            </>
          )}

          {role === 'admin' && (
            <div className="mt-8 p-6 glass-inset rounded-3xl shadow-xl">
              <h3 className="text-base font-black text-slate-500 uppercase mb-6 tracking-widest flex items-center"><SettingsIcon size={16} className="mr-2" /> System Settings</h3>
              <div className="space-y-6">
                <div className="group relative"><label className="block text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Weather Location</label><input defaultValue={settings?.location} onBlur={(e) => updateLocation(e.target.value)} className="w-full glass-inset text-base p-4 rounded-xl outline-none focus:border-blue-500 transition shadow-inner font-bold" title="Enter Zip Code for local weather and forecasts" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="group relative"><label className="block text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Soak Min</label><input type="number" defaultValue={settings?.default_soak_duration} onBlur={(e) => axios.post(`${API_BASE}/settings/`, { default_soak_duration: parseInt(e.target.value) }, { headers: getAuthHeaders() })} className="w-full glass-inset text-base p-4 rounded-xl outline-none font-bold" title="Default duration for manual soak sessions" /></div>
                  <div className="group relative"><label className="block text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Limit °F</label><input type="number" defaultValue={settings?.max_temp_limit} onBlur={(e) => axios.post(`${API_BASE}/settings/`, { max_temp_limit: parseFloat(e.target.value) }, { headers: getAuthHeaders() })} className="w-full glass-inset text-base p-4 rounded-xl text-red-400 outline-none font-black" title="Maximum allowed temperature for safety (Master Cutoff)" /></div>
                </div>
                <div className="pt-6 border-t border-white/5 space-y-6">
                  <div className="group relative"><label className="block text-[10px] text-slate-500 uppercase font-black ml-1 tracking-widest">Electric Cost ($/kWh)</label><input type="number" step="0.01" defaultValue={settings?.kwh_cost} onBlur={(e) => axios.post(`${API_BASE}/settings/`, { kwh_cost: parseFloat(e.target.value) }, { headers: getAuthHeaders() })} className="w-full glass-inset text-sm p-3 rounded-xl outline-none font-black" title="Your local electricity rate for cost estimation" /></div>
                  <div className="grid grid-cols-2 gap-4">{[{l:"Heater Watts",k:"heater_watts",t:"Wattage rating of the heating element"},{l:"Circ Watts",k:"circ_pump_watts",t:"Wattage of the low-speed circulation pump"},{l:"Jet Watts",k:"jet_pump_watts",t:"Wattage of the high-speed jet pump"},{l:"Light Watts",k:"light_watts",t:"Wattage of the underwater lighting"},{l:"Ozone Watts",k:"ozone_watts",t:"Wattage of the ozone purification unit"}].map(p => (<div key={p.k} className="group relative"><label className="block text-[10px] text-slate-500 uppercase font-black ml-1 tracking-tighter truncate">{p.l}</label><input type="number" defaultValue={settings?.[p.k]} onBlur={(e) => axios.post(`${API_BASE}/settings/`, { [p.k]: parseFloat(e.target.value) }, { headers: getAuthHeaders() })} className="w-full glass-inset text-sm p-3 rounded-xl outline-none font-bold" title={p.t} /></div>))}</div>
                </div>
                <button onClick={async () => { if (confirm("Update from GitHub?")) { try { await axios.post(`${API_BASE}/control/update-system`, {}, { headers: getAuthHeaders() }); alert("Update triggered."); } catch (e) { alert("Failed: " + e.message); } } }} className="w-full py-5 glass-panel rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-blue-400 hover:text-white hover:bg-blue-500/20 transition-all border border-blue-500/30 flex items-center justify-center shadow-2xl active:scale-95" title="Pull latest software updates from GitHub and restart services"><span className="mr-4 text-2xl">🔄</span> UPDATE SYSTEM</button>
              </div>
            </div>
          )}

          <div className="mt-8 p-4 glass-inset rounded-2xl" title="Real-time estimated energy consumption costs">
             <h3 className="text-base font-black text-slate-500 uppercase flex items-center tracking-widest mb-4"><Zap size={16} className="mr-1 text-orange-400" /> Operating Costs</h3>
             {energyData ? (
               <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4"><div className="glass-inset p-4 rounded-[1.5rem] text-center shadow-inner"><span className="text-[10px] text-slate-500 uppercase block font-black mb-1">Today</span><span className="text-2xl font-black text-emerald-400 tabular-nums">${Object.values(energyData.today).reduce((a, b) => a + b.cost, 0).toFixed(2)}</span></div><div className="glass-inset p-4 rounded-[1.5rem] text-center shadow-inner"><span className="text-[10px] text-slate-500 uppercase block font-black mb-1">Month</span><span className="text-2xl font-black text-blue-400">${Object.values(energyData.month).reduce((a, b) => a + b.cost, 0).toFixed(2)}</span></div></div>
                 {role === 'admin' && (
                   <div className="space-y-2 pt-4 border-t border-white/5">{Object.entries(energyData.today).map(([component, stats]) => (<div key={component} className="flex justify-between items-center text-[10px] px-2 opacity-70 font-black uppercase tracking-widest text-slate-400"><span>{component.replace('_', ' ')}</span><div className="flex items-center space-x-3"><span className="text-slate-600 italic">{(stats.runtime / 3600).toFixed(1)}h</span><span className="text-slate-200 tabular-nums font-black">${stats.cost.toFixed(2)}</span></div></div>))}</div>
                 )}
               </div>
             ) : <p className="text-[10px] text-slate-600 italic">Calculating...</p>}
          </div>
        </div>
      </div>
      {role === 'admin' && <Terminal content={systemLogs} />}
    </div>
  );
}

function Terminal({ content }) {
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [content]);
  const parseLine = (l) => { if (l.includes("ERROR") || l.includes("FAILURE") || l.includes("CRITICAL")) return "text-red-400"; if (l.includes("WARNING")) return "text-yellow-400"; if (l.includes("INFO")) return "text-blue-400"; return "text-slate-400"; };
  return (
    <div className="mt-8 glass-panel rounded-3xl overflow-hidden flex flex-col h-[400px] shadow-2xl"><div className="bg-white/5 px-6 py-3 border-b border-white/5 flex items-center justify-between"><div className="flex items-center space-x-2"><div className="w-2 h-2 rounded-full bg-red-500/30"></div><div className="w-2 h-2 rounded-full bg-yellow-500/30"></div><div className="w-2 h-2 rounded-full bg-emerald-500/30"></div><span className="ml-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">System Console</span></div><div className="text-[10px] font-bold text-slate-600 animate-pulse flex items-center gap-2"><span>●</span> LIVE</div></div><div ref={scrollRef} className="p-6 overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar glass-inset flex-1">{content.split('\n').map((l, i) => (<div key={i} className="mb-1 whitespace-pre-wrap break-all hover:bg-white/5 transition-colors"><span className="text-slate-700 mr-4 select-none opacity-50 tabular-nums">{i + 1}</span><span className={parseLine(l)}>{l}</span></div>))}</div></div>
  );
}

function StatusIndicator({ label, active, color, isLarge, icon }) {
  const colorMaps = {
    orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", glow: "bg-glow-orange", dot: "bg-orange-500", shadow: "shadow-[0_0_12px_rgba(249,115,22,0.4)]" },
    blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", glow: "bg-glow-blue", dot: "bg-blue-500", shadow: "shadow-[0_0_12px_rgba(59,130,246,0.4)]" },
    yellow: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", glow: "bg-glow-yellow", dot: "bg-yellow-500", shadow: "shadow-[0_0_12px_rgba(234,179,8,0.4)]" },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", glow: "bg-glow-emerald", dot: "bg-emerald-500", shadow: "shadow-[0_0_12px_rgba(16,185,129,0.4)]" }
  };
  const c = colorMaps[color] || colorMaps.orange;
  if (isLarge) return (<div className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all duration-500 glass-panel ${active ? `opacity-100 ${c.glow} ${c.border}` : 'opacity-40'}`}><div className="flex items-center"><div className={`p-3 rounded-xl ${active ? `${c.bg} ${c.text}` : 'bg-white/5 text-slate-600'}`}>{React.cloneElement(icon, { className: active ? 'animate-pulse' : '' })}</div><span className="ml-4 font-black uppercase tracking-tight text-slate-300">{label}</span></div><div className={`w-3 h-3 rounded-full ${active ? `${c.dot} animate-pulse ${c.shadow}` : 'bg-white/10'}`} /></div>);
  return (<div className={`p-3 rounded-xl glass-inset flex flex-col items-center justify-center space-y-1 transition-all ${active ? `opacity-100 ${c.border} ${c.glow}` : 'opacity-30'}`}><div className={`w-2 h-2 rounded-full ${active ? c.dot : 'bg-white/10'} ${active ? 'animate-pulse' : ''}`} /><span className="text-[10px] font-bold uppercase text-slate-500">{label}</span></div>);
}

function ControlToggle({ label, icon, active, onToggle, color, disabled, loading }) {
  const colors = { orange: "bg-orange-500/10 text-orange-400 border-orange-500/30 bg-glow-orange", blue: "bg-blue-500/10 text-blue-400 border-blue-500/30 bg-glow-blue", yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 bg-glow-yellow", emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 bg-glow-emerald", gray: "bg-white/5 text-slate-400 border-white/5" };
  return (<div className="group relative"><button onClick={() => !disabled && onToggle(!active)} disabled={disabled || loading} className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all duration-500 glass-panel shadow-lg ${disabled ? 'opacity-30 cursor-not-allowed' : ''} ${active ? colors[color] : colors.gray} ${loading ? 'animate-pulse brightness-110' : ''}`}><div className="flex items-center"><div className={`p-3 rounded-xl transition-all ${active ? 'bg-white/10 shadow-lg' : 'bg-slate-900/40'}`}>{React.cloneElement(icon, { size: 24 })}</div><div className="flex flex-col items-start ml-4 text-left"><span className="font-black tracking-tight uppercase text-sm md:text-base">{label}</span>{loading && <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 animate-pulse">Syncing...</span>}</div></div><div className={`w-14 h-7 rounded-full relative transition-colors ${active ? 'bg-current opacity-60' : 'bg-white/10'}`}><div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-xl transition-all ${active ? 'right-1' : 'left-1'}`} /></div></button></div>);
}

function WaterBackground({ active }) {
  const hwStyle = { transform: 'translate3d(0,0,0)', backfaceVisibility: 'hidden' };
  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-[#020617]">
      <div className="absolute inset-0 opacity-40 animate-mesh" style={{ ...hwStyle, backgroundImage: 'linear-gradient(-45deg, #020617, #0f172a, #1e1b4b, #020617)', backgroundSize: '400% 400%' }}></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] animate-float" style={hwStyle}></div>
      <div className="absolute top-1/2 right-1/4 w-[30rem] h-[30rem] bg-emerald-600/10 rounded-full blur-[120px] animate-float" style={{ ...hwStyle, animationDelay: '2s', animationDuration: '7s' }}></div>
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-purple-600/10 rounded-full blur-[100px] animate-float" style={{ ...hwStyle, animationDelay: '4s', animationDuration: '10s' }}></div>
      <div className="opacity-60" style={hwStyle}>
        <svg className="absolute bottom-0 w-[200%] h-64 text-blue-500/30 animate-wave translate-x-[-25%]" style={hwStyle} viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5,73.84-4.36,147.54,16.88,218.2,35.26,69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" fill="currentColor"></path></svg>
        <svg className="absolute bottom-0 w-[200%] h-48 text-emerald-500/20 animate-wave translate-x-[-10%]" style={{ ...hwStyle, animationDirection: 'reverse', animationDuration: '15s' }} viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5,73.84-4.36,147.54,16.88,218.2,35.26,69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" fill="currentColor"></path></svg>
      </div>
      {active && <div className="absolute inset-0 bg-gradient-to-t from-orange-500/20 to-transparent transition-opacity duration-1000" style={hwStyle}></div>}
    </div>
  );
}

export default App;
