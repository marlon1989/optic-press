# OpticPress ⚡

**Lossless-Grade Image Optimization. Edge Computation. Absolute Privacy.**

OpticPress is a professional-grade, browser-based image compression engine designed for performance-driven developers and photographers. It reimagines image processing by moving heavy computation from the server to the user's hardware, ensuring massive scalability and total data sovereignty.

---

## 🧠 The Engineering Philosophy

Most "free" online compressors are either data-harvesters or gated by slow server-side APIs. OpticPress breaks this paradigm by using **Industrial-Scale Client-Side Architecture**:

- **Off-Main-Thread Processing:** All compression logic runs in isolated Web Workers. Your UI stays at a buttery-smooth 60FPS even while processing 10,000+ files.
- **RAM-Safe Pipeline:** Unlike naive implementations that crash the browser by holding blobs in memory, OpticPress utilizes **IndexedDB (via OpticDB)** as an ephemeral disk. Memory references are purged immediately after processing.
- **Reactive Pressure Sensing (RPS):** OpticPress doesn't just guess performance based on hardware specs; it monitors real-time latency for every job. The engine dynamically scales its concurrency and yield-sleep cycles (Elastic Backoff) based on V8 Heap pressure and system response times to prevent OOM (Out-of-Memory) crashes.

---

## 🚀 Key Features

- **Massive Batch Support:** Handles thousands of images with a recursive folder traversal engine (`FileSystem API`).
- **WebAssembly-Grade Speed:** Optimized `OffscreenCanvas` recycling and `createImageBitmap` decode-to-GPU pathways.
- **Privacy First:** Your images never leave your machine. Processing happens entirely within the browser's sandbox.
- **Professional IO:** Auto-generation of deterministic ZIP files via chunked disk-to-archive streaming, dynamically adjusted for device RAM (200MB chunks on mobile vs 800MB on desktop).
- **Mobile-First Resilience:** Throttled concurrency and elastic yielding tailored for iOS/Android WebView contexts, ensuring professional stability on the go.
- **Dark-Logic Ecosystem:** Slate/Emerald UI designed for high-precision analytical work, reflecting terminal-style performance.

---

## 🛠️ Tech Stack

- **Core:** Vanilla JavaScript (ES Module-based)
- **Typing:** Strict JSDoc Type-Checking (`@ts-check`)
- **Storage:** IndexedDB (Persistent Ephemeral Storage)
- **UI:** Tailwind CSS + Vite (Rollup)
- **Performance:** Multi-threaded Web Workers Architecture

---

## 🏁 Quick Start

1. **Clone & Install:**
   ```bash
   git clone https://github.com/marlon1989/optic-press.git
   cd optic-press
   npm install
   ```

2. **Development:**
   ```bash
   npm run dev
   ```

3. **Build & Optimize:**
   ```bash
   npm run build
   ```

---

## 📐 Architecture Breakdown

- **OpticUI:** Decoupled View Layer for state management.
- **OpticFileQueue:** Orchestration layer with Dependency Injection (DI) support.
- **OpticExporter:** Batch ZIP generation with disk-backpressure handling.
- **Worker Hub:** Parallel computational engine for lossless-to-lossy conversions.

---

## 🛡️ Security & Performance

OpticPress is deployed with aggressive **Immutable Cache Headers** and a strict **Content Security Policy (CSP)**. 

- **Edge Caching:** Assets are cached for 1 year in CDNs.
- **Resource Exhaustion Guard:** Built-in sleep-yield cycles to allow V8 Garbage Collection breathing room during intensive batch runs.

---

**Designed with Precision. Engineered for Scale. OpticPress.**
