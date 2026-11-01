/**
 * ==============================================================================
 * FRUITY Q - ROSBRIDGE WEBSOCKET CLIENT & STATE MANAGER
 * ==============================================================================
 * Handles:
 * - WebSocket connection with automatic retry every 3 seconds
 * - Heartbeat monitoring (3 missed beats = OFFLINE status + disable action buttons)
 * - Safe publish helper functions for E-Stop, Sprinkler, Picking, Follow-Me & Teleop
 * - Safety rule: Movement buttons publish Twist at 10Hz only while held; publish zero on release/disconnect
 * ==============================================================================
 */

const ROSManager = {
  ros: null,
  isConnected: false,
  reconnectInterval: null,
  heartbeatChecker: null,
  lastHeartbeatTime: 0,
  missedHeartbeats: 0,
  isEStopped: false,

  // Topics cache
  topics: {},

  // Teleop loop timer
  teleopTimer: null,
  currentTwist: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },

  // Event callbacks for UI
  onConnectionChange: null, // fn(isOnline)
  onEStopChange: null,      // fn(isEStopped)
  onPickStateChange: null,  // fn(stateString)
  onSprayStatusChange: null,// fn(statusString)

  init() {
    if (CONFIG.MOCK_MODE) {
      console.warn("[ROSManager] MOCK MODE ACTIVE. Connecting to simulated robot.");
      MockRobot.start();
      return;
    }

    this.connect();
    this.startHeartbeatMonitor();
  },

  connect() {
    if (this.ros) {
      try {
        this.ros.close();
      } catch (e) {}
    }

    console.log(`[ROSManager] Connecting to rosbridge at ${CONFIG.ROSBRIDGE_URL}...`);

    try {
      this.ros = new ROSLIB.Ros({
        url: CONFIG.ROSBRIDGE_URL
      });
    } catch (err) {
      console.error("[ROSManager] Failed to construct ROSLIB instance:", err);
      this.handleDisconnect();
      return;
    }

    this.ros.on("connection", () => {
      console.log("[ROSManager] Connected to rosbridge WebSocket!");
      this.isConnected = true;
      this.missedHeartbeats = 0;
      this.lastHeartbeatTime = Date.now();

      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      this.setupSubscriptions();
      this.updateOnlineState(true);
    });

    this.ros.on("error", (error) => {
      console.warn("[ROSManager] WebSocket error:", error);
      this.handleDisconnect();
    });

    this.ros.on("close", () => {
      console.log("[ROSManager] WebSocket connection closed.");
      this.handleDisconnect();
    });
  },

  handleDisconnect() {
    this.isConnected = false;
    this.stopTeleopLoop(); // Safety rule: Stop movement on disconnect
    this.updateOnlineState(false);

    // Schedule auto-reconnect if not already running
    if (!this.reconnectInterval && !CONFIG.MOCK_MODE) {
      this.reconnectInterval = setInterval(() => {
        console.log(`[ROSManager] Attempting reconnection to ${CONFIG.ROSBRIDGE_URL}...`);
        this.connect();
      }, CONFIG.RECONNECT_INTERVAL_MS);
    }
  },

  startHeartbeatMonitor() {
    this.heartbeatChecker = setInterval(() => {
      if (!this.isConnected && !CONFIG.MOCK_MODE) return;

      const elapsed = Date.now() - this.lastHeartbeatTime;
      if (this.lastHeartbeatTime > 0 && elapsed > CONFIG.HEARTBEAT_INTERVAL_MS) {
        this.missedHeartbeats++;
        console.warn(`[ROSManager] Missed heartbeat (${this.missedHeartbeats}/${CONFIG.MAX_MISSED_HEARTBEATS})`);

        if (this.missedHeartbeats >= CONFIG.MAX_MISSED_HEARTBEATS) {
          console.error("[ROSManager] Robot heartbeat lost! Marking robot as OFFLINE.");
          this.handleDisconnect();
        }
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  },

  handleHeartbeat() {
    this.lastHeartbeatTime = Date.now();
    this.missedHeartbeats = 0;
    if (!this.isConnected) {
      this.isConnected = true;
      this.updateOnlineState(true);
    }
  },

  updateOnlineState(isOnline) {
    if (this.onConnectionChange) {
      this.onConnectionChange(isOnline);
    }
  },

  setupSubscriptions() {
    if (CONFIG.MOCK_MODE || !this.ros) return;

    // 1. Heartbeat subscriber
    try {
      const heartbeatSub = new ROSLIB.Topic({
        ros: this.ros,
        name: CONFIG.TOPICS.HEARTBEAT.name,
        messageType: CONFIG.TOPICS.HEARTBEAT.messageType
      });
      heartbeatSub.subscribe(() => this.handleHeartbeat());
    } catch (e) {
      console.error("[ROSManager] Could not subscribe to heartbeat:", e);
    }

    // 2. Fruit Picking State subscriber
    try {
      const pickStateSub = new ROSLIB.Topic({
        ros: this.ros,
        name: CONFIG.TOPICS.PICK_STATE.name,
        messageType: CONFIG.TOPICS.PICK_STATE.messageType
      });
      pickStateSub.subscribe((message) => {
        if (this.onPickStateChange) {
          this.onPickStateChange(message.data);
        }
      });
    } catch (e) {
      console.error("[ROSManager] Could not subscribe to pick state:", e);
    }

    // 3. Spray Status subscriber
    try {
      const sprayStatusSub = new ROSLIB.Topic({
        ros: this.ros,
        name: CONFIG.TOPICS.SPRAY_STATUS.name,
        messageType: CONFIG.TOPICS.SPRAY_STATUS.messageType
      });
      sprayStatusSub.subscribe((message) => {
        if (this.onSprayStatusChange) {
          this.onSprayStatusChange(message.data);
        }
      });
    } catch (e) {
      console.error("[ROSManager] Could not subscribe to spray status:", e);
    }
  },

  getTopic(topicConfig) {
    if (CONFIG.MOCK_MODE) return null;

    if (!this.topics[topicConfig.name]) {
      this.topics[topicConfig.name] = new ROSLIB.Topic({
        ros: this.ros,
        name: topicConfig.name,
        messageType: topicConfig.messageType
      });
    }
    return this.topics[topicConfig.name];
  },

  publish(topicConfig, messageData) {
    if (CONFIG.MOCK_MODE) {
      MockRobot.publish(topicConfig.name, messageData);
      return true;
    }

    if (!this.isConnected) {
      console.warn("[ROSManager] Cannot publish: Robot is OFFLINE!");
      return false;
    }

    try {
      const topic = this.getTopic(topicConfig);
      const message = new ROSLIB.Message(messageData);
      topic.publish(message);
      return true;
    } catch (err) {
      console.error(`[ROSManager] Publish failed on ${topicConfig.name}:`, err);
      return false;
    }
  },

  // ----------------------------------------------------------------------------
  // SAFETY & ACTIONS
  // ----------------------------------------------------------------------------

  /**
   * Emergency Stop: estop true, zero Twist, stop spray, cancel pick
   */
  triggerEmergencyStop() {
    console.warn("[ROSManager] 🚨 EMERGENCY STOP ACTIVATED!");
    this.isEStopped = true;

    this.publish(CONFIG.TOPICS.EMERGENCY_STOP, { data: true });
    this.stopTeleopLoop(); // sends zeros
    this.publish(CONFIG.TOPICS.SPRAY_STOP, { data: true });
    this.publish(CONFIG.TOPICS.PICK_CANCEL, { data: true });

    if (this.onEStopChange) {
      this.onEStopChange(true);
    }
  },

  resetEmergencyStop() {
    console.log("[ROSManager] Resetting Emergency Stop state.");
    this.isEStopped = false;
    this.publish(CONFIG.TOPICS.EMERGENCY_STOP, { data: false });

    if (this.onEStopChange) {
      this.onEStopChange(false);
    }
  },

  // Sprinkler
  triggerSpray(durationSeconds) {
    const safeDuration = Math.min(
      Math.max(durationSeconds, CONFIG.SPRAY.MIN_DURATION_SEC),
      CONFIG.SPRAY.MAX_DURATION_SEC
    );
    return this.publish(CONFIG.TOPICS.SPRAY_TRIGGER, { data: safeDuration });
  },

  stopSpray() {
    return this.publish(CONFIG.TOPICS.SPRAY_STOP, { data: true });
  },

  // Fruit Picking
  startPicking() {
    console.log("[ROSManager] Starting fruit picking sequence...");
    return this.publish(CONFIG.TOPICS.PICK_START, { data: true });
  },

  cancelPicking() {
    console.warn("[ROSManager] Cancelling fruit picking sequence...");
    return this.publish(CONFIG.TOPICS.PICK_CANCEL, { data: true });
  },

  // Follow-Me Mode
  setFollowMe(enabled) {
    console.log(`[ROSManager] Setting Follow-Me mode to ${enabled}`);
    return this.publish(CONFIG.TOPICS.FOLLOW_ME, { data: !!enabled });
  },

  // Teleop (Hold-to-move arrow buttons at 10 Hz)
  startTeleop(linearX, angularZ) {
    if (this.isEStopped || (!this.isConnected && !CONFIG.MOCK_MODE)) return;

    this.currentTwist = {
      linear: { x: linearX * CONFIG.TELEOP.LINEAR_SPEED, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularZ * CONFIG.TELEOP.ANGULAR_SPEED }
    };

    // Immediately publish once
    this.publish(CONFIG.TOPICS.CMD_VEL, this.currentTwist);

    // Start 10 Hz repeating timer (100ms)
    if (this.teleopTimer) clearInterval(this.teleopTimer);
    const intervalMs = Math.round(1000 / CONFIG.TELEOP.PUBLISH_RATE_HZ);
    this.teleopTimer = setInterval(() => {
      this.publish(CONFIG.TOPICS.CMD_VEL, this.currentTwist);
    }, intervalMs);
  },

  stopTeleop() {
    this.stopTeleopLoop();
  },

  stopTeleopLoop() {
    if (this.teleopTimer) {
      clearInterval(this.teleopTimer);
      this.teleopTimer = null;
    }
    this.currentTwist = {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    };
    // Always publish zero on release, disconnect, or stop
    this.publish(CONFIG.TOPICS.CMD_VEL, this.currentTwist);
  }
};
