#!/usr/bin/env python3

from gpiozero import OutputDevice
import time

jet = OutputDevice(27)

# Relays are set to active low, so we need to invert the logic
def relay_on():
    jet.off()
def relay_off():
    jet.on()

start_time = time.time()

# Main loop to cycle through GPIO outputs
while True:
    try:
        # Get the current time
        current_time = time.time()

        # Check if 10 minutes (or 5 seconds for testing) have passed
        if (current_time - start_time) >= 600:
            relay_off()
            print("Time elapsed, exiting...")
            break

        relay_on()

    except KeyboardInterrupt:
        print("\nCleaning up and exiting...")
        relay_off()
        break
