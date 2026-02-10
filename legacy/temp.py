#!/usr/bin/env python3

import busio
import digitalio
import board
import time
import numpy as np
import os
import adafruit_mcp3xxx.mcp3008 as MCP
from adafruit_mcp3xxx.analog_in import AnalogIn

def adc_to_voltage(adc_value, vref=3.3, resolution=1024):
    return (adc_value / resolution) * vref

def voltage_to_resistance(voltage, series_resistor, vref=3.3):
    return series_resistor * (vref - voltage) / voltage

def resistance_to_temperature_steinhart_hart(resistance, coefficients):
    ln_resistance = np.log(resistance)
    temp_kelvin = 1 / (coefficients[0] + coefficients[1] * ln_resistance + coefficients[2] * (ln_resistance ** 3))
    return temp_kelvin - 273.15  # Convert Kelvin to Celsius

def celsius_to_fahrenheit(celsius, offset=0):
    return (celsius + offset) * 9/5 + 32

def calculate_steinhart_hart_coefficients(temp_values, r_values):
    ln_resistances = np.log(r_values)
    inv_temp_values = 1 / (np.array(temp_values) + 273.15)  # Convert Celsius to Kelvin and take the inverse

    A = np.vstack([np.ones(3), ln_resistances, ln_resistances ** 3]).T
    coefficients = np.linalg.lstsq(A, inv_temp_values, rcond=None)[0]

    return coefficients

def moving_average(values, window_size):
    return np.convolve(values, np.ones(window_size), mode='valid') / window_size

def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

# Setup SPI bus and MCP3008 ADC
spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)
cs = digitalio.DigitalInOut(board.CE0)
mcp = MCP.MCP3008(spi, cs)
chan = AnalogIn(mcp, MCP.P0)

series_resistor = 10000
vref = 3.3
temp_values = [6.8, 23.9, 49.0]
r_values = [23300, 10080, 3300]
coefficients = calculate_steinhart_hart_coefficients(temp_values, r_values)

temp_offset = 4
moving_average_window_size = 5
recent_temps_fahrenheit = []

last_valid_temp = None
max_diff = 3.0  # Maximum allowed difference in consecutive readings
ignored_initial_readings = 5
readings_ignored = 0

while True:
    try:
        raw_adc = chan.value
        adc_voltage = chan.voltage
        resistance = voltage_to_resistance(adc_voltage, series_resistor)
        temp_celsius = resistance_to_temperature_steinhart_hart(resistance, coefficients)
        temp_fahrenheit = celsius_to_fahrenheit(temp_celsius, temp_offset)

        valid_reading = True
        if readings_ignored < ignored_initial_readings:
            readings_ignored += 1
            valid_reading = False
        elif last_valid_temp is not None and abs(temp_fahrenheit - last_valid_temp) > max_diff:
            valid_reading = False

        if valid_reading:
            last_valid_temp = temp_fahrenheit
            recent_temps_fahrenheit.append(temp_fahrenheit)

        clear_screen()
        print('Raw ADC Value:', raw_adc)
        print('ADC Voltage: {:.4f}V'.format(adc_voltage))
        print('Temperature: {:.2f}°F'.format(temp_fahrenheit))

        if len(recent_temps_fahrenheit) >= moving_average_window_size:
            # Start calculating moving average once enough valid readings are gathered
            if len(recent_temps_fahrenheit) > moving_average_window_size:
                recent_temps_fahrenheit.pop(0)
            temp_fahrenheit_filtered = moving_average(recent_temps_fahrenheit, moving_average_window_size)[-1]
            print('Temperature (Filtered): {:.2f}°F'.format(temp_fahrenheit_filtered))
        else:
            print('Gathering initial temperature readings...')

    except ZeroDivisionError:
        print("Sensor disconnected or shorted. Please check the connection.")
    
    time.sleep(2)

