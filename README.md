# MyApplication

Initial implementation.

## Overview

MyApplication is an in-progress project (initial implementation). This repository contains the source code and assets for the project. The codebase currently includes web frontend code (JavaScript, HTML, CSS) and Kotlin code (e.g., Android or Kotlin JVM code). Use this README as a starting point — update the sections below with project-specific details.

## Core function

- Plays back real wearable heart-rate sessions (WESAD dataset) as realistic workout sessions inside the app.
- Streams heart-rate data point-by-point (≈1 sample/second) to the UI during a workout and updates live metrics: current HR, average HR, duration, chart, and calories burned.
- Calculates calories using research-backed formulas (Karvonen method + BMR via Mifflin–St Jeor) to produce realistic energy-expenditure estimates.
- Stores finished sessions in a local history and clearly indicates the research subject / data source for transparency and reproducibility.
- Local LLM: includes an on-device chat powered by a local GGUF model (Gemma format) with a web UI and native Kotlin bridge. The model supports "thinking" mode, token streaming, and can be used as an AI coach for natural-language guidance and plan generation. Files: `app/src/main/assets/local-llm-chat.js`, `app/src/main/java/.../ChatViewModel.kt`, `sample_local_llm_history_conversation.json`.
- Pose / Posture detection: a client-side Pose Coach using TensorFlow.js + MoveNet analyzes uploaded videos (or webcam frames), computes joint angles and form metrics, and returns feedback in the UI; the pose module can be tied into the LLM to produce richer natural-language coaching. Files: `app/src/main/assets/app.js` (Pose Coach module), `index.html` Pose Coach tab.

## Tech stack

- Frontend: JavaScript, HTML, CSS — the app UI and playback logic live as web assets (app/src/main/assets/).
- Mobile wrapper: Kotlin (Android) — an Android module loads the web assets in a WebView; project builds with Gradle (Kotlin DSL).
- Data processing: Python scripts used to convert raw WESAD research files into the processed app JSON (prepare_app_data.py → data.json).
- Build tools: Gradle wrapper (gradlew) and standard Android tooling; the web assets can be tested in a browser (test_chat.html) as well.
- Data: WESAD Research Dataset (processed into app/src/main/assets/data.json — ~287.6 KB, 55 sessions).

## Language composition

- JavaScript: ~51.6%
- HTML: ~18.5%
- Kotlin: ~17.0%
- CSS: ~12.9%

## Status

Work in progress. Expect incomplete features, rough edges, and breaking changes while development continues.

## Project structure (example)

- / (repository root)
  - README.md            - this file
  - package.json         - (if present) Node/npm project metadata
  - android/ or app/     - (if present) Kotlin/Android module
  - src/                 - JavaScript/HTML/CSS frontend source
  - web/                 - static web content

Adjust the structure above to reflect the actual layout of this repository.

## Getting started

Follow these general steps to run or develop the project locally. Replace or remove steps that do not apply.

Prerequisites

- Node.js (v14+) and npm or yarn — for JavaScript/web parts
- Java 11+ and Android Studio/Gradle — for Kotlin/Android parts (if applicable)

Run the web frontend (if applicable)

1. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

2. Start the dev server:

   ```bash
   npm start
   # or
   yarn start
   ```

3. Build for production:

   ```bash
   npm run build
   # or
   yarn build
   ```

Run Kotlin/Android module (if applicable)

1. Open the Android/Kotlin module in Android Studio.
2. Build and run on an emulator or device.
3. Or use Gradle on the command line:

   ```bash
   ./gradlew assembleDebug
   ./gradlew installDebug
   ```

Running tests

- JavaScript: `npm test` or `yarn test` (if test scripts are defined)
- Kotlin: `./gradlew test` (if Gradle is configured)

## Development workflow

- Create a feature branch: `git checkout -b feat/my-feature`
- Commit changes with clear messages
- Open a pull request against the repository's default branch for review

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before implementing them. Follow these guidelines:

- Keep commits small and focused
- Write tests for new features when possible
- Update this README with any new setup steps or architectural notes

## TODO / Roadmap

- Clarify the repository structure in this README
- Add build and run commands for each module
- Add unit/integration tests
- Add CI configuration and code style checks

## License

If you have a preferred license, add a LICENSE file at the repository root (for example, MIT). Until a license is added, assume the project has no explicit open-source license.

## Contact

If you have questions, open an issue or contact the repository maintainer.
