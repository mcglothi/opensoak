import adc
import relay


# Example ADC usage
temp_c = read_temperature(0, 'C')
temp_f = read_temperature(0, 'F')
print('Sensor 1 Temperature: {:.2f}°C'.format(temp_c))
print('Sensor 1 Temperature: {:.2f}°F'.format(temp_f))


# Example usage of the relay function
try:
    control_relay(4, "on")
    control_relay(27, "off")
except KeyboardInterrupt:
    # Clean up when the program is terminated by Ctrl+C
    print("\nCleaning up and exiting...")
    GPIO.cleanup()
