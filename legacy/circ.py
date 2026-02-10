#!/usr/bin/env python3

import busio
import digitalio
import board
import time
import numpy as np
import RPi.GPIO as GPIO
import adafruit_mcp3xxx.mcp3008 as MCP
from adafruit_mcp3xxx.analog_in import AnalogIn

#
# List of GPIO outputs
#
#gpio_outputs = [4, 27, 22, 5, 6, 26, 23, 24]
gpio_outputs = [4, 27, 22, 5, 6]
circ_pump = 22
heater = 4
jet_pump = 27
light = 5
ozone = 6

#
# Functions
#

# Function to control the relay
def control_relay(gpio_output):
    GPIO.output(gpio_output, GPIO.LOW) # Activate the relay

def relay_off(gpio_output):
    GPIO.output(gpio_output, GPIO.HIGH) # Deactivate the relay
#
# Init
#

# Set up the GPIO mode and warnings
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up the GPIO pins as outputs and set them to HIGH (relay off)
for output in gpio_outputs:
    GPIO.setup(output, GPIO.OUT)
    GPIO.output(output, GPIO.HIGH)

#
# Begin cycle
#

# Turn on circ pump
control_relay(circ_pump)


# Turn on ozone
control_relay(ozone)

