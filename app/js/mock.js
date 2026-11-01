/**
 * ==============================================================================
 * FRUITY Q - MOCK ROBOT FOR TESTING
 * ==============================================================================
 * This file allows testing all UI buttons, screens, and workflows in the browser
 * or phone without needing physical robot hardware or a live ROS master.
 *
 * When CONFIG.MOCK_MODE is true, this mock simulates:
 * - ROS bridge connection (status: ONLINE)
 * - Periodic heartbeat ping every 2 seconds
 * - Logging received ROS publications (Spray, E-Stop, Velocity, Picking, Follow-Me)
 * - Realistic step sequence for Fruit Picking: Searching -> Aligned -> Gripping -> Cutting -> Picked
 * ==============================================================================
 */

const MockRobot = {
  isOnline: false,
  heartbeatTimer: null,
  pickingStepTimer: null,

  start() {
    console.log("[MOCK ROBOT] Initializing simulated robot backend...");
    setTimeout(() => {
      this.isOnline = true;
      console.log("[MOCK ROBOT] Connected! Robot status: ONLINE");
      if (typeof ROSManager !== "undefined" && ROSManager.onConnectionChange) {
        ROSManager.onConnectionChange(true);
      }

      // Start simulated heartbeat
      this.heartbeatTimer = setInterval(() => {
        if (typeof ROSManager !== "undefined" && ROSManager.handleHeartbeat) {
          ROSManager.handleHeartbeat();
        }
      }, CONFIG.HEARTBEAT_INTERVAL_MS);
    }, 500);
  },

  publish(topicName, message) {
    console.log(`%c[MOCK ROS PUBLISH] %cTopic: "${topicName}"`, "color: #ff9800; font-weight: bold;", "color: #fff; background: #333; padding: 2px 5px; border-radius: 3px;", message);
    
    // 1. Sprayer simulation
    if (topicName === CONFIG.TOPICS.SPRAY_TRIGGER.name) {
      console.log(`[MOCK ROBOT] 💦 Pump activated for ${message.data} seconds.`);
      setTimeout(() => {
        console.log(`[MOCK ROBOT] 💦 Spray completed successfully.`);
      }, message.data * 1000);
    }

    // 2. Fruit Picking simulation
    if (topicName === CONFIG.TOPICS.PICK_START.name && message.data === true) {
      console.log(`[MOCK ROBOT] 🍎 Harvesting sequence triggered.`);
      this.simulatePickingLifecycle();
    }

    if (topicName === CONFIG.TOPICS.PICK_CANCEL.name && message.data === true) {
      console.warn(`[MOCK ROBOT] 🚫 Picking sequence aborted.`);
      if (this.pickingStepTimer) {
        clearTimeout(this.pickingStepTimer);
        this.pickingStepTimer = null;
      }
      if (typeof ROSManager !== "undefined" && ROSManager.onPickStateChange) {
        ROSManager.onPickStateChange("Cancelled");
      }
    }

    // 3. Follow-me mode simulation
    if (topicName === CONFIG.TOPICS.FOLLOW_ME.name) {
      console.log(`[MOCK ROBOT] 🚜 Follow-me state set to: ${message.data}`);
    }

    // 4. Teleop Velocity (cmd_vel)
    if (topicName === CONFIG.TOPICS.CMD_VEL.name) {
      // Only log nonzero or stop
      if (message.linear.x !== 0 || message.angular.z !== 0) {
        console.log(`[MOCK ROBOT] 🕹️ Twist: linear.x=${message.linear.x}, angular.z=${message.angular.z}`);
      }
    }

    // 5. Emergency Stop simulation
    if (topicName === CONFIG.TOPICS.EMERGENCY_STOP.name && message.data === true) {
      console.warn(`[MOCK ROBOT] 🛑 EMERGENCY STOP TRIGGERED! All motors halted.`);
      if (this.pickingStepTimer) {
        clearTimeout(this.pickingStepTimer);
        this.pickingStepTimer = null;
      }
    }
  },

  simulatePickingLifecycle() {
    const steps = ["Searching", "Aligned", "Gripping", "Cutting", "Picked"];
    let currentIndex = 0;

    const advanceStep = () => {
      if (currentIndex < steps.length) {
        const step = steps[currentIndex];
        console.log(`[MOCK ROBOT] 📍 Step update: ${step}`);
        if (typeof ROSManager !== "undefined" && ROSManager.onPickStateChange) {
          ROSManager.onPickStateChange(step);
        }

        // If DISTANCE_TOPIC is configured, simulate a distance during "Aligned" step
        if (step === "Aligned" && CONFIG.PICKING.DISTANCE_TOPIC) {
          if (typeof ROSManager !== "undefined" && ROSManager.onPickDistanceChange) {
            const mockDist = (Math.random() * 0.4 + 0.2).toFixed(2) + " m";
            ROSManager.onPickDistanceChange(mockDist);
          }
        }

        currentIndex++;
        this.pickingStepTimer = setTimeout(advanceStep, 2000); // 2s per step
      } else {
        this.pickingStepTimer = null;
      }
    };

    advanceStep();
  },

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pickingStepTimer) {
      clearTimeout(this.pickingStepTimer);
      this.pickingStepTimer = null;
    }
    this.isOnline = false;
    if (typeof ROSManager !== "undefined" && ROSManager.onConnectionChange) {
      ROSManager.onConnectionChange(false);
    }
  }
};
