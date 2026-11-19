# Project Updates & Changelog

Parent note: [[Street Talks - Home]]

This note tracks every update implemented across the **Street Talks** system.

---

## 🚀 Summary of Recent Updates

### 1. [[Brand & Offerings|Brand & Identity Transition]]
* **Rebrand:** Transitioned from Oqulix AI to **Street Talks (StreetTalks)** — *"Your Brand Inside Every Ride"*.
* **Core Product:** In-Auto Backlit Lightboard Advertising (illuminated panels inside autorickshaws across Kochi — **not** digital video screens).
* **Location:** MG Road, Kochi, Kerala | Contact: `+91 8593040417` / `+91 9497694866`.
* **Reference File:** [knowledge.md](file:///d:/meta%20automation/data/oqulix/knowledge.md)

---

### 2. [[Pricing & ROI Calculator|Pricing & Commercial Rules]]
* **Fixed Plans Only:**
  1. **1 Month:** ₹2,000 per autorickshaw (~₹67/day breakdown).
  2. **2 Months:** ₹3,500 per autorickshaw (~₹58/day breakdown, saves ₹500).
* **The ₹67 Rule:** No daily ad sales. ₹67 is strictly the daily breakdown calculation of the monthly plan.
* **Under 80 Paise ROI:** Each autorickshaw carries 80–100 passengers daily, meaning guaranteed customer views cost less than **80 paise per person**.
* **Price Reveal Policy:** AI never mentions price first; prices are only given when requested.

---

### 3. [[AI Sales Strategy & Prompt Rules|AI Sales & Conversation Logic]]
* **Humanized Plain Text:** All emojis removed from AI responses; speaks warmly and naturally in English or Malayalam/Manglish.
* **Terminology:** Strictly enforced the word **"autorickshaws"** instead of "autos".
* **Progressive Fleet Pitching:**
  - Initial messages: Welcome customer and discuss their business without mentioning fleet quantities.
  - When customer asks for 1 autorickshaw: Explain that **3 autorickshaws is the minimum**, and pitch **10 to 20 autorickshaws** for city-wide reach.
* **Code Files:**
  - [whatsapp-gemini.js](file:///d:/meta%20automation/src/ai/whatsapp-gemini.js)
  - [gemini.js](file:///d:/meta%20automation/src/ai/gemini.js)

---

### 4. [[WhatsApp Cloud Automation|WhatsApp Proof Media & Deduplication]]
* Automatically dispatches 3 sample/proof photos when customers show interest or ask for rates.
* **One-Time Send Protection:** Added an in-memory `Set` (`photosSentNumbers`) and Firestore flag (`samples_sent: true`) in [whatsapp-handler.js](file:///d:/meta%20automation/src/services/whatsapp-handler.js) so photos are never repeatedly sent in the same chat.

---

### 5. [[Assets & Branding|High-Resolution Branding & Crisp Favicons]]
* Created circular, high-contrast autorickshaw emblem icons with an illuminated gold rim border:
  - `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`.
* Created [manifest.json](file:///d:/meta%20automation/public/manifest.json) for mobile PWA support.
* Updated Admin Dashboard navbar and Voice Assistant headers.

---

### 6. [[CRM Dashboard & Excel Export|CRM Lead Ranking & Excel Export]]
* Added green **"📊 Export Excel"** button on the CRM top bar in [index.html](file:///d:/meta%20automation/public/admin/index.html).
* Automatically sorts leads by rank/score (**HOT** leads first) and downloads a clean CSV compatible with Excel and Google Sheets.
* Excluded the long chat text column to keep reports clean and readable.

---

## 🔗 Related Notes
- [[Street Talks - Home]]
- [[AI Sales Strategy & Prompt Rules]]
- [[Pricing & ROI Calculator]]
- [[CRM Dashboard & Excel Export]]
