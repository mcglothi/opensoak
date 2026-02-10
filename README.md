# OpenSoak 🛁

OpenSoak is a modern, open-source hot tub control system designed to run on a Raspberry Pi. It replaces traditional hardware controllers with a safety-first Python engine, a robust FastAPI REST API, and a beautiful React-based web dashboard.

![OpenSoak Dashboard](https://raw.githubusercontent.com/mcglothi/opensoak/main/frontend/public/vite.svg) *(Replace with actual screenshot later)*

## 🚀 Features

-   **Safety-First Design:** 
    -   **Heater Interlock:** Hardware-level logic ensures the heater only runs when the circulation pump is active.
    -   **High-Temp Cutoff:** Automatic emergency shutdown if the water exceeds safe limits.
-   **Modern Web UI:** A responsive, dark-mode dashboard built with React and Tailwind CSS.
-   **REST API:** Control your tub from anywhere—perfect for mobile apps or Home Assistant integration.
-   **Native Scheduler:** Set heating windows and target temperatures directly in the app (no more messy cron jobs).
-   **Historical Logging:** Track and visualize temperature trends over time.

## 🛠 Hardware Support

Built for:
-   **Raspberry Pi** (Any model with GPIO)
-   **8-Channel Relay Board** (Active Low)
-   **MCP3008 ADC** for high-precision temperature sensing via thermistors.
-   **10k Thermistor** using Steinhart-Hart coefficients for accuracy.

## 📦 Installation

### 1. Clone the repository
```bash
git clone https://github.com/mcglothi/opensoak.git
cd opensoak
```

### 2. Automated Setup
Run the setup script to create a Python virtual environment and install all dependencies:
```bash
./scripts/setup.sh
```

### 3. Configuration
Edit `backend/.env` to match your specific GPIO pinout and temperature thresholds.

### 4. Run Development Servers
```bash
./scripts/start.sh
```
Access the dashboard at `http://<your-pi-ip>:5173` and the API docs at `http://<your-pi-ip>:8000/docs`.

## 🛡 Safety Warning

**Use at your own risk.** Controlling high-voltage hot tub equipment (heaters, pumps) is inherently dangerous. This software is provided "as is" without warranty. Always use a GFCI breaker and consult a qualified electrician when wiring your hot tub controller.

## 📄 License

MIT