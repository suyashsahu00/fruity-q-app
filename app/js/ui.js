/**
 * ==============================================================================
 * FRUITY Q - USER INTERFACE & NAVIGATION LOGIC
 * ==============================================================================
 * Manages:
 * - Splash screen timeout (1.2 seconds)
 * - Navigation between Home, Sprinkling, Fruit Picking, Logistics
 * - Duration selector for Sprinkling (1 to 5 seconds)
 * - Confirmation dialog before triggering the spray
 * - Real-time robot ONLINE / OFFLINE pill status update
 * - Rover connection state ("Awaiting connection" / "Connected")
 * - Module Card States ("LOCKED" vs "READY")
 * - Reconnect notice banner visibility
 * - Fixed STOP button event handling & state updates
 * ==============================================================================
 */

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

    // Initialize button & connection states
    this.updateOnlineStatus(false);
  },

  /**
   * 1. Splash Screen
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
    const cardSprinkling = document.getElementById("card-nav-sprinkling");
    if (cardSprinkling) {
      cardSprinkling.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        this.navigateTo("sprinkling-screen");
      });
    }

    const cardPicking = document.getElementById("card-nav-picking");
    if (cardPicking) {
      cardPicking.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        alert("Fruit Picking module will be enabled in the next phase.");
      });
    }

    const cardLogistics = document.getElementById("card-nav-logistics");
    if (cardLogistics) {
      cardLogistics.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        alert("Logistics module will be enabled in the next phase.");
      });
    }

    // Back buttons
    document.querySelectorAll(".btn-screen-back").forEach((btn) => {
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

    // Render 1 to 5 seconds duration buttons
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

    // Spray Button click
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

    // Modal Confirm
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

    if (btnSpray) btnSpray.disabled = true;

    if (sprayFeedback) {
      sprayFeedback.className = "status-callout spraying";
      if (sprayFeedbackText) {
        sprayFeedbackText.innerText = `Spraying in progress... (${duration}s)`;
      }
    }

    // Send ROS message
    ROSManager.triggerSpray(duration);

    setTimeout(() => {
      if (sprayFeedback) {
        sprayFeedback.className = "status-callout success";
        if (sprayFeedbackText) {
          sprayFeedbackText.innerText = `Sprayed for ${duration} s`;
        }
      }
      if (btnSpray && (this.isRobotOnline || CONFIG.MOCK_MODE)) {
        btnSpray.disabled = false;
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
        ROSManager.triggerEmergencyStop();
        btnStop.classList.add("active-stopped");
        if (btnStopText) btnStopText.innerText = "RESUME E-STOP";
        alert("EMERGENCY STOP ACTIVATED!\nAll motors and pumps have been signaled to halt immediately.");
      } else {
        const confirmReset = confirm("Are you sure you want to release Emergency Stop?");
        if (confirmReset) {
          ROSManager.resetEmergencyStop();
          btnStop.classList.remove("active-stopped");
          if (btnStopText) btnStopText.innerText = "EMERGENCY STOP";
        }
      }
    });
  },

  /**
   * 6. Hook ROS Manager callbacks
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
   * Update Status Pill, Rover Card, Module Chips & Locked state
   */
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;

    // Header Pill
    const pill = document.getElementById("robot-status-pill");
    const statusText = document.getElementById("robot-status-text");
    if (pill && statusText) {
      if (isOnline) {
        pill.className = "status-pill online";
        statusText.innerText = "ONLINE";
      } else {
        pill.className = "status-pill";
        statusText.innerText = "OFFLINE";
      }
    }

    // Rover Card Details
    const roverHeading = document.getElementById("rover-status-heading");
    const roverDesc = document.getElementById("rover-status-desc");
    const roverFooterDot = document.getElementById("rover-footer-dot");
    const roverFooterText = document.getElementById("rover-footer-text");

    if (roverHeading && roverDesc && roverFooterDot && roverFooterText) {
      if (isOnline) {
        roverHeading.innerText = "Connected";
        roverDesc.innerText = "Autonomous rover ready for operations";
        roverFooterDot.className = "rover-footer-dot online";
        roverFooterText.innerText = "Rover is connected";
      } else {
        roverHeading.innerText = "Awaiting connection";
        roverDesc.innerText = "Connect to enable autonomous control";
        roverFooterDot.className = "rover-footer-dot";
        roverFooterText.innerText = "Rover is currently offline";
      }
    }

    // Reconnect notice banner
    const noticeReconnect = document.getElementById("notice-reconnect");
    if (noticeReconnect) {
      noticeReconnect.style.display = isOnline ? "none" : "flex";
    }

    // Module Cards Locked/Ready State
    const moduleCards = document.querySelectorAll(".module-card");
    const chips = [
      document.getElementById("chip-picking"),
      document.getElementById("chip-sprinkling"),
      document.getElementById("chip-logistics")
    ];

    moduleCards.forEach((card) => {
      if (isOnline || CONFIG.MOCK_MODE) {
        card.classList.remove("locked");
      } else {
        card.classList.add("locked");
      }
    });

    chips.forEach((chip) => {
      if (!chip) return;
      const label = chip.querySelector(".chip-label");
      if (isOnline) {
        chip.className = "chip-state ready";
        if (label) label.innerText = "READY";
      } else {
        chip.className = "chip-state";
        if (label) label.innerText = "LOCKED";
      }
    });

    // Spray Button
    const btnSpray = document.getElementById("btn-trigger-spray");
    if (btnSpray) {
      btnSpray.disabled = !isOnline && !CONFIG.MOCK_MODE;
    }
  }
};

// Start UI after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  UI.init();
  ROSManager.init();
});
