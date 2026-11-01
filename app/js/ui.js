/**
 * ==============================================================================
 * FRUITY Q - USER INTERFACE & NAVIGATION LOGIC
 * ==============================================================================
 * Screens: Home | Fruit Picking (A/B/C) | Sprinkling | Logistics | Settings
 * Safety: STOP on every screen, no fake progress, spray/follow need confirmation.
 * Responsive: Offline notices on every sub-screen, status pills on sub-headers.
 * ==============================================================================
 */

const UI = {
  currentScreen: "home-screen",
  selectedSprayDuration: CONFIG.SPRAY.DEFAULT_DURATION_SEC,
  isRobotOnline: false,
  pendingActionConfirmFn: null,

  // Fruit Picking session state
  pickSessionCount: 0,
  pickTimeoutHandle: null,
  selectedSpeed: "slow", // "slow" or "medium"

  // Spray countdown
  sprayCountdownInterval: null,

  init() {
    this.setupSplashScreen();
    this.setupDemoBanner();
    this.setupNavigation();
    this.setupFruitPickingScreen();
    this.setupSprinklingScreen();
    this.setupLogisticsScreen();
    this.setupSettingsScreen();
    this.setupEmergencyStop();
    this.setupConfirmationModal();
    this.hookROSCallbacks();
    this.updateOnlineStatus(false); // Start OFFLINE
  },

  // --------------------------------------------------------------------------
  // 1. Splash Screen (1.8s CSS-only, once per session, prefers-reduced-motion)
  // --------------------------------------------------------------------------
  setupSplashScreen() {
    const splash = document.getElementById("splash-screen");
    if (!splash) return;

    // Show splash only once per session (sessionStorage inside try/catch)
    let alreadyShown = false;
    try {
      alreadyShown = !!sessionStorage.getItem("fruityq_splash_shown");
    } catch (e) {
      console.warn("[Splash] sessionStorage read error:", e);
    }

    if (alreadyShown) {
      splash.classList.add("hidden");
      splash.style.display = "none";
      return;
    }

    // Mark as shown for the current session
    try {
      sessionStorage.setItem("fruityq_splash_shown", "true");
    } catch (e) {
      console.warn("[Splash] sessionStorage write error:", e);
    }

    // Respect prefers-reduced-motion (skip animation)
    let prefersReduced = false;
    try {
      prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    const displayDuration = prefersReduced ? 50 : 1800; // 1.8 seconds

    setTimeout(() => {
      splash.classList.add("hidden");
      setTimeout(() => {
        splash.style.display = "none";
      }, 400); // Wait for CSS opacity transition to complete
    }, displayDuration);
  },

  // --------------------------------------------------------------------------
  // 2. Demo Banner
  // --------------------------------------------------------------------------
  setupDemoBanner() {
    const banner = document.getElementById("demo-banner");
    if (banner && CONFIG.MOCK_MODE) {
      banner.classList.add("active");
    }
  },

  // --------------------------------------------------------------------------
  // 3. Navigation
  // --------------------------------------------------------------------------
  setupNavigation() {
    // Home screen module cards
    const navMap = {
      "card-nav-picking": "picking-screen",
      "card-nav-sprinkling": "sprinkling-screen",
      "card-nav-logistics": "logistics-screen"
    };

    Object.entries(navMap).forEach(([cardId, screenId]) => {
      const card = document.getElementById(cardId);
      if (!card) return;
      const go = () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) return;
        this.navigateTo(screenId);
      };
      card.addEventListener("click", go);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(); });
    });

    // Settings gear icon on home header
    const btnOpenSettings = document.getElementById("btn-open-settings");
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener("click", () => this.navigateTo("settings-screen"));
    }

    // Back buttons on all sub-screens
    document.querySelectorAll(".btn-back").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target") || "home-screen";
        this.navigateTo(target);
      });
    });

    // Result panel: "Back to Home" and "Pick Another"
    const btnBackHome = document.getElementById("btn-back-home-result");
    if (btnBackHome) {
      btnBackHome.addEventListener("click", () => this.navigateTo("home-screen"));
    }

    const btnPickAnother = document.getElementById("btn-pick-another");
    if (btnPickAnother) {
      btnPickAnother.addEventListener("click", () => {
        this.showChecklistPanel();
      });
    }
  },

  navigateTo(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add("active");
      this.currentScreen = screenId;
      window.scrollTo(0, 0);
    }
    // Show/hide the home header based on current screen
    const homeHeader = document.getElementById("home-header");
    if (homeHeader) {
      homeHeader.style.display = (screenId === "home-screen") ? "" : "none";
    }
  },

  // --------------------------------------------------------------------------
  // 4. Confirmation Dialog (dangerous actions: spray, follow-me)
  // --------------------------------------------------------------------------
  setupConfirmationModal() {
    const modal = document.getElementById("action-confirm-modal");
    const btnNo  = document.getElementById("btn-confirm-no");
    const btnYes = document.getElementById("btn-confirm-yes");

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
    // Close on backdrop click
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
          this.pendingActionConfirmFn = null;
        }
      });
    }
  },

  showConfirmation(title, message, confirmCallback) {
    const modal   = document.getElementById("action-confirm-modal");
    const titleEl = document.getElementById("confirm-modal-title");
    const bodyEl  = document.getElementById("confirm-modal-body");
    if (!modal) return;
    if (titleEl) titleEl.innerText = title;
    if (bodyEl)  bodyEl.innerHTML  = message;
    this.pendingActionConfirmFn = confirmCallback;
    modal.classList.add("active");
  },

  // --------------------------------------------------------------------------
  // 5. Fruit Picking Screen Logic (States A / B / C)
  // --------------------------------------------------------------------------
  setupFruitPickingScreen() {
    const checkboxes     = document.querySelectorAll(".safety-check");
    const btnStart       = document.getElementById("btn-start-picking");
    const btnCancel      = document.getElementById("btn-cancel-picking");
    const checklistPanel = document.getElementById("checklist-panel");
    const trackerPanel   = document.getElementById("tracker-panel");

    // Show distance row only if PICKING.DISTANCE_TOPIC is configured
    const distanceRow = document.getElementById("fruit-distance-row");
    if (distanceRow) {
      distanceRow.style.display = CONFIG.PICKING.DISTANCE_TOPIC ? "flex" : "none";
    }

    // Checklist gating: START only when all 4 ticked (and online)
    const checkAll = () => {
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      if (btnStart) {
        btnStart.disabled = !allChecked || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
      }
    };
    checkboxes.forEach((cb) => cb.addEventListener("change", checkAll));

    if (btnStart) {
      btnStart.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot start: Robot is OFFLINE!");
          return;
        }
        // Show tracker panel
        checklistPanel.style.display = "none";
        trackerPanel.style.display = "flex";
        this.resetPickingStepTracker();

        const livePickStatus = document.getElementById("live-pick-status");
        if (livePickStatus) livePickStatus.innerText = "Waiting for robot";

        // Start timeout timer
        this._startPickTimeout();

        ROSManager.startPicking();
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener("click", () => {
        this._clearPickTimeout();
        ROSManager.cancelPicking();
        this.showChecklistPanel();
      });
    }
  },

  _startPickTimeout() {
    this._clearPickTimeout();
    const timeoutMs = CONFIG.PICKING.TIMEOUT_SEC * 1000;
    this.pickTimeoutHandle = setTimeout(() => {
      // Only trigger if still on tracker panel
      const trackerPanel = document.getElementById("tracker-panel");
      if (trackerPanel && trackerPanel.style.display !== "none") {
        ROSManager.cancelPicking();
        this.showResultPanel(false); // false = failed / timed out
      }
    }, timeoutMs);
  },

  _clearPickTimeout() {
    if (this.pickTimeoutHandle) {
      clearTimeout(this.pickTimeoutHandle);
      this.pickTimeoutHandle = null;
    }
  },

  showChecklistPanel() {
    const checklistPanel = document.getElementById("checklist-panel");
    const trackerPanel   = document.getElementById("tracker-panel");
    const resultPanel    = document.getElementById("result-panel");
    const livePickStatus = document.getElementById("live-pick-status");

    if (checklistPanel) checklistPanel.style.display = "flex";
    if (trackerPanel)   trackerPanel.style.display   = "none";
    if (resultPanel)    resultPanel.style.display     = "none";
    if (livePickStatus) livePickStatus.innerText      = "Waiting for robot";
    this.resetPickingStepTracker();
  },

  showResultPanel(success) {
    const checklistPanel = document.getElementById("checklist-panel");
    const trackerPanel   = document.getElementById("tracker-panel");
    const resultPanel    = document.getElementById("result-panel");
    const iconArea       = document.getElementById("result-icon-area");
    const headline       = document.getElementById("result-headline");
    const counter        = document.getElementById("session-pick-count");

    if (checklistPanel) checklistPanel.style.display = "none";
    if (trackerPanel)   trackerPanel.style.display   = "none";
    if (resultPanel)    resultPanel.style.display     = "flex";

    if (iconArea) {
      iconArea.innerHTML = success
        ? `<div class="result-icon-success">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           </div>`
        : `<div class="result-icon-fail">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </div>`;
    }

    if (headline) {
      headline.innerText = success ? "Picked ✓" : "Failed / Timed out";
    }

    if (success) {
      this.pickSessionCount++;
    }
    if (counter) {
      counter.innerText = this.pickSessionCount;
    }

    // Reset checkboxes for next pick
    document.querySelectorAll(".safety-check").forEach((cb) => { cb.checked = false; });
    const btnStart = document.getElementById("btn-start-picking");
    if (btnStart) btnStart.disabled = true;
  },

  resetPickingStepTracker() {
    ["Searching", "Aligned", "Gripping", "Cutting", "Picked"].forEach((step) => {
      const node = document.getElementById(`step-node-${step}`);
      if (node) node.className = "step-node";
    });
  },

  updatePickingStep(stepName) {
    const livePickStatus = document.getElementById("live-pick-status");
    if (livePickStatus) livePickStatus.innerText = stepName;

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

      // When "Picked" is the final step: clear timeout and show result
      if (stepName === "Picked") {
        this._clearPickTimeout();
        setTimeout(() => { this.showResultPanel(true); }, 600);
      }
    } else if (stepName === "Cancelled" || stepName === "IDLE") {
      this._clearPickTimeout();
      this.showChecklistPanel();
    }
  },

  updatePickDistance(distanceValue) {
    const row = document.getElementById("fruit-distance-row");
    const val = document.getElementById("fruit-distance-value");
    if (row && CONFIG.PICKING.DISTANCE_TOPIC) {
      row.style.display = "flex";
      if (val) val.innerText = distanceValue;
    }
  },

  // --------------------------------------------------------------------------
  // 6. Sprinkling Screen
  // --------------------------------------------------------------------------
  setupSprinklingScreen() {
    const durationContainer = document.getElementById("duration-selector-container");
    const btnSpray = document.getElementById("btn-trigger-spray");

    if (!durationContainer) return;

    // Build duration chips
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

    if (btnSpray) {
      btnSpray.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot spray: Robot is OFFLINE!");
          return;
        }
        this.showConfirmation(
          "Confirm Spray",
          `Ensure humans and animals are clear of the nozzle path.<br><br>Activate spray for <strong>${this.selectedSprayDuration} second(s)</strong>?`,
          () => { this.executeSpray(this.selectedSprayDuration); }
        );
      });
    }
  },

  executeSpray(duration) {
    const sprayFeedback     = document.getElementById("spray-feedback");
    const sprayFeedbackText = document.getElementById("spray-feedback-text");
    const btnSpray          = document.getElementById("btn-trigger-spray");
    const countdownWrapper  = document.getElementById("spray-countdown-wrapper");
    const countdownNumber   = document.getElementById("spray-countdown-number");
    const ringFg            = document.getElementById("spray-ring-fg");

    if (btnSpray) btnSpray.disabled = true;

    if (sprayFeedback) {
      sprayFeedback.style.display = "none"; // hide text callout while ring is showing
    }

    // Show countdown ring
    if (countdownWrapper) countdownWrapper.style.display = "flex";

    // SVG ring: circumference of r=30 is 2*PI*30 ≈ 188.5
    const CIRCUMFERENCE = 188.5;
    if (ringFg) {
      ringFg.style.strokeDashoffset = "0"; // full ring = start
    }
    if (countdownNumber) countdownNumber.innerText = duration;

    // Animate: each second decrease stroke offset
    let remaining = duration;
    this.sprayCountdownInterval = setInterval(() => {
      remaining--;
      if (countdownNumber) countdownNumber.innerText = remaining;
      // Offset grows from 0 to full circumference over 'duration' seconds
      const offset = ((duration - remaining) / duration) * CIRCUMFERENCE;
      if (ringFg) ringFg.style.strokeDashoffset = offset.toFixed(2);

      if (remaining <= 0) {
        clearInterval(this.sprayCountdownInterval);
        this.sprayCountdownInterval = null;
        // Hide ring, show result callout
        if (countdownWrapper) countdownWrapper.style.display = "none";
        if (sprayFeedback) {
          sprayFeedback.style.display = "flex";
          sprayFeedback.className = "status-callout success";
          if (sprayFeedbackText) sprayFeedbackText.innerText = `Sprayed for ${duration} s`;
        }
        if (btnSpray && (this.isRobotOnline || CONFIG.MOCK_MODE)) {
          btnSpray.disabled = false;
        }
      }
    }, 1000);

    // Status: spraying
    if (sprayFeedback) {
      sprayFeedback.style.display = "none";
    }

    ROSManager.triggerSpray(duration);
  },

  // --------------------------------------------------------------------------
  // 7. Logistics Screen
  // --------------------------------------------------------------------------
  setupLogisticsScreen() {
    const toggleFollowMe  = document.getElementById("toggle-follow-me");
    const teleopBtns      = document.querySelectorAll(".btn-teleop");
    const followNotice    = document.getElementById("follow-active-notice");
    const speedBtns       = document.querySelectorAll(".btn-speed");

    // Speed selector
    speedBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        speedBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.selectedSpeed = btn.getAttribute("data-speed") || "slow";
      });
    });

    // Follow-Me Toggle (dangerous action)
    if (toggleFollowMe) {
      toggleFollowMe.addEventListener("change", () => {
        const wantsOn = toggleFollowMe.checked;

        if (wantsOn) {
          toggleFollowMe.checked = false; // revert until confirmed
          this.showConfirmation(
            "Enable Follow-Me Mode?",
            "The robot will track and follow human targets autonomously. Ensure the path is clear of obstacles.",
            () => {
              toggleFollowMe.checked = true;
              ROSManager.setFollowMe(true);
              // Follow ON: disable arrow buttons
              this._setTeleopButtonsEnabled(false);
              if (followNotice) followNotice.style.display = "flex";
            }
          );
        } else {
          ROSManager.setFollowMe(false);
          this._setTeleopButtonsEnabled(true);
          if (followNotice) followNotice.style.display = "none";
        }
      });
    }

    // Teleop D-Pad: hold-to-move, 10 Hz, zero on release
    teleopBtns.forEach((btn) => {
      const linear  = parseFloat(btn.getAttribute("data-linear")  || "0");
      const angular = parseFloat(btn.getAttribute("data-angular") || "0");

      const handlePress = (e) => {
        e.preventDefault();
        if (btn.disabled) return;

        // If Follow-Me is ON, pressing arrow disables follow
        if (toggleFollowMe && toggleFollowMe.checked) {
          toggleFollowMe.checked = false;
          ROSManager.setFollowMe(false);
          this._setTeleopButtonsEnabled(true);
          if (followNotice) followNotice.style.display = "none";
        }

        btn.classList.add("active-holding");
        // Use speed-aware values
        const linearSpeed  = this.selectedSpeed === "medium" ? CONFIG.TELEOP.MEDIUM_LINEAR  : CONFIG.TELEOP.SLOW_LINEAR;
        const angularSpeed = this.selectedSpeed === "medium" ? CONFIG.TELEOP.MEDIUM_ANGULAR : CONFIG.TELEOP.SLOW_ANGULAR;
        ROSManager.startTeleop(linear, angular, linearSpeed, angularSpeed);
      };

      const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove("active-holding");
        ROSManager.stopTeleop();
      };

      btn.addEventListener("mousedown",   handlePress);
      btn.addEventListener("mouseup",     handleRelease);
      btn.addEventListener("mouseleave",  handleRelease);
      btn.addEventListener("touchstart",  handlePress,   { passive: false });
      btn.addEventListener("touchend",    handleRelease, { passive: false });
      btn.addEventListener("touchcancel", handleRelease, { passive: false });
    });

    // Also stop teleop on window blur (e.g. tab switch)
    window.addEventListener("blur",  () => ROSManager.stopTeleop());
    window.addEventListener("visibilitychange", () => {
      if (document.hidden) ROSManager.stopTeleop();
    });
  },

  _setTeleopButtonsEnabled(enabled) {
    document.querySelectorAll(".btn-teleop").forEach((btn) => {
      btn.disabled = !enabled;
      if (!enabled) {
        btn.classList.remove("active-holding");
        ROSManager.stopTeleop();
      }
    });
  },

  // --------------------------------------------------------------------------
  // 8. Settings Screen
  // --------------------------------------------------------------------------
  setupSettingsScreen() {
    const ipInput   = document.getElementById("settings-robot-ip");
    const portInput = document.getElementById("settings-robot-port");
    const btnConn   = document.getElementById("btn-settings-connect");
    const mockToggle = document.getElementById("settings-mock-toggle");

    // Load saved values from localStorage
    try {
      const savedIP   = localStorage.getItem("fruityq_robot_ip");
      const savedPort = localStorage.getItem("fruityq_robot_port");
      if (ipInput && savedIP)   ipInput.value   = savedIP;
      if (portInput && savedPort) portInput.value = savedPort;
      // Reflect current mock mode
      if (mockToggle) mockToggle.checked = CONFIG.MOCK_MODE;
    } catch (e) {
      console.warn("[Settings] localStorage not available:", e);
    }

    // Connect button: save IP/port, rebuild URL, reconnect
    if (btnConn) {
      btnConn.addEventListener("click", () => {
        const ip   = (ipInput   ? ipInput.value.trim()   : "") || CONFIG.ROBOT_IP;
        const port = (portInput ? parseInt(portInput.value, 10) : 0) || CONFIG.ROBOT_PORT;

        try {
          localStorage.setItem("fruityq_robot_ip",   ip);
          localStorage.setItem("fruityq_robot_port", String(port));
        } catch (e) {
          console.warn("[Settings] Could not save to localStorage:", e);
        }

        // Update config runtime values (CONFIG is frozen so we patch via a live var)
        // Since CONFIG is frozen, the only safe way is to update ROBOT_IP/PORT
        // via a temporary wrapper that ROSManager uses. For simplicity, reload.
        alert(`Settings saved.\nReconnecting to ws://${ip}:${port}\n\nThe page will reload.`);
        // Apply before reload using sessionStorage
        try {
          sessionStorage.setItem("fruityq_pending_ip",   ip);
          sessionStorage.setItem("fruityq_pending_port", String(port));
        } catch (e) {}
        window.location.reload();
      });
    }

    // Mock mode toggle: reload to apply
    if (mockToggle) {
      mockToggle.addEventListener("change", () => {
        const newMock = mockToggle.checked;
        try {
          localStorage.setItem("fruityq_mock_mode", newMock ? "1" : "0");
        } catch (e) {}
        alert(`Mock Mode set to ${newMock ? "ON" : "OFF"}.\nThe page will reload.`);
        window.location.reload();
      });
    }
  },

  // --------------------------------------------------------------------------
  // 9. Soft STOP
  // --------------------------------------------------------------------------
  setupEmergencyStop() {
    const btnStop     = document.getElementById("btn-global-stop");
    const btnStopText = document.getElementById("btn-stop-text");
    if (!btnStop) return;

    btnStop.addEventListener("click", () => {
      if (!ROSManager.isEStopped) {
        ROSManager.triggerEmergencyStop();
        btnStop.classList.add("active-stopped");
        if (btnStopText) btnStopText.innerText = "RESUME SOFT STOP";
        alert("SOFT STOP ACTIVATED!\nAll motors, teleop movement and spray pumps halted immediately.");
      } else {
        const confirmReset = confirm("Are you sure you want to release Soft Stop?");
        if (confirmReset) {
          ROSManager.resetEmergencyStop();
          btnStop.classList.remove("active-stopped");
          if (btnStopText) btnStopText.innerText = "SOFT STOP";
        }
      }
    });
  },

  // --------------------------------------------------------------------------
  // 10. Hook ROS Callbacks
  // --------------------------------------------------------------------------
  hookROSCallbacks() {
    ROSManager.onConnectionChange = (isOnline) => {
      this.updateOnlineStatus(isOnline);
    };
    ROSManager.onEStopChange = (isEStopped) => {
      const btnSpray    = document.getElementById("btn-trigger-spray");
      const btnStartPick = document.getElementById("btn-start-picking");
      if (btnSpray)     btnSpray.disabled     = isEStopped || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
      if (btnStartPick) btnStartPick.disabled = isEStopped || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
    };
    ROSManager.onPickStateChange = (stateName) => {
      this.updatePickingStep(stateName);
    };
    ROSManager.onPickDistanceChange = (value) => {
      this.updatePickDistance(value);
    };
  },

  // --------------------------------------------------------------------------
  // 11. Update Online Status (pill, rover card, badges, notices on all screens)
  // --------------------------------------------------------------------------
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;

    // Home header pill
    const pill       = document.getElementById("robot-status-pill");
    const statusText = document.getElementById("robot-status-text");
    if (pill && statusText) {
      pill.className = isOnline ? "global-connection-state online" : "global-connection-state";
      statusText.innerText = isOnline ? "ONLINE" : "OFFLINE";
    }

    // Sub-screen pills (all 3 screens)
    ["picking", "sprinkling", "logistics"].forEach((name) => {
      const subPill = document.getElementById(`${name}-status-pill`);
      if (!subPill) return;
      const dotSpan  = subPill.querySelector(".status-dot");
      const textSpan = subPill.querySelector(".sub-status-text");
      if (isOnline) {
        subPill.className = "sub-status-pill online";
        if (textSpan) textSpan.innerText = "ONLINE";
      } else {
        subPill.className = "sub-status-pill";
        if (textSpan) textSpan.innerText = "OFFLINE";
      }
    });

    // "Robot not connected" notices on sub-screens
    ["picking", "sprinkling", "logistics"].forEach((name) => {
      const notice = document.getElementById(`${name}-offline-notice`);
      if (notice) {
        notice.classList.toggle("visible", !isOnline && !CONFIG.MOCK_MODE);
      }
    });

    // Rover Card (home screen)
    const roverStatus       = document.getElementById("rover-status");
    const roverSubstatus    = document.getElementById("rover-substatus");
    const connIndicator     = document.getElementById("connection-indicator");
    const connDetail        = document.getElementById("connection-detail");
    if (roverStatus && roverSubstatus && connIndicator && connDetail) {
      if (isOnline) {
        roverStatus.innerText    = "Connected";
        roverSubstatus.innerText = "Autonomous rover ready for operations";
        connIndicator.className  = "connection-indicator online";
        connDetail.innerText     = "Rover is connected";
      } else {
        roverStatus.innerText    = "Awaiting connection";
        roverSubstatus.innerText = "Connect to enable autonomous control";
        connIndicator.className  = "connection-indicator";
        connDetail.innerText     = "Rover is currently offline";
      }
    }

    // Guidance card (home)
    const guidanceCard = document.getElementById("guidance-card");
    if (guidanceCard) guidanceCard.style.display = isOnline ? "none" : "flex";

    // Module cards locked/ready
    document.querySelectorAll(".module-card").forEach((card) => {
      const shouldUnlock = isOnline || CONFIG.MOCK_MODE;
      card.classList.toggle("locked", !shouldUnlock);
    });

    // Module badges
    ["picking", "sprinkling", "logistics"].forEach((name) => {
      const badge = document.getElementById(`badge-${name}`);
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

    // Picking start button
    const checkboxes = document.querySelectorAll(".safety-check");
    const btnStart   = document.getElementById("btn-start-picking");
    if (btnStart) {
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      btnStart.disabled = !allChecked || (!isOnline && !CONFIG.MOCK_MODE);
    }

    // Spray button
    const btnSpray = document.getElementById("btn-trigger-spray");
    if (btnSpray && !ROSManager.isEStopped) {
      btnSpray.disabled = !isOnline && !CONFIG.MOCK_MODE;
    }

    // Teleop buttons
    if (!isOnline && !CONFIG.MOCK_MODE) {
      this._setTeleopButtonsEnabled(false);
    } else {
      const followMe = document.getElementById("toggle-follow-me");
      const followIsOn = followMe && followMe.checked;
      this._setTeleopButtonsEnabled(!followIsOn);
    }

    // SOFT STOP subline text:
    // Online: "Emergency: press the red button on the robot"
    // Offline: "Robot not connected: use the red button"
    const stopSubline = document.getElementById("stop-subline");
    if (stopSubline) {
      stopSubline.innerText = isOnline
        ? "Emergency: press the red button on the robot"
        : "Robot not connected: use the red button";
    }
  }
};

// --------------------------------------------------------------------------
// Start UI after DOM is ready
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Apply any pending settings from localStorage before init
  try {
    const pendingIP   = sessionStorage.getItem("fruityq_pending_ip");
    const pendingPort = sessionStorage.getItem("fruityq_pending_port");
    if (pendingIP) {
      sessionStorage.removeItem("fruityq_pending_ip");
      sessionStorage.removeItem("fruityq_pending_port");
      // Store for ROSManager to read at init
      window.__fruityq_override_ip   = pendingIP;
      window.__fruityq_override_port = pendingPort || String(CONFIG.ROBOT_PORT);
    }
  } catch (e) {}

  UI.init();
  ROSManager.init();
});
