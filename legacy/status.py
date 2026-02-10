#!/usr/bin/env python3

import RPi.GPIO as GPIO

# Set GPIO mode and warnings
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Define the GPIO pins
gpio_outputs = [4, 27, 22, 5, 6]
circ_pump = 22
heater = 4
jet_pump = 27
light = 5
ozone = 6

# Read and print the status of each GPIO pin
print("GPIO Pin Status:")
pin_names = {
    circ_pump: "circ_pump",
    heater: "heater",
    jet_pump: "jet_pump",
    light: "light",
    ozone: "ozone"
}

for pin in gpio_outputs:
    GPIO.setup(pin, GPIO.OUT)  # Set pin as output
    pin_name = pin_names.get(pin, f"Pin {pin}")
    if GPIO.gpio_function(pin) == GPIO.OUT:
        status = GPIO.input(pin)
    else:
        status = GPIO.input(pin)
    state = 'Off' if status else 'On'
    print(f"{pin_name}: {state}")

