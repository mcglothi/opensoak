#!/usr/bin/env python3

import RPi.GPIO as GPIO
import time

heater = 4

# Set up the GPIO mode and warnings
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up the GPIO pins as outputs
GPIO.setup(heater, GPIO.OUT)

def relay_on(gpio_output):
    GPIO.output(gpio_output, GPIO.LOW) # Activate the relay

# Main loop to cycle through GPIO outputs
relay_on(heater)
GPIO.cleanup()

