import threading
import time
import os
from datetime import datetime
from ..db.session import SessionLocal
from ..db.models import Settings, TemperatureLog, SystemState

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
            
            # --- HI-LIMIT FAULT CHECK ---
            if self.current_temp >= 110.0 or self.hi_limit_temp >= 110.0:
                self.safety_status = "CRITICAL: HI-LIMIT FAULT"
                self.system_locked = True
                self.controller.emergency_shutdown()
                return

            # --- CIRCULATION & FLOW LOGIC ---
            # Default to ON unless system is locked (Shutdown or Fault)
            needs_circ = not self.system_locked
            
            is_circ_currently_on = self.controller.get_relay_state(self.controller.CIRC_PUMP)
            
            if needs_circ:
                if not is_circ_currently_on:
                    self.controller.set_relay(self.controller.CIRC_PUMP, True)
                    self.circ_start_time = time.time()
                    return # Wait for next tick
                
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

            # --- HEATER LOGIC (Hysteresis) ---
            is_circ_actually_on = self.controller.get_relay_state(self.controller.CIRC_PUMP)
            is_flow_ok = self.controller.is_flow_detected()

            # Heater runs if Master toggle is ON AND safety conditions met
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
            # Ozone runs with Circ Pump by default unless locked
            if is_circ_actually_on and is_flow_ok and not self.system_locked:
                self.controller.set_relay(self.controller.OZONE, True)
            else:
                self.controller.set_relay(self.controller.OZONE, False)

            self.controller.set_relay(self.controller.JET_PUMP, state.jet_pump)
            self.controller.set_relay(self.controller.LIGHT, state.light)

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
