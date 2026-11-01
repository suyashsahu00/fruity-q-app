/**
 * ==============================================================================
 * FRUITY Q - USER INTERFACE & NAVIGATION LOGIC
 * ==============================================================================
 * Synchronized with Figma Frame 2:45 & ROS bridge:
 * - Real-time robot status pill ("OFFLINE" vs "ONLINE")
 * - Dynamic Rover card connection states
 * - Module navigation: Home <-> Fruit Picking <-> Sprinkling <-> Logistics
 * - Fruit Picking: Pre-start checklist, start enabled only when all ticked,
 *   status-driven step tracker (Searching -> Aligned -> Gripping -> Cutting -> Picked),
 *   never fakes progress, displays "Waiting for robot", and Cancel button.
 * - Sprinkling: 1 to 5s duration selector, safety confirmation dialog, feedback.
 * - Logistics: Follow-me mode with confirmation dialog, hold-to-move arrow buttons
 *   publishing Twist at 10 Hz only while held down, publish zero on release/leave.
 * - Emergency STOP button handling across all views.
 * ==============================================================================
 */

const UI = {
  currentScreen: "home-screen",
  selectedSprayDuration: CONFIG.SPRAY.DEFAULT_DURATION_SEC,
  isRobotOnline: false,

  // Pending dangerous action confirmation callback
  pendingActionConfirmFn: null,

  init() {
    this.setupSplashScreen();
    this.setupDemoBanner();
    this.setupNavigation();
    this.setupFruitPickingScreen();
    this.setupSprinklingScreen();
    this.setupLogisticsScreen();
    this.setupEmergencyStop();
    this.setupConfirmationModal();
    this.hookROSCallbacks();

    // Set initial connection state to OFFLINE
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
    const cardPicking = document.getElementById("card-nav-picking");
    if (cardPicking) {
      cardPicking.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        this.navigateTo("picking-screen");
      });
    }

    const cardSprinkling = document.getElementById("card-nav-sprinkling");
    if (cardSprinkling) {
      cardSprinkling.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        this.navigateTo("sprinkling-screen");
      });
    }

    const cardLogistics = document.getElementById("card-nav-logistics");
    if (cardLogistics) {
      cardLogistics.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        this.navigateTo("logistics-screen");
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
   * 4. Confirmation Dialog System (For dangerous actions: Spray & Follow-Me)
   */
  setupConfirmationModal() {
    const modal = document.getElementById("action-confirm-modal");
    const btnYes = document.getElementById("btn-confirm-yes");
    const btnNo = document.getElementById("btn-confirm-no");

    if (btnNo) {
      btnNo.addEventListener("click", () => {
        modal.classList.remove("active");
        this.pendingActionConfirmFn = null;
      });
    }

    if (btnYes) {
      btnYes.addEventListener("click", () => {
        modal.classList.remove("active");
        if (typeof this.pendingActionConfirmFn === "function") {
          this.pendingActionConfirmFn();
        }
        this.pendingActionConfirmFn = null;
      });
    }
  },

  showConfirmation(title, message, confirmCallback) {
    const modal = document.getElementById("action-confirm-modal");
    const titleEl = document.getElementById("confirm-modal-title");
    const bodyEl = document.getElementById("confirm-modal-body");

    if (!modal) return;
    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = message;
    this.pendingActionConfirmFn = confirmCallback;
    modal.classList.add("active");
  },

  /**
   * 5. Fruit Picking Screen Logic
   */
  setupFruitPickingScreen() {
    const checkboxes = document.querySelectorAll(".safety-check");
    const btnStart = document.getElementById("btn-start-picking");
    const btnCancel = document.getElementById("btn-cancel-picking");
    const checklistPanel = document.getElementById("checklist-panel");
    const trackerPanel = document.getElementById("tracker-panel");
    const livePickStatus = document.getElementById("live-pick-status");

    // Pre-start checklist: Start enabled ONLY when all 4 are ticked
    const checkChecklistCompletion = () => {
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      if (btnStart) {
        btnStart.disabled = !allChecked || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
      }
    };

    checkboxes.forEach((cb) => {
      cb.addEventListener("change", checkChecklistCompletion);
    });

    // Start Picking
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot start: Robot is OFFLINE!");
          return;
        }

        // Switch view to tracker panel
        checklistPanel.style.display = "none";
        trackerPanel.style.display = "flex";

        // Reset step nodes to default
        this.resetPickingStepTracker();

        // Safety rule: Never fake progress. Show "Waiting for robot" until status message arrives.
        if (livePickStatus) {
          livePickStatus.innerText = "Waiting for robot";
        }

        // Publish start command to ROS
        ROSManager.startPicking();
      });
    }

    // Cancel Picking
    if (btnCancel) {
      btnCancel.addEventListener("click", () => {
        ROSManager.cancelPicking();
        this.showChecklistPanel();
      });
    }
  },

  showChecklistPanel() {
    const checklistPanel = document.getElementById("checklist-panel");
    const trackerPanel = document.getElementById("tracker-panel");
    const livePickStatus = document.getElementById("live-pick-status");

    if (checklistPanel) checklistPanel.style.display = "flex";
    if (trackerPanel) trackerPanel.style.display = "none";
    if (livePickStatus) livePickStatus.innerText = "Waiting for robot";
    this.resetPickingStepTracker();
  },

  resetPickingStepTracker() {
    const steps = ["Searching", "Aligned", "Gripping", "Cutting", "Picked"];
    steps.forEach((step) => {
      const node = document.getElementById(`step-node-${step}`);
      if (node) {
        node.className = "step-node";
      }
    });
  },

  /**
   * Update Fruit Picking Step Tracker driven ONLY by robot's status topic
   */
  updatePickingStep(stepName) {
    const livePickStatus = document.getElementById("live-pick-status");
    if (livePickStatus) {
      livePickStatus.innerText = stepName;
    }

    const steps = ["Searching", "Aligned", "Gripping", "Cutting", "Picked"];
    const targetIndex = steps.indexOf(stepName);

    if (targetIndex >= 0) {
      steps.forEach((step, idx) => {
        const node = document.getElementById(`step-node-${step}`);
        if (!node) return;
        if (idx < targetIndex) {
          node.className = "step-node completed";
        } else if (idx === targetIndex) {
          node.className = "step-node active";
        } else {
          node.className = "step-node";
        }
      });
    } else if (stepName === "Cancelled" || stepName === "IDLE") {
      this.showChecklistPanel();
    }
  },

  /**
   * 6. Sprinkling Screen Setup
   */
  setupSprinklingScreen() {
    const durationContainer = document.getElementById("duration-selector-container");
    const btnSpray = document.getElementById("btn-trigger-spray");

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

    // "Trigger Spray" Button click -> Dangerous action: Requires Confirmation Dialog
    if (btnSpray) {
      btnSpray.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot spray: Robot is OFFLINE!");
          return;
        }

        this.showConfirmation(
          "Confirm Spray",
          `Ensure humans and animals are clear of the nozzle path.<br><br>Activate spray for <strong>${this.selectedSprayDuration} second(s)</strong>?`,
          () => {
            this.executeSpray(this.selectedSprayDuration);
          }
        );
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
   * 7. Logistics Screen Setup
   */
  setupLogisticsScreen() {
    const toggleFollowMe = document.getElementById("toggle-follow-me");
    const teleopButtons = document.querySelectorAll(".btn-teleop");

    // Follow-Me Toggle: Dangerous action -> requires confirmation dialog
    if (toggleFollowMe) {
      toggleFollowMe.addEventListener("change", (e) => {
        const wantsToEnable = toggleFollowMe.checked;

        if (wantsToEnable) {
          // Temporarily uncheck until confirmed
          toggleFollowMe.checked = false;

          this.showConfirmation(
            "Enable Follow-Me Mode?",
            "The robot will track and follow human targets autonomously. Ensure path is clear of obstacles.",
            () => {
              toggleFollowMe.checked = true;
              ROSManager.setFollowMe(true);
            }
          );
        } else {
          ROSManager.setFollowMe(false);
        }
      });
    }

    // Teleop buttons: Publish Twist at 10 Hz ONLY while held; publish zero on release
    teleopButtons.forEach((btn) => {
      const linear = parseFloat(btn.getAttribute("data-linear") || "0");
      const angular = parseFloat(btn.getAttribute("data-angular") || "0");

      const handlePress = (e) => {
        e.preventDefault();
        btn.classList.add("active-holding");
        ROSManager.startTeleop(linear, angular);
      };

      const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove("active-holding");
        ROSManager.stopTeleop();
      };

      // Mouse events
      btn.addEventListener("mousedown", handlePress);
      btn.addEventListener("mouseup", handleRelease);
      btn.addEventListener("mouseleave", handleRelease);

      // Touch events (mobile)
      btn.addEventListener("touchstart", handlePress, { passive: false });
      btn.addEventListener("touchend", handleRelease, { passive: false });
      btn.addEventListener("touchcancel", handleRelease, { passive: false });
    });
  },

  /**
   * 8. Fixed Emergency STOP Button
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
        alert("EMERGENCY STOP ACTIVATED!\nAll motors, teleop movement and spray pumps halted immediately.");
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
   * 9. Hook ROS Manager callbacks
   */
  hookROSCallbacks() {
    ROSManager.onConnectionChange = (isOnline) => {
      this.updateOnlineStatus(isOnline);
    };

    ROSManager.onEStopChange = (isEStopped) => {
      const btnSpray = document.getElementById("btn-trigger-spray");
      const btnStartPick = document.getElementById("btn-start-picking");
      if (btnSpray) btnSpray.disabled = isEStopped || !this.isRobotOnline;
      if (btnStartPick) btnStartPick.disabled = isEStopped || !this.isRobotOnline;
    };

    ROSManager.onPickStateChange = (stateName) => {
      this.updatePickingStep(stateName);
    };
  },

  /**
   * Update Status Pill, Rover Card, Module Badges & Locked state
   */
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;

    // Header Pill
    const pill = document.getElementById("robot-status-pill");
    const statusText = document.getElementById("robot-status-text");
    if (pill && statusText) {
      if (isOnline) {
        pill.className = "global-connection-state online";
        statusText.innerText = "ONLINE";
      } else {
        pill.className = "global-connection-state";
        statusText.innerText = "OFFLINE";
      }
    }

    // Rover Card Details
    const roverStatus = document.getElementById("rover-status");
    const roverSubstatus = document.getElementById("rover-substatus");
    const connectionIndicator = document.getElementById("connection-indicator");
    const connectionDetail = document.getElementById("connection-detail");

    if (roverStatus && roverSubstatus && connectionIndicator && connectionDetail) {
      if (isOnline) {
        roverStatus.innerText = "Connected";
        roverSubstatus.innerText = "Autonomous rover ready for operations";
        connectionIndicator.className = "connection-indicator online";
        connectionDetail.innerText = "Rover is connected";
      } else {
        roverStatus.innerText = "Awaiting connection";
        roverSubstatus.innerText = "Connect to enable autonomous control";
        connectionIndicator.className = "connection-indicator";
        connectionDetail.innerText = "Rover is currently offline";
      }
    }

    // Guidance Card
    const guidanceCard = document.getElementById("guidance-card");
    if (guidanceCard) {
      guidanceCard.style.display = isOnline ? "none" : "flex";
    }

    // Module Cards Locked/Ready State
    const moduleCards = document.querySelectorAll(".module-card");
    const badges = [
      document.getElementById("badge-picking"),
      document.getElementById("badge-sprinkling"),
      document.getElementById("badge-logistics")
    ];

    moduleCards.forEach((card) => {
      if (isOnline || CONFIG.MOCK_MODE) {
        card.classList.remove("locked");
      } else {
        card.classList.add("locked");
      }
    });

    badges.forEach((badge) => {
      if (!badge) return;
      const label = badge.querySelector(".badge-label");
      if (isOnline) {
        badge.className = "module-badge ready";
        if (label) label.innerText = "READY";
      } else {
        badge.className = "module-badge";
        if (label) label.innerText = "LOCKED";
      }
    });

    // Check pre-start button state
    const checkboxes = document.querySelectorAll(".safety-check");
    const btnStart = document.getElementById("btn-start-picking");
    if (btnStart) {
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      btnStart.disabled = !allChecked || (!isOnline && !CONFIG.MOCK_MODE);
    }

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
