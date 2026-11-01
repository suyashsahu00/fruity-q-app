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
 * - Logging received ROS publications (Spray, E-Stop, Velocity)
 * ==============================================================================
 */

const MockRobot = {
  isOnline: false,
  heartbeatTimer: null,

  start() {
    console.log("[MOCK ROBOT] Initializing simulated robot backend...");
    // Simulate connection delay
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
    
    // Simulate Sprayer response
    if (topicName === CONFIG.TOPICS.SPRAY_TRIGGER.name) {
      console.log(`[MOCK ROBOT] 💦 Pump activated for ${message.data} seconds.`);
      setTimeout(() => {
        console.log(`[MOCK ROBOT] 💦 Spray completed successfully.`);
      }, message.data * 1000);
    }

    // Simulate E-Stop response
    if (topicName === CONFIG.TOPICS.EMERGENCY_STOP.name && message.data === true) {
      console.warn(`[MOCK ROBOT] 🛑 EMERGENCY STOP TRIGGERED! All motors halted.`);
    }
  },

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.isOnline = false;
    if (typeof ROSManager !== "undefined" && ROSManager.onConnectionChange) {
      ROSManager.onConnectionChange(false);
    }
  }
};
