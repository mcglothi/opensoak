# OpenSoak Project Memory

## 🚀 Accomplishments (As of Feb 11, 2026)

### 1. Automated "Bug-to-Deploy" Loop
- **Bug Reporting:** UI dashboard sends issues directly to GitHub via `/api/support/report-bug`.
- **Auto-Fixing:** GitHub Action triggers `scripts/ai_fixer.py` using `google-genai` (Gemini 1.5 Pro/Flash).
- **Pre-Flight Validation:** Agent runs `npm run lint` and `python compileall` before pushing. It attempts self-correction if validation fails.
- **Discord Integration:** Automated notifications sent to the Discord Webhook when a PR is ready for review.
- **Auto-Merge & Close:** Merging the PR automatically closes the issue via "Closes #number" keywords.

### 2. Raspberry Pi Production Environment
- **Architecture:** ARMv7 (32-bit OS) on aarch64 kernel.
- **Runtime:** 
  - **Node.js v20.20.0** (installed via NVM) to support Vite 7 requirements.
  - **Python 3.9** with `libopenblas-dev` and `libatlas-base-dev` installed to support `numpy`.
- **Systemd Services:**
  - `opensoak.service`: Backend FastAPI on port **8000**.
  - `opensoak-frontend.service`: Frontend Vite on port **5173**.
- **Automated Deployment:** GitHub Self-Hosted Runner installed in `/opt/actions-runner`. It triggers a `git reset --hard` and service restart on every merge.

### 3. Networking & Security
- **Dynamic API Base:** `API_BASE` in the UI is now dynamic (`window.location.hostname`), allowing access from any device on the local network (e.g., `http://10.10.169.191:5173`).
- **Sudoers Safety:** Runner has passwordless sudo only for `systemctl restart` of the specific OpenSoak services.

## 🛠️ Hardware Profile
- **ADC:** MCP3008 (SPI).
- **Relays:** Active-Low (GPIO.LOW=ON).
- **Safety Interlock:** Heater/Ozone only engage if Circulation Pump is ON + 5s flow delay.
- **Thermistors:** 10k NTC with 10k series resistor.

## 📝 Ongoing Tasks
- [ ] Add data visualization (charts) for energy usage history.
- [ ] Refine `is_flow_detected()` with actual GPIO-based flow switch logic.
