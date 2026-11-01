/**
 * ==============================================================================
 * FRUITY Q - USER INTERFACE & NAVIGATION LOGIC
 * ==============================================================================
 * Manages:
 * - Splash screen timeout (1.2 seconds)
 * - Navigation between Home, Sprinkling, Fruit Picking, Logistics
 * - Duration selector for Sprinkling (1 to 5 seconds)
 * - Confirmation dialog before triggering the spray
 * - Real-time robot ONLINE / OFFLINE pill status update with Lucide Wifi icons
 * - Card Live Status Chips (Ready / Offline / Busy)
 * - Fixed STOP button event handling & state updates
 * ==============================================================================
 */

const ICONS = {
  wifi: `<svg class="lucide-icon-sm" viewBox="0 0 24 24"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>`,
  wifiOff: `<svg class="lucide-icon-sm" viewBox="0 0 24 24"><line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 13a10 10 0 0 1 5.24-2.76"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>`,
  stop: `<svg class="lucide-icon" viewBox="0 0 24 24"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  check: `<svg class="lucide-icon-sm" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`,
  droplets: `<svg class="lucide-icon-sm" viewBox="0 0 24 24"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`
};

const UI = {
  currentScreen: "home-screen",
  selectedSprayDuration: CONFIG.SPRAY.DEFAULT_DURATION_SEC,
  isRobotOnline: false,

  init() {
    this.setupSplashScreen();
    this.setupDemoBanner();
    this.setupNavigation();
    this.setupSprinklingScreen();
    this.setupEmergencyStop();
    this.hookROSCallbacks();

    // Initialize button states
    this.updateOnlineStatus(false);
  },

  /**
   * 1. Splash Screen
   * Shows the splash branding for 1.2s then fades away
   */
  setupSplashScreen() {
    const splash = document.getElementById("splash-screen");
    if (!splash) return;

    window.addEventListener("load", () => {
      setTimeout(() => {
        splash.classList.add("hidden");
      }, 1200);
    });
  },

  /**
   * 2. Demo Banner
   * Displays persistent yellow banner if CONFIG.MOCK_MODE is enabled
   */
  setupDemoBanner() {
    const banner = document.getElementById("demo-banner");
    if (banner && CONFIG.MOCK_MODE) {
      banner.classList.add("active");
    }
  },

  /**
   * 3. Navigation between screens
   */
  setupNavigation() {
    // Nav cards on Home
    const cardSprinkling = document.getElementById("card-nav-sprinkling");
    if (cardSprinkling) {
      cardSprinkling.addEventListener("click", () => {
        this.navigateTo("sprinkling-screen");
      });
    }

    const cardPicking = document.getElementById("card-nav-picking");
    if (cardPicking) {
      cardPicking.addEventListener("click", () => {
        alert("Fruit Picking module will be enabled in the next phase.");
      });
    }

    const cardLogistics = document.getElementById("card-nav-logistics");
    if (cardLogistics) {
      cardLogistics.addEventListener("click", () => {
        alert("Logistics module will be enabled in the next phase.");
      });
    }

    // Back buttons
    document.querySelectorAll(".btn-back").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target") || "home-screen";
        this.navigateTo(target);
      });
    });
  },

  navigateTo(screenId) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.classList.add("active");
      this.currentScreen = screenId;
      window.scrollTo(0, 0);
    }
  },

  /**
   * 4. Sprinkling Screen Setup
   */
  setupSprinklingScreen() {
    const durationContainer = document.getElementById("duration-selector-container");
    const btnSpray = document.getElementById("btn-trigger-spray");
    const confirmModal = document.getElementById("spray-confirm-modal");
    const btnConfirmYes = document.getElementById("btn-spray-confirm-yes");
    const btnConfirmNo = document.getElementById("btn-spray-confirm-no");
    const confirmDurationText = document.getElementById("confirm-spray-duration-text");

    if (!durationContainer) return;

    // Render 1 to 5 seconds duration buttons dynamically based on CONFIG
    durationContainer.innerHTML = "";
    for (let i = CONFIG.SPRAY.MIN_DURATION_SEC; i <= CONFIG.SPRAY.MAX_DURATION_SEC; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn-duration ${i === this.selectedSprayDuration ? "selected" : ""}`;
      btn.innerHTML = `${i}<span class="unit">sec</span>`;
      btn.addEventListener("click", () => {
        this.selectedSprayDuration = i;
        document.querySelectorAll(".btn-duration").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      durationContainer.appendChild(btn);
    }

    // "Spray Now" Button click -> Open confirmation dialog
    if (btnSpray) {
      btnSpray.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot spray: Robot is OFFLINE!");
          return;
        }
        if (confirmDurationText) {
          confirmDurationText.innerText = `${this.selectedSprayDuration} second(s)`;
        }
        confirmModal.classList.add("active");
      });
    }

    // Modal Cancel
    if (btnConfirmNo) {
      btnConfirmNo.addEventListener("click", () => {
        confirmModal.classList.remove("active");
      });
    }

    // Modal Confirm -> Publish to ROS
    if (btnConfirmYes) {
      btnConfirmYes.addEventListener("click", () => {
        confirmModal.classList.remove("active");
        this.executeSpray(this.selectedSprayDuration);
      });
    }
  },

  executeSpray(duration) {
    const sprayFeedback = document.getElementById("spray-feedback");
    const sprayFeedbackText = document.getElementById("spray-feedback-text");
    const btnSpray = document.getElementById("btn-trigger-spray");
    const chipSprinkling = document.getElementById("chip-sprinkling");

    // Disable button during spray cycle
    if (btnSpray) btnSpray.disabled = true;

    // Mark chip as busy
    if (chipSprinkling) {
      chipSprinkling.className = "live-status-chip chip-busy";
      chipSprinkling.innerText = "Busy";
    }

    // Feedback UI update
    if (sprayFeedback) {
      sprayFeedback.className = "status-callout spraying";
      if (sprayFeedbackText) {
        sprayFeedbackText.innerText = `Spraying in progress... (${duration}s)`;
      }
    }

    // Send ROS message
    ROSManager.triggerSpray(duration);

    // Reset feedback after duration finishes
    setTimeout(() => {
      if (sprayFeedback) {
        sprayFeedback.className = "status-callout success";
        sprayFeedback.innerHTML = `${ICONS.check} <span id="spray-feedback-text">Sprayed for ${duration} s</span>`;
      }
      if (btnSpray && (this.isRobotOnline || CONFIG.MOCK_MODE)) {
        btnSpray.disabled = false;
      }
      // Return chip to ready
      if (chipSprinkling && (this.isRobotOnline || CONFIG.MOCK_MODE)) {
        chipSprinkling.className = "live-status-chip chip-ready";
        chipSprinkling.innerText = "Ready";
      }
    }, duration * 1000);
  },

  /**
   * 5. Fixed Emergency STOP Button
   */
  setupEmergencyStop() {
    const btnStop = document.getElementById("btn-global-stop");
    const btnStopText = document.getElementById("btn-stop-text");
    if (!btnStop) return;

    btnStop.addEventListener("click", () => {
      if (!ROSManager.isEStopped) {
        // Trigger STOP
        ROSManager.triggerEmergencyStop();
        btnStop.classList.add("active-stopped");
        if (btnStopText) btnStopText.innerText = "RESUME E-STOP";
        alert("EMERGENCY STOP ACTIVATED!\nAll motors and pumps have been signaled to halt immediately.");
      } else {
        // Reset STOP
        const confirmReset = confirm("Are you sure you want to release Emergency Stop?");
        if (confirmReset) {
          ROSManager.resetEmergencyStop();
          btnStop.classList.remove("active-stopped");
          if (btnStopText) btnStopText.innerText = "STOP";
        }
      }
    });
  },

  /**
   * 6. Hook ROS Manager callbacks for real-time status & button locking
   */
  hookROSCallbacks() {
    ROSManager.onConnectionChange = (isOnline) => {
      this.updateOnlineStatus(isOnline);
    };

    ROSManager.onEStopChange = (isEStopped) => {
      const btnSpray = document.getElementById("btn-trigger-spray");
      if (btnSpray) {
        btnSpray.disabled = isEStopped || !this.isRobotOnline;
      }
    };
  },

  /**
   * Update Status Pill, Live Status Chips and enable/disable action buttons
   */
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;
    const pill = document.getElementById("robot-status-pill");
    const statusText = document.getElementById("robot-status-text");
    const statusIcon = document.getElementById("robot-status-icon");
    const btnSpray = document.getElementById("btn-trigger-spray");
    const actionCards = document.querySelectorAll(".action-card");

    const chipPicking = document.getElementById("chip-picking");
    const chipSprinkling = document.getElementById("chip-sprinkling");
    const chipLogistics = document.getElementById("chip-logistics");

    if (pill && statusText && statusIcon) {
      if (isOnline) {
        pill.className = "status-pill online";
        statusText.innerText = "ONLINE";
        statusIcon.innerHTML = ICONS.wifi;
      } else {
        pill.className = "status-pill";
        statusText.innerText = "OFFLINE";
        statusIcon.innerHTML = ICONS.wifiOff;
      }
    }

    // Update Live Status Chips on Cards
    const statusChipClass = isOnline ? "live-status-chip chip-ready" : "live-status-chip chip-offline";
    const statusChipLabel = isOnline ? "Ready" : "Offline";

    if (chipPicking) {
      chipPicking.className = statusChipClass;
      chipPicking.innerText = statusChipLabel;
    }
    if (chipSprinkling) {
      chipSprinkling.className = statusChipClass;
      chipSprinkling.innerText = statusChipLabel;
    }
    if (chipLogistics) {
      chipLogistics.className = statusChipClass;
      chipLogistics.innerText = statusChipLabel;
    }

    // Disable action buttons when robot is OFFLINE
    if (btnSpray) {
      btnSpray.disabled = !isOnline && !CONFIG.MOCK_MODE;
    }

    actionCards.forEach((card) => {
      if (isOnline || CONFIG.MOCK_MODE) {
        card.classList.remove("disabled");
      } else {
        card.classList.add("disabled");
      }
    });
  }
};

// Start UI after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  UI.init();
  ROSManager.init();
});
