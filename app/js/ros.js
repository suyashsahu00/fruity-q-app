/**
 * ==============================================================================
 * FRUITY Q - ROSBRIDGE WEBSOCKET CLIENT & STATE MANAGER
 * ==============================================================================
 * Handles:
 * - WebSocket connection with automatic retry every 3 seconds
 * - Heartbeat monitoring (3 missed beats = OFFLINE status + disable action buttons)
 * - Safe publish helper functions for E-Stop, Sprinkler, Teleop, etc.
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

  // Event callbacks for UI
  onConnectionChange: null, // fn(isOnline)
  onEStopChange: null,      // fn(isEStopped)

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
      // If no heartbeat within interval, increment missed count
      if (this.lastHeartbeatTime > 0 && elapsed > CONFIG.HEARTBEAT_INTERVAL_MS) {
        this.missedHeartbeats++;
        console.warn(`[ROSManager] Missed heartbeat (${this.missedHeartbeats}/${CONFIG.MAX_MISSED_HEARTBEATS})`);

        if (this.missedHeartbeats >= CONFIG.MAX_MISSED_HEARTBEATS) {
          console.error("[ROSManager] Robot heartbeat lost! Marking robot as OFFLINE.");
          this.updateOnlineState(false);
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

    // Heartbeat subscriber
    try {
      const heartbeatSub = new ROSLIB.Topic({
        ros: this.ros,
        name: CONFIG.TOPICS.HEARTBEAT.name,
        messageType: CONFIG.TOPICS.HEARTBEAT.messageType
      });

      heartbeatSub.subscribe((message) => {
        this.handleHeartbeat();
      });
    } catch (e) {
      console.error("[ROSManager] Could not subscribe to heartbeat:", e);
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
      console.log(`[ROSManager] Published to ${topicConfig.name}:`, messageData);
      return true;
    } catch (err) {
      console.error(`[ROSManager] Publish failed on ${topicConfig.name}:`, err);
      return false;
    }
  },

  // ----------------------------------------------------------------------------
  // HELPER ACTIONS
  // ----------------------------------------------------------------------------

  /**
   * Emergency Stop
   * Sends estop = true, zeroes twist, stops spraying, cancels picking
   */
  triggerEmergencyStop() {
    console.warn("[ROSManager] 🚨 EMERGENCY STOP ACTIVATED!");
    this.isEStopped = true;

    // 1. Publish E-STOP flag
    this.publish(CONFIG.TOPICS.EMERGENCY_STOP, { data: true });

    // 2. Publish zero velocity
    this.publish(CONFIG.TOPICS.CMD_VEL, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    });

    // 3. Stop spray
    this.publish(CONFIG.TOPICS.SPRAY_STOP, { data: true });

    // 4. Cancel picking
    this.publish(CONFIG.TOPICS.PICK_CANCEL, { data: true });

    if (this.onEStopChange) {
      this.onEStopChange(true);
    }
  },

  /**
   * Reset Emergency Stop
   */
  resetEmergencyStop() {
    console.log("[ROSManager] Resetting Emergency Stop state.");
    this.isEStopped = false;
    this.publish(CONFIG.TOPICS.EMERGENCY_STOP, { data: false });

    if (this.onEStopChange) {
      this.onEStopChange(false);
    }
  },

  /**
   * Trigger Sprinkler for duration (enforcing hard cap)
   */
  triggerSpray(durationSeconds) {
    // Enforce hard cap from config
    const safeDuration = Math.min(
      Math.max(durationSeconds, CONFIG.SPRAY.MIN_DURATION_SEC),
      CONFIG.SPRAY.MAX_DURATION_SEC
    );

    console.log(`[ROSManager] Spray triggered for ${safeDuration} seconds.`);
    return this.publish(CONFIG.TOPICS.SPRAY_TRIGGER, { data: safeDuration });
  },

  /**
   * Stop Sprinkler immediately
   */
  stopSpray() {
    console.log("[ROSManager] Spray stop triggered.");
    return this.publish(CONFIG.TOPICS.SPRAY_STOP, { data: true });
  }
};
