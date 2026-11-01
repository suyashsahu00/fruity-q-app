/**
 * ==============================================================================
 * FRUITY Q - USER INTERFACE & NAVIGATION LOGIC
 * ==============================================================================
 * Manages:
 * - Splash screen timeout (1.5 seconds)
 * - Navigation between Home, Sprinkling, Fruit Picking, Logistics
 * - Duration selector for Sprinkling (1 to 5 seconds)
 * - Confirmation dialog before triggering the spray
 * - Real-time robot ONLINE / OFFLINE pill status update
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
        // Will be expanded in next phase per instructions
        alert("Fruit Picking module will be enabled in the next phase.");
      });
    }

    const cardLogistics = document.getElementById("card-nav-logistics");
    if (cardLogistics) {
      cardLogistics.addEventListener("click", () => {
        // Will be expanded in next phase per instructions
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
    const sprayFeedback = document.getElementById("spray-feedback");
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
    const btnSpray = document.getElementById("btn-trigger-spray");

    // Disable button during spray cycle
    if (btnSpray) btnSpray.disabled = true;

    // Feedback UI update
    if (sprayFeedback) {
      sprayFeedback.className = "status-callout spraying";
      sprayFeedback.innerHTML = `<span>💦</span> Spraying in progress... (${duration}s)`;
    }

    // Send ROS message
    ROSManager.triggerSpray(duration);

    // Reset feedback after duration finishes
    setTimeout(() => {
      if (sprayFeedback) {
        sprayFeedback.className = "status-callout success";
        sprayFeedback.innerHTML = `<span>✅</span> Sprayed for ${duration} s`;
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
    if (!btnStop) return;

    btnStop.addEventListener("click", () => {
      if (!ROSManager.isEStopped) {
        // Trigger STOP
        ROSManager.triggerEmergencyStop();
        btnStop.classList.add("active-stopped");
        btnStop.innerHTML = "<span>⚠️</span> RESUME / RESET E-STOP";
        alert("EMERGENCY STOP ACTIVATED!\nAll motors and pumps have been signaled to halt immediately.");
      } else {
        // Reset STOP
        const confirmReset = confirm("Are you sure you want to release Emergency Stop?");
        if (confirmReset) {
          ROSManager.resetEmergencyStop();
          btnStop.classList.remove("active-stopped");
          btnStop.innerHTML = "<span>🛑</span> EMERGENCY STOP";
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
   * Update Status Pill and enable/disable action buttons
   */
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;
    const pill = document.getElementById("robot-status-pill");
    const statusText = document.getElementById("robot-status-text");
    const btnSpray = document.getElementById("btn-trigger-spray");
    const actionCards = document.querySelectorAll(".action-card");

    if (pill && statusText) {
      if (isOnline) {
        pill.className = "status-pill online";
        statusText.innerText = "ONLINE";
      } else {
        pill.className = "status-pill";
        statusText.innerText = "OFFLINE";
      }
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
