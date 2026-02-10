#!/usr/bin/env python3

import os
import busio
import digitalio
import board
import time
import numpy as np
import RPi.GPIO as GPIO
import adafruit_mcp3xxx.mcp3008 as MCP
from adafruit_mcp3xxx.analog_in import AnalogIn
import argparse
import datetime

# Hysteresis thresholds
upper_threshold = 106.5  # Temperature to turn off the heater
lower_threshold = 105.0  # Temperature to turn on the heater

# Variables to track temperature readings
last_valid_temp = None
readings_ignored = 0
max_diff = 3.0  # Maximum allowed difference in consecutive readings
ignore_initial_readings = 5  # Number of initial readings to ignore

# Functions
def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

def adc_to_voltage(adc_value, vref=3.3, resolution=1024):
    return (adc_value / resolution) * vref

def voltage_to_resistance(voltage, series_resistor, vref=3.3):
    if voltage == 0:
        return float("inf")
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

def control_relay(gpio_output):
    GPIO.output(gpio_output, GPIO.LOW)  # Activate the relay

def relay_off(gpio_output):
    GPIO.output(gpio_output, GPIO.HIGH)  # Deactivate the relay

def convert_time_to_seconds(time_str):
    if time_str == '0':  # No timer specified
        return None
    elif time_str[-1].upper() == 'H':  # Hours
        return int(time_str[:-1]) * 3600
    elif time_str[-1].upper() == 'M':  # Minutes
        return int(time_str[:-1]) * 60
    elif time_str[-1].upper() == 'S':  # Seconds
        return int(time_str[:-1])
    else:
        raise ValueError("Invalid time format. Please specify time as hours (H), minutes (M), or seconds (S).")

def calculate_duration_to_time(time_str):
    now = datetime.datetime.now()
    specified_time = datetime.datetime.strptime(time_str, '%H:%M:%S' if ':' in time_str[2] else '%H:%M')
    specified_time = specified_time.replace(year=now.year, month=now.month, day=now.day)

    if specified_time < now:
        specified_time += datetime.timedelta(days=1)

    return (specified_time - now).total_seconds()

# GPIO setup
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

gpio_outputs = [4, 27, 22, 5, 6]
for output in gpio_outputs:
    GPIO.setup(output, GPIO.OUT)
    GPIO.output(output, GPIO.HIGH)

circ_pump = 22
heater = 4
jet_pump = 27
light = 5
ozone = 6

# SPI setup
spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)
cs = digitalio.DigitalInOut(board.CE0)
mcp = MCP.MCP3008(spi, cs)

chan0 = AnalogIn(mcp, MCP.P0)
chan1 = AnalogIn(mcp, MCP.P1)

# Thermistor setup
series_resistor = 10000
vref = 3.3
temp_values = [6.8, 23.9, 49.0]
r_values = [23300, 10080, 3300]
coefficients = calculate_steinhart_hart_coefficients(temp_values, r_values)
temp_offset = 4
moving_average_window_size = 5
recent_temps_fahrenheit0 = []

# Command line arguments
parser = argparse.ArgumentParser(description='Run the hot tub for a specified duration or until a specific time.')
parser.add_argument('-t', '--time', type=str, help='Duration to run the hot tub (e.g., 2H, 30M, 45S)', default='0')
parser.add_argument('-T', '--terminate_at', type=str, help='Specific time to terminate the program (e.g., 23:00 or 23:00:00)', default=None)
args = parser.parse_args()

if args.terminate_at:
    duration_seconds = calculate_duration_to_time(args.terminate_at)
else:
    duration_seconds = convert_time_to_seconds(args.time)

start_time = time.time()

# Control loop
control_relay(circ_pump)
time.sleep(3)
control_relay(ozone)
control_relay(heater)

while True:
    # Read temperature values
    raw_adc0 = chan0.value
    adc_voltage0 = chan0.voltage
    resistance0 = voltage_to_resistance(adc_voltage0, series_resistor)
    temp_celsius0 = resistance_to_temperature_steinhart_hart(resistance0, coefficients)
    temp_fahrenheit0 = celsius_to_fahrenheit(temp_celsius0, temp_offset)

    # Process the temperature reading
    if readings_ignored < ignore_initial_readings:
        # Increment the counter and skip processing
        readings_ignored += 1
        print(f"Ignoring initial reading: {temp_fahrenheit0:.2f}°F")
    else:
        # Check for large fluctuations
        if last_valid_temp is not None and abs(temp_fahrenheit0 - last_valid_temp) > max_diff:
            print(f"Discarding fluctuating reading: {temp_fahrenheit0:.2f}°F")
        else:
            # Update the last valid temperature
            last_valid_temp = temp_fahrenheit0

    # Update the moving average list
    recent_temps_fahrenheit0.append(temp_fahrenheit0)
    if len(recent_temps_fahrenheit0) > moving_average_window_size:
        recent_temps_fahrenheit0.pop(0)

    # Calculate the moving average
    if len(recent_temps_fahrenheit0) > 0:
        temp_fahrenheit_filtered0 = moving_average(recent_temps_fahrenheit0, moving_average_window_size)[-1]
    else:
        temp_fahrenheit_filtered0 = last_valid_temp  # Use the last valid reading if available

    # Clear the screen for a static display effect
    clear_screen()

    # Display current status
    print(f"Raw Temperature: {temp_fahrenheit0:.2f}°F")
    print(f"Filtered Temperature: {temp_fahrenheit_filtered0:.2f}°F")

    # Check current heater state
    current_heater_state = GPIO.input(heater) == GPIO.LOW

    # Hysteresis control
    if not current_heater_state and temp_fahrenheit_filtered0 < lower_threshold:
        print("Turning heater ON")
        control_relay(heater)
    elif current_heater_state and temp_fahrenheit_filtered0 > upper_threshold:
        print("Turning heater OFF")
        relay_off(heater)

    # Check and display new heater state
    heater_state = "ON" if GPIO.input(heater) == GPIO.LOW else "OFF"
    print(f"Heater state: {heater_state}")

    # Sleep for a specified interval
    time.sleep(1)

    # Check if the program has run for the specified duration
    if duration_seconds is not None:
        current_time = time.time()
        if current_time - start_time >= duration_seconds:
            print("Time reached. Shutting down...")
            for output in gpio_outputs:
                relay_off(output)
            GPIO.cleanup()
            break

    # Handle KeyboardInterrupt for graceful shutdown
    try:
        pass
    except KeyboardInterrupt:
        print("\nCleaning up and exiting...")
        for output in gpio_outputs:
            relay_off(output)
        GPIO.cleanup()
        break

