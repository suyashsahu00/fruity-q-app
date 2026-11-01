/**
 * ==============================================================================
 * FRUITY Q - PRODUCTION MOBILE UI CONTROLLER
 * ==============================================================================
 * Complete UI controller for autonomous orchard rover application:
 * 1. Dashboard (Orchard Overview)
 * 2. Fruit Picking – Main
 * 3. Fruit Picking – Instructions (5-point protocol checklist)
 * 4. Fruit Picking – Calibration (Full arm auto calibration)
 * 5. Fruit Picking – Manual Movement (Industrial robotic gantry XY)
 * 6. Fruit Picking – Automatic Picking (AI Vision target detection)
 * 7. Sprinkling – Main
 * 8. Sprinkling – Calibration (Nozzle & fluid lines)
 * 9. Sprinkling – Anomaly Detection (Safety obstacle check)
 * 10. Sprinkling – Bucket Selection (Configurable profiles)
 * 11. Sprinkling – Unknown Profile Editor (Human-reviewed custom profile)
 * 12. Logistics – ROS Application Guidance
 * 13. Settings (IP, port, mock toggle)
 * ==============================================================================
 */

const UI = {
  currentScreen: "home-screen",
  isRobotOnline: false,
  pendingActionConfirmFn: null,

  // Sprinkling state
  selectedSprayDuration: CONFIG.SPRAY.DEFAULT_DURATION_SEC,
  sprayCountdownInterval: null,
  activeBucketName: "Bucket 01 (Copper-based)",
  customProfile: null,

  // Gantry Manual XY state
  gantryX: 0.0,
  gantryY: 0.0,
  gantryStep: 5.0, // default 5mm (Small)

  // Calibration timers
  armCalibTimer: null,
  sprayCalibTimer: null,

  // Teleop speed
  selectedTeleopSpeed: "slow",

  init() {
    this.setupSplashScreen();
    this.setupDemoBanner();
    this.setupNavigation();
    this.setupFruitPickingModule();
    this.setupSprinklingModule();
    this.setupLogisticsModule();
    this.setupSettingsScreen();
    this.setupEmergencyStop();
    this.setupConfirmationModal();
    this.hookROSCallbacks();

    // Start in offline state until heartbeat/mock kicks in
    this.updateOnlineStatus(false);
  },

  // ==========================================================================
  // 1. SPLASH SCREEN (1.8s CSS-Only, Once per session, Reduced Motion)
  // ==========================================================================
  setupSplashScreen() {
    const splash = document.getElementById("splash-screen");
    if (!splash) return;

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

    try {
      sessionStorage.setItem("fruityq_splash_shown", "true");
    } catch (e) {
      console.warn("[Splash] sessionStorage write error:", e);
    }

    let prefersReduced = false;
    try {
      prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    const displayDuration = prefersReduced ? 50 : 1800; // 1.8 seconds

    setTimeout(() => {
      splash.classList.add("hidden");
      setTimeout(() => {
        splash.style.display = "none";
      }, 400);
    }, displayDuration);
  },

  // ==========================================================================
  // 2. DEMO MODE BANNER
  // ==========================================================================
  setupDemoBanner() {
    const banner = document.getElementById("demo-banner");
    if (banner && CONFIG.MOCK_MODE) {
      banner.classList.add("active");
    }
  },

  // ==========================================================================
  // 3. NAVIGATION CONTROLLER
  // ==========================================================================
  setupNavigation() {
    // Universal data-nav-target elements
    document.querySelectorAll("[data-nav-target]").forEach((el) => {
      const clickHandler = () => {
        const target = el.getAttribute("data-nav-target");
        if (target) {
          // If locked module card on home screen and offline, block navigation
          if (el.classList.contains("module-card") && el.classList.contains("locked") && !this.isRobotOnline && !CONFIG.MOCK_MODE) {
            return;
          }
          this.navigateTo(target);
        }
      };
      el.addEventListener("click", clickHandler);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          clickHandler();
        }
      });
    });

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

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add("active");
      this.currentScreen = screenId;
      window.scrollTo(0, 0);
    }

    // Toggle home header vs subpage header
    const homeHeader = document.getElementById("home-header");
    if (homeHeader) {
      homeHeader.style.display = (screenId === "home-screen") ? "" : "none";
    }
  },

  // ==========================================================================
  // 4. CONFIRMATION DIALOG (For Dangerous Actions)
  // ==========================================================================
  setupConfirmationModal() {
    const modal = document.getElementById("action-confirm-modal");
    const btnNo = document.getElementById("btn-confirm-no");
    const btnYes = document.getElementById("btn-confirm-yes");

    if (btnNo) {
      btnNo.addEventListener("click", () => {
        if (modal) modal.classList.remove("active");
        this.pendingActionConfirmFn = null;
      });
    }

    if (btnYes) {
      btnYes.addEventListener("click", () => {
        if (modal) modal.classList.remove("active");
        if (typeof this.pendingActionConfirmFn === "function") {
          this.pendingActionConfirmFn();
        }
        this.pendingActionConfirmFn = null;
      });
    }

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
    const modal = document.getElementById("action-confirm-modal");
    const titleEl = document.getElementById("confirm-modal-title");
    const bodyEl = document.getElementById("confirm-modal-body");

    if (!modal) return;
    if (titleEl) titleEl.innerText = title;
    if (bodyEl) bodyEl.innerHTML = message;
    this.pendingActionConfirmFn = confirmCallback;
    modal.classList.add("active");
  },

  // ==========================================================================
  // 5. FRUIT PICKING MODULE (Screens 2, 3, 4, 5, 6)
  // ==========================================================================
  setupFruitPickingModule() {
    // --- Screen 3: Movement Instructions Checklist ---
    const instrCheckboxes = document.querySelectorAll(".instruction-checkbox");
    const btnProceedInstr = document.getElementById("btn-proceed-from-instructions");

    const checkInstrCompletion = () => {
      const allChecked = Array.from(instrCheckboxes).every((cb) => cb.checked);
      if (btnProceedInstr) {
        btnProceedInstr.disabled = !allChecked;
      }
    };
    instrCheckboxes.forEach((cb) => cb.addEventListener("change", checkInstrCompletion));

    // --- Screen 4: Full Arm Calibration ---
    const armCheckboxes = document.querySelectorAll(".arm-calib-check");
    const btnStartArmCalib = document.getElementById("btn-start-arm-calib");
    const armProgressCard = document.getElementById("arm-calib-progress-card");
    const armSuccessCard = document.getElementById("arm-calib-success-card");
    const armBar = document.getElementById("arm-calib-bar");
    const armPct = document.getElementById("arm-calib-pct");
    const armStepText = document.getElementById("arm-calib-step-text");
    const armBadge = document.getElementById("arm-calib-status-badge");

    const checkArmChecklist = () => {
      const allChecked = Array.from(armCheckboxes).every((cb) => cb.checked);
      if (btnStartArmCalib) {
        btnStartArmCalib.disabled = !allChecked || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
      }
    };
    armCheckboxes.forEach((cb) => cb.addEventListener("change", checkArmChecklist));

    if (btnStartArmCalib) {
      btnStartArmCalib.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot calibrate: Rover is OFFLINE!");
          return;
        }

        btnStartArmCalib.disabled = true;
        if (armProgressCard) armProgressCard.style.display = "flex";
        if (armSuccessCard) armSuccessCard.style.display = "none";
        if (armBadge) {
          armBadge.className = "status-badge warning";
          armBadge.innerText = "CALIBRATING";
        }

        const stages = [
          { pct: 25, text: "Checking home sensor reference...", node: "calib-node-1" },
          { pct: 50, text: "Verifying X-axis linear limits...", node: "calib-node-2" },
          { pct: 75, text: "Checking Y-axis movement range...", node: "calib-node-3" },
          { pct: 100, text: "Setting safe parking stance...", node: "calib-node-4" }
        ];

        let stageIdx = 0;
        if (this.armCalibTimer) clearInterval(this.armCalibTimer);

        this.armCalibTimer = setInterval(() => {
          if (stageIdx < stages.length) {
            const st = stages[stageIdx];
            if (armBar) armBar.style.width = `${st.pct}%`;
            if (armPct) armPct.innerText = `${st.pct}%`;
            if (armStepText) armStepText.innerText = st.text;

            for (let i = 1; i <= 4; i++) {
              const nodeEl = document.getElementById(`calib-node-${i}`);
              if (!nodeEl) continue;
              if (i <= stageIdx + 1) {
                nodeEl.className = (i === stageIdx + 1 && st.pct < 100) ? "step-node active" : "step-node completed";
              } else {
                nodeEl.className = "step-node";
              }
            }
            stageIdx++;
          } else {
            clearInterval(this.armCalibTimer);
            this.armCalibTimer = null;
            if (armSuccessCard) armSuccessCard.style.display = "flex";
            if (armBadge) {
              armBadge.className = "status-badge ready";
              armBadge.innerText = "COMPLETED ✓";
            }
          }
        }, 800);
      });
    }

    // --- Screen 5: Manual Movement (Dual Masts Side by Side - Interactive & Draggable) ---
    // State for Arm 1 and Arm 2
    this.gantry1X = 0.0;
    this.gantry1Y = 0.0;
    this.gantry2X = 0.0;
    this.gantry2Y = 0.0;
    this.activeArm = "arm1"; // "arm1", "arm2", or "both"

    const stepChips = document.querySelectorAll(".gantry-panel .btn-speed");
    stepChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        stepChips.forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        this.gantryStep = parseFloat(chip.getAttribute("data-step-val") || "5");
      });
    });

    // Dual Arm Activation State (Left zone or Right zone tap/drag automatically activates that arm)
    const zoneArm1 = document.getElementById("zone-arm1");
    const zoneArm2 = document.getElementById("zone-arm2");

    const syncActiveArmUI = () => {
      if (zoneArm1 && zoneArm2) {
        zoneArm1.classList.toggle("is-active", this.activeArm === "arm1");
        zoneArm2.classList.toggle("is-active", this.activeArm === "arm2");
      }
    };

    if (zoneArm1) {
      zoneArm1.addEventListener("pointerdown", () => {
        this.activeArm = "arm1";
        syncActiveArmUI();
        updateGantryDisplay();
      });
    }
    if (zoneArm2) {
      zoneArm2.addEventListener("pointerdown", () => {
        this.activeArm = "arm2";
        syncActiveArmUI();
        updateGantryDisplay();
      });
    }

    const updateGantryDisplay = () => {
      syncActiveArmUI();
      const readout = document.getElementById("gantry-coords-readout");

      // Arm 1 Elements
      const beam1 = document.getElementById("gantry1-crossbeam");
      const toolhead1 = document.getElementById("gantry1-toolhead");
      const coords1 = document.getElementById("gantry1-coords-sub");
      const dimX1 = document.getElementById("gantry1-dim-x-val");
      const dimY1 = document.getElementById("gantry1-dim-y-val");

      // Arm 2 Elements
      const beam2 = document.getElementById("gantry2-crossbeam");
      const toolhead2 = document.getElementById("gantry2-toolhead");
      const coords2 = document.getElementById("gantry2-coords-sub");
      const dimX2 = document.getElementById("gantry2-dim-x-val");
      const dimY2 = document.getElementById("gantry2-dim-y-val");

      const sX1 = this.gantry1X >= 0 ? "+" : "";
      const sY1 = this.gantry1Y >= 0 ? "+" : "";
      const sX2 = this.gantry2X >= 0 ? "+" : "";
      const sY2 = this.gantry2Y >= 0 ? "+" : "";

      if (readout) {
        const a1Tag = this.activeArm === "arm1" ? "▶ ARM 1" : "ARM 1";
        const a2Tag = this.activeArm === "arm2" ? "▶ ARM 2" : "ARM 2";
        readout.innerText = `${a1Tag}: (${sX1}${this.gantry1X.toFixed(0)}, ${sY1}${this.gantry1Y.toFixed(0)}) | ${a2Tag}: (${sX2}${this.gantry2X.toFixed(0)}, ${sY2}${this.gantry2Y.toFixed(0)})`;
      }

      // Update Arm 1 Visuals (Unified Carriage slides X, Crossbeam slides Y)
      if (beam1) {
        const transY1 = Math.max(-85, Math.min(85, -this.gantry1Y * 0.8));
        beam1.style.transform = `translateY(${transY1}px)`;
      }
      if (toolhead1) {
        const transX1 = Math.max(-45, Math.min(45, this.gantry1X * 0.55));
        toolhead1.style.transform = `translate(calc(-50% + ${transX1}px), -50%)`;
      }
      if (coords1) coords1.innerText = `(${sX1}${this.gantry1X.toFixed(0)}, ${sY1}${this.gantry1Y.toFixed(0)})`;
      if (dimX1) dimX1.innerText = `← x1: ${sX1}${this.gantry1X.toFixed(0)} →`;
      if (dimY1) dimY1.innerText = `y1: ${sY1}${this.gantry1Y.toFixed(0)}`;

      // Update Arm 2 Visuals (Unified Carriage slides X, Crossbeam slides Y)
      if (beam2) {
        const transY2 = Math.max(-85, Math.min(85, -this.gantry2Y * 0.8));
        beam2.style.transform = `translateY(${transY2}px)`;
      }
      if (toolhead2) {
        const transX2 = Math.max(-45, Math.min(45, this.gantry2X * 0.55));
        toolhead2.style.transform = `translate(calc(-50% + ${transX2}px), -50%)`;
      }
      if (coords2) coords2.innerText = `(${sX2}${this.gantry2X.toFixed(0)}, ${sY2}${this.gantry2Y.toFixed(0)})`;
      if (dimX2) dimX2.innerText = `← x2: ${sX2}${this.gantry2X.toFixed(0)} →`;
      if (dimY2) dimY2.innerText = `y2: ${sY2}${this.gantry2Y.toFixed(0)}`;
    };

    // =========================================================================
    // DIRECT CURSOR & TOUCH DRAGGING FOR BOTH ARMS SIDE-BY-SIDE
    // =========================================================================
    const stage = document.getElementById("gantry-interactive-stage");

    if (stage) {
      let isDragging = false;
      let draggedArm = "arm1"; // which arm was grabbed
      let startPointerX = 0;
      let startPointerY = 0;
      let startArmX = 0;
      let startArmY = 0;

      const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;

        const rect = stage.getBoundingClientRect();
        const clickRelX = (e.clientX - rect.left) / rect.width;

        // Direct activation: touching/clicking left half activates Arm 1, right half activates Arm 2
        draggedArm = clickRelX < 0.5 ? "arm1" : "arm2";
        this.activeArm = draggedArm;
        syncActiveArmUI();
        updateGantryDisplay();

        isDragging = true;
        startPointerX = e.clientX;
        startPointerY = e.clientY;

        if (draggedArm === "arm1" || draggedArm === "both") {
          startArmX = this.gantry1X;
          startArmY = this.gantry1Y;
        } else {
          startArmX = this.gantry2X;
          startArmY = this.gantry2Y;
        }

        try {
          stage.setPointerCapture(e.pointerId);
        } catch (_) {}

        stage.classList.add("is-dragging");
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;

        const deltaPxX = e.clientX - startPointerX;
        const deltaPxY = e.clientY - startPointerY;

        const rect = stage.getBoundingClientRect();
        const pxPerMmX = (rect.width * 0.35) / 100;
        const pxPerMmY = (rect.height * 0.7) / 200;

        const deltaMmX = deltaPxX / (pxPerMmX || 1);
        const deltaMmY = -deltaPxY / (pxPerMmY || 1);

        const newX = Math.max(-80, Math.min(80, Math.round((startArmX + deltaMmX) * 10) / 10));
        const newY = Math.max(-100, Math.min(100, Math.round((startArmY + deltaMmY) * 10) / 10));

        if (draggedArm === "arm1") {
          this.gantry1X = newX;
          this.gantry1Y = newY;
        } else if (draggedArm === "arm2") {
          this.gantry2X = newX;
          this.gantry2Y = newY;
        } else if (draggedArm === "both") {
          this.gantry1X = newX;
          this.gantry1Y = newY;
          this.gantry2X = newX;
          this.gantry2Y = newY;
        }

        updateGantryDisplay();
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        try {
          stage.releasePointerCapture(e.pointerId);
        } catch (_) {}
        stage.classList.remove("is-dragging");
      };

      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("pointercancel", onPointerUp);
    }

    // Directional machine jog buttons (controls active arm or both)
    document.querySelectorAll(".btn-gantry-move").forEach((btn) => {
      const axis = btn.getAttribute("data-axis");
      const dir = parseFloat(btn.getAttribute("data-dir") || "1");
      let jogTimer = null;

      const performStep = () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          return;
        }
        const delta = dir * this.gantryStep;

        if (this.activeArm === "arm1" || this.activeArm === "both") {
          if (axis === "x") {
            this.gantry1X = Math.max(-80, Math.min(80, this.gantry1X + delta));
          } else if (axis === "y") {
            this.gantry1Y = Math.max(-100, Math.min(100, this.gantry1Y + delta));
          }
        }
        if (this.activeArm === "arm2" || this.activeArm === "both") {
          if (axis === "x") {
            this.gantry2X = Math.max(-80, Math.min(80, this.gantry2X + delta));
          } else if (axis === "y") {
            this.gantry2Y = Math.max(-100, Math.min(100, this.gantry2Y + delta));
          }
        }

        updateGantryDisplay();
      };

      const startJog = (e) => {
        e.preventDefault();
        btn.classList.add("active-held");
        performStep();
        if (jogTimer) clearInterval(jogTimer);
        jogTimer = setInterval(performStep, 130);
      };

      const stopJog = (e) => {
        btn.classList.remove("active-held");
        if (jogTimer) {
          clearInterval(jogTimer);
          jogTimer = null;
        }
      };

      btn.addEventListener("pointerdown", startJog);
      btn.addEventListener("pointerup", stopJog);
      btn.addEventListener("pointerleave", stopJog);
      btn.addEventListener("pointercancel", stopJog);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    const btnGantryZero = document.getElementById("btn-gantry-zero");
    if (btnGantryZero) {
      btnGantryZero.addEventListener("click", () => {
        this.gantry1X = 0.0;
        this.gantry1Y = 0.0;
        this.gantry2X = 0.0;
        this.gantry2Y = 0.0;
        updateGantryDisplay();
      });
    }

    // Initialize display positions
    updateGantryDisplay();

    // --- Screen 6: Automatic Picking (AI Camera Detection) ---
    const fruitCards = document.querySelectorAll(".fruit-choice-card");
    const detName = document.getElementById("det-fruit-name");
    const detConf = document.getElementById("det-fruit-conf");
    const detPos = document.getElementById("det-fruit-pos");
    const visionTag = document.getElementById("vision-tag-label");
    const btnDetectSend = document.getElementById("btn-detect-send-target");
    const targetStatusText = document.getElementById("target-send-status-text");

    fruitCards.forEach((card) => {
      card.addEventListener("click", () => {
        fruitCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");

        const fruit = card.getAttribute("data-fruit") || "Tomato";
        const conf = card.getAttribute("data-conf") || "94";
        const x = card.getAttribute("data-x") || "124";
        const y = card.getAttribute("data-y") || "86";

        if (detName) detName.innerText = fruit;
        if (detConf) detConf.innerText = `${conf}%`;
        if (detPos) detPos.innerText = `X: ${x} mm · Y: ${y} mm`;
        if (visionTag) visionTag.innerText = `${fruit} · ${conf}%`;

        // Update pipeline
        const pipe3 = document.getElementById("pipe-3");
        if (pipe3) pipe3.classList.add("active");
      });
    });

    if (btnDetectSend) {
      btnDetectSend.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot send target: Rover is OFFLINE!");
          return;
        }

        const pipe4 = document.getElementById("pipe-4");
        if (pipe4) pipe4.classList.add("active");

        btnDetectSend.disabled = true;
        if (targetStatusText) targetStatusText.innerText = "Transmitting target coordinates to rover...";

        setTimeout(() => {
          if (targetStatusText) {
            targetStatusText.innerHTML = "<strong>Rover Confirmed:</strong> Target locked. Gripper trajectory in progress.";
          }
          btnDetectSend.disabled = false;
          // Trigger ROS picking sequence
          ROSManager.startPicking();
        }, 1200);
      });
    }
  },

  // ==========================================================================
  // 6. SPRINKLING MODULE (Screens 7, 8, 9, 10, 11)
  // ==========================================================================
  setupSprinklingModule() {
    // --- Screen 7: Sprinkling Main Duration chips & trigger ---
    const durationContainer = document.getElementById("duration-selector-container");
    const btnSpray = document.getElementById("btn-trigger-spray");

    if (durationContainer) {
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
    }

    if (btnSpray) {
      btnSpray.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot spray: Rover is OFFLINE!");
          return;
        }

        this.showConfirmation(
          "Confirm Chemical Spraying",
          `Active Profile: <strong>${this.activeBucketName}</strong><br><br>Ensure personnel and wildlife are outside the spray arc.<br><br>Activate spray for <strong>${this.selectedSprayDuration} second(s)</strong>?`,
          () => {
            this.executeSpray(this.selectedSprayDuration);
          }
        );
      });
    }

    // --- Screen 8: Sprinkling Calibration ---
    const btnStartSprayCalib = document.getElementById("btn-start-spray-calib");
    const sprayProgressCard = document.getElementById("spray-calib-progress-card");
    const spraySuccessCard = document.getElementById("spray-calib-success-card");
    const sprayBar = document.getElementById("spray-calib-bar");
    const sprayPct = document.getElementById("spray-calib-pct");
    const sprayStepText = document.getElementById("spray-calib-step-text");
    const sprayBadge = document.getElementById("spray-calib-status-badge");

    if (btnStartSprayCalib) {
      btnStartSprayCalib.addEventListener("click", () => {
        if (!this.isRobotOnline && !CONFIG.MOCK_MODE) {
          alert("Cannot calibrate: Rover is OFFLINE!");
          return;
        }

        btnStartSprayCalib.disabled = true;
        if (sprayProgressCard) sprayProgressCard.style.display = "flex";
        if (spraySuccessCard) spraySuccessCard.style.display = "none";
        if (sprayBadge) {
          sprayBadge.className = "status-badge warning";
          sprayBadge.innerText = "TESTING FLUIDS...";
        }

        const stages = [
          { pct: 30, text: "Testing fluid solenoid & pump lines..." },
          { pct: 65, text: "Purging manifold nozzle air gaps..." },
          { pct: 100, text: "Validating flow meter at 2.4 bar..." }
        ];

        let idx = 0;
        if (this.sprayCalibTimer) clearInterval(this.sprayCalibTimer);

        this.sprayCalibTimer = setInterval(() => {
          if (idx < stages.length) {
            const st = stages[idx];
            if (sprayBar) sprayBar.style.width = `${st.pct}%`;
            if (sprayPct) sprayPct.innerText = `${st.pct}%`;
            if (sprayStepText) sprayStepText.innerText = st.text;
            idx++;
          } else {
            clearInterval(this.sprayCalibTimer);
            this.sprayCalibTimer = null;
            if (spraySuccessCard) spraySuccessCard.style.display = "flex";
            if (sprayBadge) {
              sprayBadge.className = "status-badge ready";
              sprayBadge.innerText = "CALIBRATED ✓";
            }
          }
        }, 750);
      });
    }

    // --- Screen 9: Anomaly Detection (Safety Check - Professional Agritech) ---
    const btnSimObstacle = document.getElementById("btn-sim-obstacle");
    const btnSimClear = document.getElementById("btn-sim-clear");
    const cardPerson = document.getElementById("target-card-person");
    const cardUnplant = document.getElementById("target-card-unplant");
    const badgePerson = document.getElementById("target-badge-person");
    const badgeUnplant = document.getElementById("target-badge-unplant");
    const hazardWedge = document.getElementById("sector-hazard-wedge");
    const safeWedge = document.getElementById("sector-safe-wedge");
    const radarPoint = document.getElementById("radar-obstacle-point");
    const telemetryDist = document.getElementById("telemetry-distance-val");
    const scannerPill = document.getElementById("scanner-status-pill");
    const interlockAlert = document.getElementById("safety-interlock-alert");
    const interlockClear = document.getElementById("safety-interlock-clear");
    const btnReScan = document.getElementById("btn-re-scan-perimeter");

    const setAnomalyState = (hasObstacle) => {
      if (hasObstacle) {
        if (btnSimObstacle) btnSimObstacle.classList.add("selected");
        if (btnSimClear) btnSimClear.classList.remove("selected");

        if (cardPerson) { cardPerson.className = "safety-target-card alert"; }
        if (cardUnplant) { cardUnplant.className = "safety-target-card alert"; }
        if (badgePerson) { badgePerson.className = "target-badge alert"; badgePerson.innerText = "ALERT: Person @ 1.8m"; }
        if (badgeUnplant) { badgeUnplant.className = "target-badge alert"; badgeUnplant.innerText = "BLOCKED: Near Tree Row"; }

        if (hazardWedge) hazardWedge.style.display = "block";
        if (safeWedge) safeWedge.style.display = "none";
        if (radarPoint) radarPoint.style.display = "block";
        if (telemetryDist) telemetryDist.innerText = "1.8 m";

        if (scannerPill) {
          scannerPill.className = "telemetry-pill live";
          scannerPill.innerText = "INTERLOCK ACTIVE";
        }
        if (interlockAlert) interlockAlert.style.display = "flex";
        if (interlockClear) interlockClear.style.display = "none";
      } else {
        if (btnSimClear) btnSimClear.classList.add("selected");
        if (btnSimObstacle) btnSimObstacle.classList.remove("selected");

        if (cardPerson) { cardPerson.className = "safety-target-card clear"; }
        if (cardUnplant) { cardUnplant.className = "safety-target-card clear"; }
        if (badgePerson) { badgePerson.className = "target-badge clear"; badgePerson.innerText = "CLEAR (0 Detected)"; }
        if (badgeUnplant) { badgeUnplant.className = "target-badge clear"; badgeUnplant.innerText = "CLEAR (Path Free)"; }

        if (hazardWedge) hazardWedge.style.display = "none";
        if (safeWedge) safeWedge.style.display = "block";
        if (radarPoint) radarPoint.style.display = "none";
        if (telemetryDist) telemetryDist.innerText = "None (> 4.0m)";

        if (scannerPill) {
          scannerPill.className = "telemetry-pill ready";
          scannerPill.innerText = "ZONE CLEAR";
        }
        if (interlockAlert) interlockAlert.style.display = "none";
        if (interlockClear) interlockClear.style.display = "flex";
      }
    };

    if (btnSimObstacle) btnSimObstacle.addEventListener("click", () => setAnomalyState(true));
    if (btnSimClear) btnSimClear.addEventListener("click", () => setAnomalyState(false));
    if (btnReScan) {
      btnReScan.addEventListener("click", () => {
        // Trigger simulated scanning effect then clear if confirmed
        if (scannerPill) {
          scannerPill.className = "telemetry-pill warning";
          scannerPill.innerText = "RE-SCANNING...";
        }
        setTimeout(() => {
          setAnomalyState(false);
        }, 600);
      });
    }

    // --- Screen 10: Bucket Selection ---
    const bucketCards = document.querySelectorAll(".bucket-cards-stack .bucket-card:not(.unknown-profile-card)");
    const mainBucketTag = document.getElementById("main-active-bucket-tag");

    bucketCards.forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".bucket-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");

        const bucketNum = card.getAttribute("data-bucket") || "Bucket 01";
        const chem = card.getAttribute("data-chem") || "Copper-based profile";
        this.activeBucketName = `${bucketNum} (${chem})`;
        if (mainBucketTag) mainBucketTag.innerText = bucketNum.toUpperCase();
      });
    });

    const btnConfirmBucket = document.getElementById("btn-confirm-active-bucket");
    if (btnConfirmBucket) {
      btnConfirmBucket.addEventListener("click", () => {
        this.navigateTo("screen-sprinkling-main");
      });
    }

    // --- Screen 11: Unknown Profile Editor ---
    const checkVerified = document.getElementById("check-operator-verified");
    const btnSaveProfile = document.getElementById("btn-save-unknown-profile");
    const profNameInput = document.getElementById("prof-name");

    if (checkVerified && btnSaveProfile) {
      checkVerified.addEventListener("change", () => {
        btnSaveProfile.disabled = !checkVerified.checked;
      });

      btnSaveProfile.addEventListener("click", () => {
        const nameVal = (profNameInput ? profNameInput.value.trim() : "") || "Custom Operator Formulation";
        this.customProfile = {
          name: nameVal,
          temp: document.getElementById("prof-temp")?.value || "20°C",
          conc: document.getElementById("prof-conc")?.value || "1.5 g/L",
          qty: document.getElementById("prof-qty")?.value || "500",
          unit: document.getElementById("prof-unit")?.value || "L"
        };

        // Update Unknown Profile Card in Screen 10
        const unknownCard = document.getElementById("bucket-unknown-card");
        const unknownTitle = document.getElementById("unknown-profile-title");
        const unknownDesc = document.getElementById("unknown-profile-desc");

        if (unknownTitle) unknownTitle.innerText = this.customProfile.name;
        if (unknownDesc) unknownDesc.innerText = `Verified: ${this.customProfile.conc} · ${this.customProfile.qty} ${this.customProfile.unit}`;

        // Select the custom bucket
        document.querySelectorAll(".bucket-card").forEach((c) => c.classList.remove("selected"));
        if (unknownCard) unknownCard.classList.add("selected");
        this.activeBucketName = `Custom Profile (${this.customProfile.name})`;
        if (mainBucketTag) mainBucketTag.innerText = "CUSTOM";

        alert(`Profile Saved Successfully:\n"${this.customProfile.name}" is now the active configuration.`);
        this.navigateTo("screen-sprinkling-buckets");
      });
    }
  },

  executeSpray(duration) {
    const sprayFeedback = document.getElementById("spray-feedback");
    const sprayFeedbackText = document.getElementById("spray-feedback-text");
    const btnSpray = document.getElementById("btn-trigger-spray");
    const countdownWrapper = document.getElementById("spray-countdown-wrapper");
    const countdownNumber = document.getElementById("spray-countdown-number");
    const ringFg = document.getElementById("spray-ring-fg");

    if (btnSpray) btnSpray.disabled = true;
    if (sprayFeedback) sprayFeedback.style.display = "none";
    if (countdownWrapper) countdownWrapper.style.display = "flex";

    const CIRCUMFERENCE = 188.5;
    if (ringFg) ringFg.style.strokeDashoffset = "0";
    if (countdownNumber) countdownNumber.innerText = duration;

    let remaining = duration;
    if (this.sprayCountdownInterval) clearInterval(this.sprayCountdownInterval);

    this.sprayCountdownInterval = setInterval(() => {
      remaining--;
      if (countdownNumber) countdownNumber.innerText = remaining;
      const offset = ((duration - remaining) / duration) * CIRCUMFERENCE;
      if (ringFg) ringFg.style.strokeDashoffset = offset.toFixed(2);

      if (remaining <= 0) {
        clearInterval(this.sprayCountdownInterval);
        this.sprayCountdownInterval = null;
        if (countdownWrapper) countdownWrapper.style.display = "none";
        if (sprayFeedback) {
          sprayFeedback.style.display = "flex";
          sprayFeedback.className = "status-callout success";
          if (sprayFeedbackText) {
            sprayFeedbackText.innerText = `Sprayed ${this.activeBucketName} for ${duration} s`;
          }
        }
        if (btnSpray && (this.isRobotOnline || CONFIG.MOCK_MODE)) {
          btnSpray.disabled = false;
        }
      }
    }, 1000);

    ROSManager.triggerSpray(duration);
  },

  // ==========================================================================
  // 7. LOGISTICS MODULE (Screen 12)
  // ==========================================================================
  setupLogisticsModule() {
    const btnOpenRos = document.getElementById("btn-open-ros-app");
    if (btnOpenRos) {
      btnOpenRos.addEventListener("click", () => {
        alert(
          "ROS Application Bridge:\n\nConnecting to ROS Master Web UI...\nURL: " +
          (ROSManager._runtimeURL || CONFIG.ROSBRIDGE_URL) +
          "\n\nActive Nodes: /rover_base_controller, /follow_me_tracker"
        );
      });
    }

    // Teleop speed chips
    const speedSlow = document.getElementById("btn-speed-slow");
    const speedMed = document.getElementById("btn-speed-medium");
    if (speedSlow && speedMed) {
      speedSlow.addEventListener("click", () => {
        speedSlow.classList.add("selected");
        speedMed.classList.remove("selected");
        this.selectedTeleopSpeed = "slow";
      });
      speedMed.addEventListener("click", () => {
        speedMed.classList.add("selected");
        speedSlow.classList.remove("selected");
        this.selectedTeleopSpeed = "medium";
      });
    }

    // Follow-Me toggle with safety confirmation dialog
    const toggleFollow = document.getElementById("toggle-follow-me");
    if (toggleFollow) {
      toggleFollow.addEventListener("change", () => {
        if (toggleFollow.checked) {
          toggleFollow.checked = false; // await confirmation
          this.showConfirmation(
            "Enable Autonomous Follow-Me?",
            "The rover will lock onto and follow field personnel via lidar/camera tracking. Ensure path is clear of obstacles.",
            () => {
              toggleFollow.checked = true;
              ROSManager.setFollowMe(true);
              this._setTeleopButtonsEnabled(false);
            }
          );
        } else {
          ROSManager.setFollowMe(false);
          this._setTeleopButtonsEnabled(true);
        }
      });
    }

    // Teleop directional buttons (Hold to move, 10 Hz, zero on release)
    document.querySelectorAll(".btn-teleop").forEach((btn) => {
      const linear = parseFloat(btn.getAttribute("data-linear") || "0");
      const angular = parseFloat(btn.getAttribute("data-angular") || "0");

      const handlePress = (e) => {
        e.preventDefault();
        if (btn.disabled) return;

        // Pressing teleop turns off follow-me
        if (toggleFollow && toggleFollow.checked) {
          toggleFollow.checked = false;
          ROSManager.setFollowMe(false);
          this._setTeleopButtonsEnabled(true);
        }

        btn.classList.add("active-holding");
        const linSpd = (this.selectedTeleopSpeed === "medium") ? CONFIG.TELEOP.MEDIUM_LINEAR : CONFIG.TELEOP.SLOW_LINEAR;
        const angSpd = (this.selectedTeleopSpeed === "medium") ? CONFIG.TELEOP.MEDIUM_ANGULAR : CONFIG.TELEOP.SLOW_ANGULAR;
        ROSManager.startTeleop(linear, angular, linSpd, angSpd);
      };

      const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove("active-holding");
        ROSManager.stopTeleop();
      };

      btn.addEventListener("mousedown", handlePress);
      btn.addEventListener("mouseup", handleRelease);
      btn.addEventListener("mouseleave", handleRelease);
      btn.addEventListener("touchstart", handlePress, { passive: false });
      btn.addEventListener("touchend", handleRelease, { passive: false });
      btn.addEventListener("touchcancel", handleRelease, { passive: false });
    });

    window.addEventListener("blur", () => ROSManager.stopTeleop());
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

  // ==========================================================================
  // 8. SETTINGS SCREEN
  // ==========================================================================
  setupSettingsScreen() {
    const ipInput = document.getElementById("settings-robot-ip");
    const portInput = document.getElementById("settings-robot-port");
    const btnConn = document.getElementById("btn-settings-connect");
    const mockToggle = document.getElementById("settings-mock-toggle");

    try {
      const savedIP = localStorage.getItem("fruityq_robot_ip");
      const savedPort = localStorage.getItem("fruityq_robot_port");
      if (ipInput && savedIP) ipInput.value = savedIP;
      if (portInput && savedPort) portInput.value = savedPort;
      if (mockToggle) mockToggle.checked = CONFIG.MOCK_MODE;
    } catch (e) {
      console.warn("[Settings] localStorage read error:", e);
    }

    if (btnConn) {
      btnConn.addEventListener("click", () => {
        const ip = (ipInput ? ipInput.value.trim() : "") || CONFIG.ROBOT_IP;
        const port = (portInput ? parseInt(portInput.value, 10) : 0) || CONFIG.ROBOT_PORT;

        try {
          localStorage.setItem("fruityq_robot_ip", ip);
          localStorage.setItem("fruityq_robot_port", String(port));
          sessionStorage.setItem("fruityq_pending_ip", ip);
          sessionStorage.setItem("fruityq_pending_port", String(port));
        } catch (e) {}

        alert(`Settings saved.\nConnecting to ws://${ip}:${port}\n\nPage will reload.`);
        window.location.reload();
      });
    }

    if (mockToggle) {
      mockToggle.addEventListener("change", () => {
        try {
          localStorage.setItem("fruityq_mock_mode", mockToggle.checked ? "1" : "0");
        } catch (e) {}
        alert(`Mock Mode set to ${mockToggle.checked ? "ON" : "OFF"}.\nReloading application.`);
        window.location.reload();
      });
    }
  },

  // ==========================================================================
  // 9. PERSISTENT EMERGENCY STOP BAR (SOFT STOP)
  // ==========================================================================
  setupEmergencyStop() {
    const btnStop = document.getElementById("btn-global-stop");
    const btnStopText = document.getElementById("btn-stop-text");
    if (!btnStop) return;

    btnStop.addEventListener("click", () => {
      if (!ROSManager.isEStopped) {
        ROSManager.triggerEmergencyStop();
        btnStop.classList.add("active-stopped");
        if (btnStopText) btnStopText.innerText = "■ RESUME SOFT STOP";
        alert("SOFT STOP ACTIVATED!\nAll actuators, teleop commands, and spray pumps halted immediately.");
      } else {
        const confirmReset = confirm("Are you sure you want to release Soft Stop?");
        if (confirmReset) {
          ROSManager.resetEmergencyStop();
          btnStop.classList.remove("active-stopped");
          if (btnStopText) btnStopText.innerText = "■ SOFT STOP";
        }
      }
    });
  },

  // ==========================================================================
  // 10. ROS MANAGER CALLBACK HOOKS
  // ==========================================================================
  hookROSCallbacks() {
    ROSManager.onConnectionChange = (isOnline) => {
      this.updateOnlineStatus(isOnline);
    };

    ROSManager.onEStopChange = (isEStopped) => {
      const btnSpray = document.getElementById("btn-trigger-spray");
      const btnDetect = document.getElementById("btn-detect-send-target");
      if (btnSpray) btnSpray.disabled = isEStopped || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
      if (btnDetect) btnDetect.disabled = isEStopped || (!this.isRobotOnline && !CONFIG.MOCK_MODE);
    };

    ROSManager.onPickStateChange = (stateName) => {
      const statusEl = document.getElementById("target-send-status-text");
      if (statusEl) {
        statusEl.innerText = `Harvest State: ${stateName}`;
      }
    };
  },

  // ==========================================================================
  // 11. GLOBAL CONNECTION STATE & PERVASIVE TELEMETRY
  // ==========================================================================
  updateOnlineStatus(isOnline) {
    this.isRobotOnline = isOnline;

    // Home Header Pill
    const homePill = document.getElementById("robot-status-pill");
    const homeStatusText = document.getElementById("robot-status-text");
    if (homePill && homeStatusText) {
      homePill.className = isOnline ? "global-connection-state online" : "global-connection-state";
      homeStatusText.innerText = isOnline ? "ONLINE" : "OFFLINE";
    }

    // Sub-screen pills across all 12 screens
    document.querySelectorAll(".sub-status-pill").forEach((pill) => {
      const textSpan = pill.querySelector(".sub-status-text");
      if (isOnline) {
        pill.className = "sub-status-pill online";
        if (textSpan) textSpan.innerText = "ONLINE";
      } else {
        pill.className = "sub-status-pill";
        if (textSpan) textSpan.innerText = "OFFLINE";
      }
    });

    // Offline notice bars
    document.querySelectorAll(".offline-notice").forEach((notice) => {
      notice.classList.toggle("visible", !isOnline && !CONFIG.MOCK_MODE);
    });

    // Rover Connection Card on Dashboard
    const roverStatus = document.getElementById("rover-status");
    const roverSubstatus = document.getElementById("rover-substatus");
    const connIndicator = document.getElementById("connection-indicator");
    const connDetail = document.getElementById("connection-detail");

    if (roverStatus && roverSubstatus && connIndicator && connDetail) {
      if (isOnline) {
        roverStatus.innerText = "Connected";
        roverSubstatus.innerText = "Autonomous rover ready for operations";
        connIndicator.className = "connection-indicator online";
        connDetail.innerText = "Rover is connected";
      } else {
        roverStatus.innerText = "Awaiting connection";
        roverSubstatus.innerText = "Connect to enable autonomous control";
        connIndicator.className = "connection-indicator";
        connDetail.innerText = "Rover is currently offline";
      }
    }

    // Guidance Card
    const guidanceCard = document.getElementById("guidance-card");
    if (guidanceCard) {
      guidanceCard.style.display = isOnline ? "none" : "flex";
    }

    // Module Cards Locked/Unlocked state
    document.querySelectorAll(".module-card").forEach((card) => {
      const shouldUnlock = isOnline || CONFIG.MOCK_MODE;
      card.classList.toggle("locked", !shouldUnlock);
    });

    // Module Badges on Dashboard
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

    // ROS Status on Logistics Screen
    const rosBadge = document.getElementById("ros-status-pill-badge");
    if (rosBadge) {
      if (isOnline) {
        rosBadge.className = "status-badge ready";
        rosBadge.innerText = "● CONNECTED";
      } else {
        rosBadge.className = "status-badge stop";
        rosBadge.innerText = "● NOT CONNECTED";
      }
    }

    // SOFT STOP subline helper text:
    // Online: "Emergency: press the red button on the robot"
    // Offline: "Robot not connected: use the red button"
    const stopSubline = document.getElementById("stop-subline");
    if (stopSubline) {
      stopSubline.innerText = isOnline
        ? "Emergency: press the red button on the robot"
        : "Robot not connected: use the red button";
    }

    // Spray Trigger button
    const btnSpray = document.getElementById("btn-trigger-spray");
    if (btnSpray && !ROSManager.isEStopped) {
      btnSpray.disabled = !isOnline && !CONFIG.MOCK_MODE;
    }

    // Teleop buttons
    if (!isOnline && !CONFIG.MOCK_MODE) {
      this._setTeleopButtonsEnabled(false);
    } else {
      const follow = document.getElementById("toggle-follow-me");
      this._setTeleopButtonsEnabled(!follow || !follow.checked);
    }
  }
};

// ============================================================================
// BOOTSTRAP ON DOM READY
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  try {
    const pendingIP = sessionStorage.getItem("fruityq_pending_ip");
    const pendingPort = sessionStorage.getItem("fruityq_pending_port");
    if (pendingIP) {
      sessionStorage.removeItem("fruityq_pending_ip");
      sessionStorage.removeItem("fruityq_pending_port");
      window.__fruityq_override_ip = pendingIP;
      window.__fruityq_override_port = pendingPort || String(CONFIG.ROBOT_PORT);
    }
  } catch (e) {}

  UI.init();
  ROSManager.init();
});
