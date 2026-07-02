# 🏃‍♂️ AI-Fit-Coach (Replace with your App Name)

> An intelligent, on-device fitness coaching Android application featuring a Local LLM AI Coach, real-time heart-rate playback, and AI-powered posture detection.

![App Demo Placeholder](link-to-your-awesome-gif.gif)
*(💡 記得錄 5-10 秒 App 運行 GIF 放喺度！)*

## 🌟 Core Features

* **🧠 On-Device AI Coach (Local LLM):** Features an offline, natural-language chat interface powered by a local GGUF model (Gemma). Supports "thinking" mode and token streaming to generate personalized workout guidance natively on the device.
* **🧘‍♂️ Real-time Pose & Posture Detection:** Utilizes a client-side Pose Coach (TensorFlow.js + MoveNet) to analyze video/webcam frames. It computes joint angles and provides live form feedback, integrated with the LLM for richer coaching.
* **🫀 Realistic Heart-Rate Simulation:** Plays back real wearable heart-rate sessions from the WESAD dataset. Streams data point-by-point to update live metrics (Current/Avg HR, duration, dynamic charts).
* **🔥 Scientific Calorie Tracking:** Calculates energy expenditure using research-backed algorithms, combining the Karvonen method with BMR (Mifflin–St Jeor equation).

## 🛠️ Tech Stack & Architecture

This project utilizes a **Hybrid Architecture**, wrapping a complex Web/AI frontend within a native Android module.

**Native Android Wrapper:**
* **Language:** Kotlin
* **Framework:** Android SDK, WebView integration
* **Build System:** Gradle (Kotlin DSL)

**Frontend & AI Engine (Client-Side):**
* **Core:** JavaScript, HTML5, CSS3
* **Machine Learning:** TensorFlow.js, MoveNet (Pose Detection)
* **Local LLM:** Native Kotlin bridge communicating with Web UI for Gemma GGUF model processing.

**Data Processing:**
* **Python:** Used for preprocessing raw WESAD research files into lightweight JSON structures for the app.

## 🚀 Getting Started

To run this project locally, you will need Android Studio and Node.js installed.

### 1. Build the Web Assets
First, install the web dependencies and build the frontend assets:

```bash
# Navigate to the web frontend directory
npm install
npm run build
```

### 2. Run the Android App
Open the project in Android Studio.

- Sync Project with Gradle Files.
- Build and run on a physical Android device (Recommended for Local LLM and Camera performance) or an emulator.

Alternatively, use the command line:

```bash
# Build and install debug on a connected device/emulator
./gradlew assembleDebug
./gradlew installDebug
```

## Project Structure Overview

- `app/src/main/java/.../` - Native Kotlin Android code (e.g., ChatViewModel.kt, WebView bridge).
- `app/src/main/assets/` - Compiled web assets, Local LLM chat logic (`local-llm-chat.js`), Pose Coach module (`app.js`), and processed WESAD data.
- `prepare_app_data.py` - Python script for dataset processing.

---

手足，我已經準備好要將呢個 README.md 更新到你嘅 repository。要我幫你把它 commit 上去嗎？
