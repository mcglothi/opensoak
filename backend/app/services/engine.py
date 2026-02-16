import threading
import time
import os
from datetime import datetime
from ..db.session import SessionLocal
from ..db.models import Settings, TemperatureLog, SystemState, UsageLog, EnergyLog

class HotTubEngine:
    def __init__(self):
        if os.getenv("SIMULATE_HARDWARE", "False").lower() == "true":
            from ..hardware.mock_controller import MockHotTubController
            self.controller = MockHotTubController()
        else:
            from ..hardware.controller import HotTubController
            self.controller = HotTubController()
            
        self.running = False
        self.thread = None
        self.poll_interval = 1.0 # seconds
        self.last_log_time = 0
        self.log_interval = 60 # log temp every minute
        self.current_temp = 0.0
        self.hi_limit_temp = 0.0
        self.safety_status = "OK"
        self.flow_error_count = 0
        self.system_locked = False
        self.circ_start_time = 0
        
        # Energy Tracking
        self.last_tick_time = time.time()
        self.runtimes = {
            "heater": 0.0,
            "circ_pump": 0.0,
            "jet_pump": 0.0,
            "light": 0.0,
            "ozone": 0.0
        }
        self.last_energy_log_time = time.time()
        self.energy_log_interval = 3600 # Log energy every hour

        # Heating/Cooling Performance Tracking
        self.active_heating_event = None # { "start_time": t, "start_temp": x, "target": y }
        self.active_cooling_event = None # { "start_time": t, "start_temp": x, "target": y }
        self.last_target_temp = None
        self.last_heater_on = False

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
        self.controller.cleanup()

    def reset_faults(self):
        self.flow_error_count = 0
        self.system_locked = False
        self.safety_status = "OK"

    def _log_energy(self, db, settings):
        try:
            power_map = {
                "heater": settings.heater_watts,
                "circ_pump": settings.circ_pump_watts,
                "jet_pump": settings.jet_pump_watts,
                "light": settings.light_watts,
                "ozone": settings.ozone_watts
            }
            
            for component, seconds in self.runtimes.items():
                if seconds > 0:
                    watts = power_map.get(component, 0)
                    kwh = (watts * (seconds / 3600)) / 1000
                    cost = kwh * settings.kwh_cost
                    
                    log = EnergyLog(
                        component=component,
                        runtime_seconds=seconds,
                        kwh_used=kwh,
                        estimated_cost=cost
                    )
                    db.add(log)
                    # Reset memory counter for next period
                    self.runtimes[component] = 0.0
            
            db.commit()
        except Exception as e:
            print(f"Error logging energy: {e}")

    def _log_thermal_event(self, db, event_type, start_temp, target_temp, duration):
        try:
            # Fetch current weather for correlation
            outside_temp = None
            try:
                from .status import get_weather
                import asyncio
                weather = asyncio.run(get_weather(db))
                if "current" in weather:
                    outside_temp = weather["current"]["temperature_2m"]
            except: pass

            from ..db.models import HeatingEvent
            efficiency = (target_temp - start_temp) / (duration / 3600)
            
            event = HeatingEvent(
                event_type=event_type,
                start_temp=start_temp,
                target_temp=target_temp,
                duration_seconds=duration,
                outside_temp=outside_temp,
                efficiency_score=efficiency
            )
            db.add(event)
            db.commit()
            print(f"DEBUG: Thermal {event_type} event logged. {abs(efficiency):.2f}F/hr")
        except Exception as e:
            print(f"Error logging thermal event: {e}")

    def _run(self):
        while self.running:
            try:
                self._tick()
            except Exception as e:
                print(f"Engine Error: {e}")
                self.safety_status = f"Error: {str(e)}"
            time.sleep(self.poll_interval)

    def _tick(self):
        if self.system_locked:
            return

        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            if not settings:
                settings = Settings()
                db.add(settings)
                db.commit()
                db.refresh(settings)

            state = db.query(SystemState).first()
            if not state:
                state = SystemState()
                db.add(state)
                db.commit()
                db.refresh(state)

            self.current_temp = self.controller.get_temperature(0)
            self.hi_limit_temp = self.controller.get_temperature(1)
            is_heater_currently_on = self.controller.get_relay_state(self.controller.HEATER)
            
            # --- THERMAL PERFORMANCE TRACKING ---
            current_target = settings.set_point
            
            # 1. Detection: Start Heating
            if self.last_target_temp is not None and current_target > self.last_target_temp + 2.0:
                self.active_heating_event = { "start_time": time.time(), "start_temp": self.current_temp, "target": current_target }
                self.active_cooling_event = None # Can't cool while heating
            
            # 2. Detection: Start Cooling (Heater just turned off)
            if self.last_heater_on and not is_heater_currently_on:
                self.active_cooling_event = { "start_time": time.time(), "start_temp": self.current_temp }
                self.active_heating_event = None

            self.last_target_temp = current_target
            self.last_heater_on = is_heater_currently_on

            # 3. Processing: Heating Progress
            if self.active_heating_event:
                if self.current_temp >= self.active_heating_event["target"]:
                    duration = time.time() - self.active_heating_event["start_time"]
                    self._log_thermal_event(db, "heat", self.active_heating_event["start_temp"], self.active_heating_event["target"], duration)
                    self.active_heating_event = None

            # 4. Processing: Cooling Progress
            # We log a cooling event if it has cooled at least 1.0 degree
            if self.active_cooling_event:
                temp_drop = self.active_cooling_event["start_temp"] - self.current_temp
                if temp_drop >= 1.0:
                    duration = time.time() - self.active_cooling_event["start_time"]
                    self._log_thermal_event(db, "cool", self.active_cooling_event["start_temp"], self.current_temp, duration)
                    # Reset start point to track the NEXT degree of cooling
                    self.active_cooling_event = { "start_time": time.time(), "start_temp": self.current_temp }

            # --- MANUAL SOAK EXPIRATION ---
            if state.manual_soak_active and state.manual_soak_expires:
                if datetime.now().replace(tzinfo=state.manual_soak_expires.tzinfo) > state.manual_soak_expires:
                    state.manual_soak_active = False
                    state.manual_soak_expires = None
                    # state.jet_pump = False # Preserving user state
                    # state.light = False    # Preserving user state
                    settings.set_point = settings.default_rest_temp
                    
                    log = UsageLog(event="Manual Soak Ended", details="Duration expired, reverting to rest temperature")
                    db.add(log)
                    db.commit()

            # --- HI-LIMIT FAULT CHECK ---
            if self.current_temp >= 110.0 or self.hi_limit_temp >= 110.0:
                self.safety_status = "CRITICAL: HI-LIMIT FAULT"
                self.system_locked = True
                self.controller.emergency_shutdown()
                return

            # --- CIRCULATION & FLOW LOGIC ---
            # Default to ON unless system is locked (Shutdown or Fault)
            needs_circ = not self.system_locked
            
            # Forced sync of DB state for mandatory always-on components
            if needs_circ and not state.circ_pump:
                state.circ_pump = True
                db.commit()
                db.refresh(state)

            is_circ_currently_on = self.controller.get_relay_state(self.controller.CIRC_PUMP)
            
            if needs_circ:
                if not is_circ_currently_on:
                    self.controller.set_relay(self.controller.CIRC_PUMP, True)
                    self.circ_start_time = time.time()
                    is_circ_currently_on = True # Allow rest of tick to proceed with virtual confirmation
                
                # Logic Diagram: Wait 5 seconds before checking flow
                if time.time() - self.circ_start_time > 5:
                    if not self.controller.is_flow_detected():
                        self.flow_error_count += 1
                        if self.flow_error_count >= 5:
                            self.safety_status = "STOP: NO FLOW DETECTED"
                            self.system_locked = True
                            self.controller.emergency_shutdown()
                            return
                    else:
                        self.flow_error_count = 0 
            else:
                self.controller.set_relay(self.controller.CIRC_PUMP, False)
                if state.circ_pump:
                    state.circ_pump = False
                    db.commit()

            # --- HEATER LOGIC (Hysteresis) ---
            is_circ_actually_on = self.controller.get_relay_state(self.controller.CIRC_PUMP)
            is_flow_ok = self.controller.is_flow_detected()

            # Heater runs if Master toggle is ON AND safety conditions met
            # And ONLY if circ pump is actually on and flowing
            if state.heater and is_circ_actually_on and is_flow_ok:
                target = settings.set_point
                upper = target + settings.hysteresis_upper
                lower = target - settings.hysteresis_lower
                
                if self.current_temp >= upper:
                    self.controller.set_relay(self.controller.HEATER, False)
                elif self.current_temp <= lower:
                    self.controller.set_relay(self.controller.HEATER, True)
            else:
                self.controller.set_relay(self.controller.HEATER, False)

            # --- OZONE & OTHER ---
            # Ozone runs if Master toggle is ON AND safety conditions met
            if state.ozone and is_circ_actually_on and is_flow_ok and not self.system_locked:
                self.controller.set_relay(self.controller.OZONE, True)
            else:
                self.controller.set_relay(self.controller.OZONE, False)

            self.controller.set_relay(self.controller.JET_PUMP, state.jet_pump)
            self.controller.set_relay(self.controller.LIGHT, state.light)

            # --- ENERGY TRACKING ---
            now = time.time()
            dt = now - self.last_tick_time
            self.last_tick_time = now
            
            relay_states = self.controller.get_all_states()
            for component, is_on in relay_states.items():
                if is_on:
                    self.runtimes[component] += dt

            if now - self.last_energy_log_time >= self.energy_log_interval:
                self._log_energy(db, settings)
                self.last_energy_log_time = now

            # --- LOGGING ---
            if time.time() - self.last_log_time >= self.log_interval:
                log = TemperatureLog(value=self.current_temp)
                db.add(log)
                db.commit()
                self.last_log_time = time.time()

        finally:
            db.close()

# Global engine instance
engine = HotTubEngine()
