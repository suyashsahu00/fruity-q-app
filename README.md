# Fruity Q - Mobile Web Controller

Fruity Q ek mobile-first web app (PWA) hai jo orchard (baagicha) fruit-picking robot ko control karne ke liye design kiya gaya hai. Is app ko seedha Android Chrome me khol kar **"Add to Home screen"** karke use kiya ja sakta hai.

Yeh app browser ke andar **roslib.js** (rosbridge WebSocket) ke through robot ke saath communicate karta hai.

---

## 📁 File Structure & Har File Ka Kaam (Simple Hindi / Hinglish me)

- **`app/index.html`**  
  App ka main webpage structure. Isme Splash Screen, Robot Status Pill (Online/Offline), Home Screen, Sprinkling Screen, Confirmation Dialog aur har screen par dikhne wala Fixed **Emergency STOP** button hai. Isme koi online CDN link nahi hai, sab offline chalta hai.

- **`app/css/style.css`**  
  Pura styling aur appearance. Dhoop (bright sunlight) me saaf dikhne ke liye high-contrast bold text aur orange-to-red gradient theme diya gaya hai. Isme koi GIF file nahi hai, saare animations pure CSS se bane hain.

- **`app/js/config.js`**  
  **Sabse important file non-coders ke liye.** Robot ka IP address (`ROBOT_IP`), WebSocket port (`ROBOT_PORT`), spraying limits (1 se 5 seconds hard cap), aur sabhi ROS topics ka naam isi ek file me rehta hai. Jab Vikas topic ke final names de, bas isi file me edit karna hai.

- **`app/js/ros.js`**  
  Robot connection manager. Yeh robot se WebSocket connect karta hai, connection tootne par har 3 second me auto-reconnect karta hai, har 2 second me heartbeat check karta hai (agar 3 baar response nahi mila toh robot ko OFFLINE mark karke buttons disable kar deta hai), aur safety E-STOP bhejta hai.

- **`app/js/ui.js`**  
  Screen navigation (Home se Sprinkling par switch karna), 1 se 5 second spray duration select karna, spray confirm popup dikhana, feedback show karna ("Sprayed for X s"), aur STOP button handle karna.

- **`app/js/mock.js`**  
  Fake / Simulated robot. Jab physical robot paas me na ho, tab UI aur buttons ko test karne ke liye yeh simulate karta hai ki robot online hai aur ROS messages receive kar raha hai.

- **`app/lib/roslib.min.js`**  
  RobotWebTools ka official ROS WebSocket communication library, jo local folder me saved hai taaki bina internet ke bhi khet/orchard me app chal sake.

- **`app/assets/`**  
  - `robot.jpg`: Top hero card ke liye placeholder image.
  - `robot-demo.mp4`: Robot video ke liye placeholder file. (Aap apni photo/video yahan replace kar sakte hain).

- **`docs/ROS_CONTRACT.md`**  
  Vikas (ROS teammate) ke liye topic table, message types aur directions jisme sabhi unconfirmed topics par `TODO_ASK_VIKAS` likha hua hai.

---

## 🧪 Browser me App ko Kaise Test Karein (Testing Guide)

Aapko koi server install karne ya command chalane ki zaroorat nahi hai:

### Step 1: File ko Browser me Open karein
1. Apne laptop/computer me `app/index.html` file par double click karein (ya Chrome browser me drag and drop karein).
2. Starting me 1.2 seconds ke liye ek **Splash Screen** dikhegi (🍎 Fruity Q), uske baad Home Screen load ho jayegi.

### Step 2: OFFLINE State Check karein (Real Mode)
1. By default `CONFIG.MOCK_MODE = false` hai.
2. Top right corner me status pill **🔴 OFFLINE** dikhega (kyunki physical robot abhi connected nahi hai).
3. Actions safety ke liye locked/disabled rahenge.

### Step 3: Mock Mode (Simulation) Test karein
Bina robot ke saare buttons aur flow check karne ke liye:
1. `app/js/config.js` file ko Notepad ya kisi bhi text editor me kholein.
2. Line 18 par `MOCK_MODE: false` ko badal kar `MOCK_MODE: true` karein aur save karein:
   ```javascript
   MOCK_MODE: true,
   ```
3. Browser me page ko Refresh (`F5` ya `Ctrl + R`) karein.
4. Ab aapko:
   - Screen ke top par yellow **⚠️ DEMO MODE ACTIVE** banner dikhega.
   - Status pill **🟢 ONLINE** ban jayega.
   - **Sprinkling** card par click karein &rarr; Sprinkling Screen open ho jayegi.
   - 1 sec se 5 sec me se koi bhi duration select karein.
   - **"SPRAY NOW"** click karein &rarr; Safety confirmation popup open hoga.
   - **"Confirm & Spray"** dabayein &rarr; Animation chalegi aur "Sprayed for X s" ka message aayega.
   - F12 dabakar Chrome DevTools Console me dekhein: aapko har topic publication ka clear log dikhega.

### Step 4: Fixed Emergency STOP Test karein
1. Screen ke bottom par hamesha ek bada red **🛑 EMERGENCY STOP** button rehta hai.
2. Isse press karte hi robot ko instant stop signal chala jayega aur button "RESUME / RESET E-STOP" me badal jayega.
