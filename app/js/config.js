/**
 * ==============================================================================
 * FRUITY Q - APPLICATION CONFIGURATION
 * ==============================================================================
 * Note for non-coders:
 * You can safely change the values inside the quotes (like "192.168.1.100")
 * or numbers (like 9090) to match your robot's setup.
 * All ROS topics and safety limits are strictly defined here.
 * ==============================================================================
 */

const CONFIG = {
  // ----------------------------------------------------------------------------
  // 1. ROBOT CONNECTION SETTINGS
  // ----------------------------------------------------------------------------
  // Set MOCK_MODE to true if you are testing the app on your phone/laptop
  // WITHOUT connecting to the real robot hardware.
  // When true: a persistent "DEMO MODE" banner will be visible.
  MOCK_MODE: true,

  // IP address of the robot on your local WiFi network / hotspot:
  ROBOT_IP: "192.168.1.100",

  // Port where rosbridge_websocket is running (default is 9090):
  ROBOT_PORT: 9090,

  // Get the full WebSocket URL automatically:
  get ROSBRIDGE_URL() {
    return `ws://${this.ROBOT_IP}:${this.ROBOT_PORT}`;
  },

  // Connection timing (in milliseconds):
  RECONNECT_INTERVAL_MS: 3000,    // Try reconnecting every 3 seconds if disconnected
  HEARTBEAT_INTERVAL_MS: 2000,    // Check robot heartbeat every 2 seconds
  MAX_MISSED_HEARTBEATS: 3,       // 3 missed checks = mark OFFLINE and disable actions

  // ----------------------------------------------------------------------------
  // 2. SAFETY & OPERATIONAL LIMITS (Hard Caps)
  // ----------------------------------------------------------------------------
  SPRAY: {
    MIN_DURATION_SEC: 1,          // Minimum selectable spray duration
    MAX_DURATION_SEC: 5,          // Hard cap: cannot spray longer than 5 seconds
    DEFAULT_DURATION_SEC: 2       // Default duration selected on the screen
  },

  TELEOP: {
    PUBLISH_RATE_HZ: 10,          // Publish velocity commands at 10 Hz (every 100ms)
    // Slow speed (default) - safe for indoor/narrow orchard rows
    SLOW_LINEAR: 0.2,             // Forward/backward speed - Slow mode (m/s)
    SLOW_ANGULAR: 0.4,            // Turning speed - Slow mode (rad/s)
    // Medium speed - for open orchard areas
    MEDIUM_LINEAR: 0.4,           // Forward/backward speed - Medium mode (m/s)
    MEDIUM_ANGULAR: 0.7           // Turning speed - Medium mode (rad/s)
  },

  PICKING: {
    TIMEOUT_SEC: 60,              // If robot doesn't finish picking in 60s, show "Timed out"
    // Set DISTANCE_TOPIC to a string if your robot publishes fruit distance.
    // Example: "TODO_ASK_VIKAS/picking/distance"
    // Set to null to hide the distance display entirely.
    DISTANCE_TOPIC: null
  },

  // ----------------------------------------------------------------------------
  // 3. ROS TOPICS (DO NOT GUESS - Ask Vikas to confirm exact names)
  // ----------------------------------------------------------------------------
  TOPICS: {
    // E-STOP & Safety
    EMERGENCY_STOP: {
      name: "TODO_ASK_VIKAS/emergency_stop",
      messageType: "std_msgs/Bool"
    },
    HEARTBEAT: {
      name: "TODO_ASK_VIKAS/heartbeat",
      messageType: "std_msgs/Header"
    },

    // Sprinkling Module
    SPRAY_TRIGGER: {
      name: "TODO_ASK_VIKAS/sprayer/trigger",
      messageType: "std_msgs/Float32"
    },
    SPRAY_STOP: {
      name: "TODO_ASK_VIKAS/sprayer/stop",
      messageType: "std_msgs/Bool"
    },
    SPRAY_STATUS: {
      name: "TODO_ASK_VIKAS/sprayer/status",
      messageType: "std_msgs/String"
    },

    // Fruit Picking Module
    PICK_START: {
      name: "TODO_ASK_VIKAS/picking/start",
      messageType: "std_msgs/Bool"
    },
    PICK_CANCEL: {
      name: "TODO_ASK_VIKAS/picking/cancel",
      messageType: "std_msgs/Bool"
    },
    PICK_STATE: {
      name: "TODO_ASK_VIKAS/picking/state",
      messageType: "std_msgs/String"
    },

    // Logistics & Teleop
    CMD_VEL: {
      name: "TODO_ASK_VIKAS/cmd_vel",
      messageType: "geometry_msgs/Twist"
    },
    FOLLOW_ME: {
      name: "TODO_ASK_VIKAS/follow_me/enable",
      messageType: "std_msgs/Bool"
    }
  }
};

// Freeze the configuration object to prevent accidental runtime modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.SPRAY);
Object.freeze(CONFIG.TELEOP);
Object.freeze(CONFIG.PICKING);
Object.freeze(CONFIG.TOPICS);
