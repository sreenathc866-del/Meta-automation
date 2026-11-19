# Street Talks — Project Updates & Changelog (Simple Guide)

This document contains a simple summary of every update made to the project.

---

## 1. Company Name & Service Changed
* **New Name:** **Street Talks** (previously Oqulix).
* **Service:** In-Auto Backlit Lightboard Advertising inside autorickshaws across Kochi (illuminated glowing boards, **not** digital TV screens).
* **Office & Contact:** MG Road, Kochi | Phone/WhatsApp: `8593040417` / `9497694866`.

---

## 2. Pricing & Packages Updated
We only have **2 fixed packages**:
1. **1 Month:** ₹2,000 per autorickshaw (~₹67 per day).
2. **2 Months:** ₹3,500 per autorickshaw (~₹58 per day - Save ₹500).

* **The ₹67 Rule:** We do not sell daily ads. ₹67 is simply the daily calculation of the ₹2,000 monthly plan.
* **Customer Cost Breakdown:** Each autorickshaw carries 80 to 100 passengers daily, meaning it costs less than **80 paise per passenger** to read the ad.

---

## 3. AI Sales Rules & Conversation Flow
1. **Never tell price first:** The AI talks about the advertising and asks about the customer's business first. It only gives the price when the customer asks: *"How much?"* or *"What is the rate?"*.
2. **Never push 10–20 autorickshaws in the first message:**
   * When a customer shares their business (like a furniture shop or clinic), the AI simply encourages them.
   * **Only when the customer says:** *"Can we start with 1 auto?"*, the AI explains:
     - Minimum setup is **3 autorickshaws**.
     - Setting up **10 to 20 autorickshaws** reaches thousands of passengers daily across all major Kochi routes to get faster leads and calls.
3. **Always say "autorickshaws":** Never use the short word "autos".
4. **Humanized & No Emojis:** The AI talks like a real person in plain text without emojis or robotic templates.
5. **Clean Names:** Even if the customer's WhatsApp profile has emojis or weird symbols, the AI never repeats emojis in the chat.

---

## 4. WhatsApp Sample Photos (Sent Only Once)
* When a customer asks for photos, rates, or shows interest, the system automatically sends **3 proof photos**:
  1. Live glowing lightboard mounted inside the autorickshaw.
  2. Proposal and rate card.
  3. Malayalam ₹67/day promotional poster.
* **Duplicate Fix:** Added a strict check so the photos are sent **only one time per customer**, never repeatedly.

---

## 5. Clear Logo, Favicon & PWA Icons Added
* Replaced the old blurry logo with a sharp, glowing autorickshaw emblem with a gold circular border.
* Created all icon formats:
  - `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` (for browser tabs).
  - `apple-touch-icon.png` (for iPhones/iPads).
  - `icon-192.png`, `icon-512.png`, and `manifest.json` (for Android and PWA mobile app install).
* Updated Admin Dashboard title and Voice Assistant headers to **Street Talks**.

---

## 6. Excel Download Button Added to CRM
* Added a green **"📊 Export Excel"** button on the top bar of the Admin Dashboard (`/admin/`).
* Clicking it instantly downloads an Excel `.csv` file with:
  - **Rank & Lead Score** (HOT leads sorted at the top).
  - **Category / Status** (`HOT`, `WARM`, `COLD`).
  - **Customer Name & Phone Number**.
  - **Business Type, Service Required, Urgency, Budget & Date**.
* **Chat text removed:** As requested, the long chat message column was removed to keep the spreadsheet clean.

---

## 7. Files Changed in Project
* `data/oqulix/knowledge.md` — Updated knowledge base with Street Talks lightboard info & pricing.
* `src/ai/whatsapp-gemini.js` — WhatsApp AI sales prompt & lead scoring.
* `src/ai/gemini.js` — Web chat & voice assistant prompt.
* `src/services/whatsapp-handler.js` — Welcome message, duplicate photo protection & Cloud API handling.
* `public/admin/index.html` & `app.js` — Street Talks branding, clear favicons & Export Excel feature.
* `public/index.html` — Voice assistant branding & favicons.
* `public/manifest.json` — PWA setup for mobile app installation.
* `public/images/` — Sample autorickshaw lightboard photos & logo files.
