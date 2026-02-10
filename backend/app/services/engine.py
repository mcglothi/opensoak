import threading
import time
from datetime import datetime
from ..db.session import SessionLocal
from ..db.models import Settings, TemperatureLog, SystemState
from ...hardware.controller import HotTubController

class HotTubEngine:
    def __init__(self):
        self.controller = HotTubController()
        self.running = False
        self.thread = None
        self.poll_interval = 1.0 # seconds
        self.last_log_time = 0
        self.log_interval = 60 # log temp every minute
        self.current_temp = 0.0
        self.safety_status = "OK"

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
        self.controller.cleanup()

    def _run(self):
        while self.running:
            try:
                self._tick()
            except Exception as e:
                print(f"Engine Error: {e}")
                self.safety_status = f"Error: {str(e)}"
            time.sleep(self.poll_interval)

    def _tick(self):
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

            self.current_temp = self.controller.get_temperature()
            self.safety_status = "OK"
            
            # --- SAFETY CHECKS ---
            # 1. Absolute Max Temperature Cutoff
            if self.current_temp >= settings.max_temp_limit:
                self.safety_status = "CRITICAL: HIGH TEMP"
                self.controller.emergency_shutdown()
                # Force state in DB to OFF for safety components
                state.heater = False
                state.circ_pump = False
                db.commit()
                return

            # --- LOGIC ---
            
            # Circulation Pump Logic
            # It should be ON if: 
            # a) The user wants it ON
            # b) The heater is trying to run
            # c) The ozone is trying to run (usually they go together)
            needs_circ = state.circ_pump or state.heater or state.ozone
            
            # Update Hardware
            self.controller.set_relay(self.controller.CIRC_PUMP, needs_circ)
            time.sleep(0.1) # Small delay for relay to settle
            
            is_circ_actually_on = self.controller.get_relay_state(self.controller.CIRC_PUMP)

            # Heater Logic (Hysteresis)
            if state.heater:
                # Interlock: Heater requires Circulation
                if not is_circ_actually_on:
                    self.safety_status = "HEATER WAITING FOR CIRC"
                    self.controller.set_relay(self.controller.HEATER, False)
                else:
                    target = settings.set_point
                    upper = target + settings.hysteresis_upper
                    lower = target - settings.hysteresis_lower
                    
                    is_heater_actually_on = self.controller.get_relay_state(self.controller.HEATER)
                    
                    if self.current_temp >= upper:
                        self.controller.set_relay(self.controller.HEATER, False)
                    elif self.current_temp <= lower:
                        self.controller.set_relay(self.controller.HEATER, True)
            else:
                self.controller.set_relay(self.controller.HEATER, False)

            # Other Components
            self.controller.set_relay(self.controller.JET_PUMP, state.jet_pump)
            self.controller.set_relay(self.controller.LIGHT, state.light)
            
            # Ozone follows Circ Pump logic but respect user toggle too
            if state.ozone and is_circ_actually_on:
                self.controller.set_relay(self.controller.OZONE, True)
            else:
                self.controller.set_relay(self.controller.OZONE, False)

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