try:
    import RPi.GPIO as GPIO
    import busio
    import digitalio
    import board
    import adafruit_mcp3xxx.mcp3008 as MCP
    from adafruit_mcp3xxx.analog_in import AnalogIn
    HAS_HARDWARE = True
except ImportError:
    HAS_HARDWARE = False

import numpy as np
import time
from typing import Dict, Optional

class HotTubController:
    # GPIO Pins (BCM)
    CIRC_PUMP = 22
    HEATER = 4
    JET_PUMP = 27
    LIGHT = 5
    OZONE = 6
    
    # ADC Setup
    SERIES_RESISTOR = 10000
    VREF = 3.3
    TEMP_VALUES = [6.8, 23.9, 49.0]
    R_VALUES = [23300, 10080, 3300]
    TEMP_OFFSET = 4

    def __init__(self):
        # GPIO Setup
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        self.pins = [self.CIRC_PUMP, self.HEATER, self.JET_PUMP, self.LIGHT, self.OZONE]
        for pin in self.pins:
            GPIO.setup(pin, GPIO.OUT)
            GPIO.output(pin, GPIO.HIGH) # Active Low: High is OFF

        # SPI/ADC Setup
        self.spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)
        self.cs = digitalio.DigitalInOut(board.CE0)
        self.mcp = MCP.MCP3008(self.spi, self.cs)
        self.chan = AnalogIn(self.mcp, MCP.P0)

        # Pre-calculate Steinhart-Hart coefficients
        self.coefficients = self._calculate_coefficients(self.TEMP_VALUES, self.R_VALUES)

    def _calculate_coefficients(self, temp_values, r_values):
        ln_resistances = np.log(r_values)
        inv_temp_values = 1 / (np.array(temp_values) + 273.15)
        A = np.vstack([np.ones(3), ln_resistances, ln_resistances ** 3]).T
        return np.linalg.lstsq(A, inv_temp_values, rcond=None)[0]

    def get_temperature(self) -> float:
        try:
            adc_voltage = self.chan.voltage
            if adc_voltage <= 0: return 0.0
            resistance = self.SERIES_RESISTOR * (self.VREF - adc_voltage) / adc_voltage
            ln_resistance = np.log(resistance)
            temp_kelvin = 1 / (self.coefficients[0] + self.coefficients[1] * ln_resistance + self.coefficients[2] * (ln_resistance ** 3))
            temp_celsius = temp_kelvin - 273.15
            temp_fahrenheit = (temp_celsius + self.TEMP_OFFSET) * 9/5 + 32
            return temp_fahrenheit
        except Exception as e:
            print(f"Error reading temperature: {e}")
            return 0.0

    def set_relay(self, pin: int, state: bool):
        """
        Set relay state. state=True means ON (GPIO.LOW), state=False means OFF (GPIO.HIGH).
        """
        # Safety Interlock: Heater requires Circulation Pump
        if pin == self.HEATER and state is True:
            if not self.get_relay_state(self.CIRC_PUMP):
                print("Safety Violation: Attempted to turn on heater without circulation pump!")
                return False
        
        GPIO.output(pin, GPIO.LOW if state else GPIO.HIGH)
        return True

    def get_relay_state(self, pin: int) -> bool:
        """Returns True if ON (Low), False if OFF (High)"""
        return GPIO.input(pin) == GPIO.LOW

    def get_all_states(self) -> Dict[str, bool]:
        return {
            "circ_pump": self.get_relay_state(self.CIRC_PUMP),
            "heater": self.get_relay_state(self.HEATER),
            "jet_pump": self.get_relay_state(self.JET_PUMP),
            "light": self.get_relay_state(self.LIGHT),
            "ozone": self.get_relay_state(self.OZONE)
        }

    def emergency_shutdown(self):
        """Turn off everything immediately."""
        for pin in self.pins:
            GPIO.output(pin, GPIO.HIGH)
        print("EMERGENCY SHUTDOWN EXECUTED")

    def cleanup(self):
        self.emergency_shutdown()
        GPIO.cleanup()
