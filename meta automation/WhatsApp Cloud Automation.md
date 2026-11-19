# WhatsApp Cloud Automation

Parent note: [[Street Talks - Home]] | See also: [[AI Sales Strategy & Prompt Rules]]

---

## ⚙️ Architecture & Data Flow

1. **Incoming Webhook:** Meta sends incoming WhatsApp messages to `/api/meta/webhook` in [server.js](file:///d:/meta%20automation/server.js).
2. **Deduplication:** Filtered through in-memory `processedMessages` set in [server.js](file:///d:/meta%20automation/server.js#L16).
3. **Queue Processing:** Passed to `processSequentially(phoneNumber, ...)` to ensure FIFO processing per phone number.
4. **Execution & AI Response:** Handled in [whatsapp-handler.js](file:///d:/meta%20automation/src/services/whatsapp-handler.js).

---

## 📸 Automated Sample Photos (One-Time Send)

When a customer expresses interest, asks for samples, or turns into a **HOT** lead, the system automatically sends 3 proof photos:
1. `public/images/autoads_screen_live.jpg` (Mounted glowing lightboard)
2. `public/images/autoads_pricing_proposal.jpg` (Official proposal & rate breakdown)
3. `public/images/autoads_malayalam_offer.jpg` (Malayalam ₹67/day promotional creative)

### 🔒 Strict One-Time Gate:
```javascript
// In src/services/whatsapp-handler.js
const photosSentNumbers = new Set();

const alreadySent = photosSentNumbers.has(phoneNumber) || (lead && lead.samples_sent);
const wantsPhotos = (leadData.send_sample_photos || leadData.lead_status === 'HOT') && !alreadySent;

if (wantsPhotos) {
    photosSentNumbers.add(phoneNumber);
    if (lead) {
        lead.samples_sent = true;
        db.collection('leads').doc(lead.id).update({ samples_sent: true }).catch(() => {});
    }
    // send WhatsApp media...
}
```
This guarantees the customer **never receives duplicate images** in the same conversation.

---

## 🗄️ Related Handlers
- Service File: [whatsapp-handler.js](file:///d:/meta%20automation/src/services/whatsapp-handler.js)
- AI Generator: [whatsapp-gemini.js](file:///d:/meta%20automation/src/ai/whatsapp-gemini.js)
