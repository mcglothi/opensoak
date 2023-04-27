import busio
import digitalio
import board
import time
import numpy as np
import adafruit_mcp3xxx.mcp3008 as MCP
from adafruit_mcp3xxx.analog_in import AnalogIn

# Create the SPI bus
spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)

# Create the CS (chip select)
cs = digitalio.DigitalInOut(board.CE0)

# Create the MCP object
mcp = MCP.MCP3008(spi, cs)

# Create analog input channels on pins 0 and 1
chan0 = AnalogIn(mcp, MCP.P0)
chan1 = AnalogIn(mcp, MCP.P1)


def read_temperature(sensor, unit='C'):
    # Select the channel based on the sensor argument
    chan = chan0 if sensor == 0 else chan1

    # Read the raw ADC value and voltage
    raw_adc = chan.value
    adc_voltage = chan.voltage

    # Calculate the resistance
    resistance = voltage_to_resistance(adc_voltage, series_resistor)

    # Calculate the temperature in Celsius
    temp_celsius = resistance_to_temperature_steinhart_hart(
        resistance, coefficients)

    # Check if the temperature should be returned in Fahrenheit
    if unit == 'F':
        return celsius_to_fahrenheit(temp_celsius, temp_offset)
    return temp_celsius
