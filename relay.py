import RPi.GPIO as GPIO

# List of GPIO outputs
gpio_outputs = [4, 27, 22, 5, 6, 26, 23, 24]

# Set up the GPIO mode and warnings
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up the GPIO pins as outputs and set them to HIGH (relay off)
for output in gpio_outputs:
    GPIO.setup(output, GPIO.OUT)
    GPIO.output(output, GPIO.HIGH)

# Function to control the relay


def control_relay(gpio_output, state):
    if state.lower() == "on":
        GPIO.output(gpio_output, GPIO.LOW)  # Activate the relay
    elif state.lower() == "off":
        GPIO.output(gpio_output, GPIO.HIGH)  # Deactivate the relay
    else:
        print(f"Invalid state '{state}'. Use 'on' or 'off'.")
