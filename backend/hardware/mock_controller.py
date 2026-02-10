import random
import time
from typing import Dict

class MockHotTubController:
    """Simulates hot tub hardware for local testing without a Raspberry Pi."""
    CIRC_PUMP = 22
    HEATER = 4
    JET_PUMP = 27
    LIGHT = 5
    OZONE = 6

    def __init__(self):
        self.pins = [self.CIRC_PUMP, self.HEATER, self.JET_PUMP, self.LIGHT, self.OZONE]
        self.state = {pin: False for pin in self.pins}
        self.simulated_temp = 100.0 # Start at 100 degrees
        print("🔧 Running in HARDWARE SIMULATION MODE")

    def get_temperature(self) -> float:
        # Simulate physics: 
        # If heater is on, temp goes up slowly. 
        # Otherwise, it drops slowly toward ambient (70).
        if self.state[self.HEATER]:
            self.simulated_temp += 0.05
        else:
            if self.simulated_temp > 70:
                self.simulated_temp -= 0.01
        
        # Add a tiny bit of noise
        return self.simulated_temp + (random.random() * 0.1)

    def set_relay(self, pin: int, state: bool):
        # Safety Interlock Simulation
        if pin == self.HEATER and state is True:
            if not self.state[self.CIRC_PUMP]:
                print("SIMULATOR: Safety Violation! Heater blocked because Circ Pump is OFF.")
                return False
        
        self.state[pin] = state
        return True

    def get_relay_state(self, pin: int) -> bool:
        return self.state.get(pin, False)

    def get_all_states(self) -> Dict[str, bool]:
        return {
            "circ_pump": self.state[self.CIRC_PUMP],
            "heater": self.state[self.HEATER],
            "jet_pump": self.state[self.JET_PUMP],
            "light": self.state[self.LIGHT],
            "ozone": self.state[self.OZONE]
        }

    def emergency_shutdown(self):
        for pin in self.pins:
            self.state[pin] = False
        print("SIMULATOR: EMERGENCY SHUTDOWN EXECUTED")

    def cleanup(self):
        print("SIMULATOR: Cleaning up...")
