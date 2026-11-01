# Fruity Q - ROS Communication Contract

This document lists all ROS topics, message types, and directions of communication between the Fruity Q web app and the robot.

> **CRITICAL RULE**: Do not guess topic names. Any unconfirmed topic name is marked with `TODO_ASK_VIKAS` until confirmed by the robot hardware/ROS engineer (Vikas).

---

## 1. System & Safety Topics

| Function | Topic Name | Message Type | Direction | Description | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Emergency Stop** | `TODO_ASK_VIKAS/emergency_stop` | `std_msgs/Bool` | App &rarr; Robot | Sends `data: true` when big red STOP is pressed. Stops all motion and actuators immediately. | Pending Confirmation |
| **Heartbeat (Robot to App)** | `TODO_ASK_VIKAS/heartbeat` | `std_msgs/Header` (or `std_msgs/Empty` / `std_msgs/Time`) | Robot &rarr; App | Robot sends periodic ping (at least 1 Hz) so the app knows the robot is alive. 3 missed cycles = OFFLINE. | Pending Confirmation |

---

## 2. Sprinkling Module Topics

| Function | Topic Name | Message Type | Direction | Description | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trigger Spray** | `TODO_ASK_VIKAS/sprayer/trigger` | `std_msgs/Float32` (or `std_msgs/Int32`) | App &rarr; Robot | Publishes spray duration in seconds (1 to 5 seconds, hard-capped in config). | Pending Confirmation |
| **Stop Spray** | `TODO_ASK_VIKAS/sprayer/stop` | `std_msgs/Bool` | App &rarr; Robot | Forces the sprayer pump/valve to shut off immediately (sent on STOP or cancel). | Pending Confirmation |
| **Sprayer Status** | `TODO_ASK_VIKAS/sprayer/status` | `std_msgs/String` | Robot &rarr; App | Feedback from sprayer (e.g., "IDLE", "SPRAYING", "DONE"). | Pending Confirmation |

---

## 3. Fruit Picking Module Topics (Future Phase)

| Function | Topic Name | Message Type | Direction | Description | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Start Picking** | `TODO_ASK_VIKAS/picking/start` | `std_msgs/Bool` | App &rarr; Robot | Triggers the picking sequence once pre-start checklist is completed. | Pending Confirmation |
| **Cancel Picking** | `TODO_ASK_VIKAS/picking/cancel` | `std_msgs/Bool` | App &rarr; Robot | Aborts current picking sequence. | Pending Confirmation |
| **Picking State / Tracker** | `TODO_ASK_VIKAS/picking/state` | `std_msgs/String` | Robot &rarr; App | Drives the step tracker. Valid values: `Searching`, `Aligned`, `Gripping`, `Cutting`, `Picked`. If no message, shows "Waiting for robot". | Pending Confirmation |

---

## 4. Logistics Module Topics (Future Phase)

| Function | Topic Name | Message Type | Direction | Description | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Manual Move (Teleop)** | `TODO_ASK_VIKAS/cmd_vel` | `geometry_msgs/Twist` | App &rarr; Robot | Published at 10 Hz while arrow buttons are held down. Sends all zeros on release or disconnect. | Pending Confirmation |
| **Follow-Me Mode** | `TODO_ASK_VIKAS/follow_me/enable` | `std_msgs/Bool` | App &rarr; Robot | Enables or disables person-following autonomous mode after confirmation. | Pending Confirmation |

---

## Instructions for Vikas / Hardware Team
Please review the topic names above and replace every `TODO_ASK_VIKAS/...` path with your actual ROS / ROS2 rosbridge topics. Update `app/js/config.js` accordingly.

