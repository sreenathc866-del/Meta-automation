# Street Talks — Project Hub & Architecture

Welcome to the **Street Talks** Meta Automation & AI CRM Vault.

---

## 📌 Quick Navigation
- [[Project Updates]] — Complete changelog of all recent updates.
- [[Brand & Offerings]] — In-Auto Backlit Lightboard Advertising details & company background.
- [[Pricing & ROI Calculator]] — Fixed packages, breakdown logic, and customer view calculations.
- [[AI Sales Strategy & Prompt Rules]] — Conversational flow, fleet pitches, and communication guidelines.
- [[WhatsApp Cloud Automation]] — Webhook handlers, one-time photo delivery, and deduplication logic.
- [[CRM Dashboard & Excel Export]] — Admin interface, real-time polling, and lead export functionality.
- [[Assets & Branding]] — Favicons, logos, proof photos, and PWA assets.

---

## 🏗️ Technical Stack & Key Files
- **Backend Server:** [server.js](file:///d:/meta%20automation/server.js) (Express, WebSockets, WhatsApp Webhooks)
- **Knowledge Base (RAG):** [knowledge.md](file:///d:/meta%20automation/data/oqulix/knowledge.md)
- **AI Core:**
  - WhatsApp Consultant: [whatsapp-gemini.js](file:///d:/meta%20automation/src/ai/whatsapp-gemini.js)
  - Web & Voice Consultant: [gemini.js](file:///d:/meta%20automation/src/ai/gemini.js)
  - WhatsApp Handler: [whatsapp-handler.js](file:///d:/meta%20automation/src/services/whatsapp-handler.js)
- **Frontend Dashboard:**
  - HTML Interface: [index.html](file:///d:/meta%20automation/public/admin/index.html)
  - Application Logic: [app.js](file:///d:/meta%20automation/public/admin/app.js)
  - Voice UI: [index.html](file:///d:/meta%20automation/public/index.html)
