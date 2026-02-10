#!/usr/bin/env python3

import RPi.GPIO as GPIO
import time

# List of GPIO outputs
gpio_outputs = [4, 27, 22, 5, 6, 26, 23, 24]

# Set up the GPIO mode and warnings
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up the GPIO pins as outputs and set them to HIGH (relay off)
for output in gpio_outputs:
    GPIO.setup(output, GPIO.OUT)
    GPIO.output(output, GPIO.HIGH)

