# CRM Dashboard & Excel Export

Parent note: [[Street Talks - Home]] | See also: [[WhatsApp Cloud Automation]]

---

## 🖥️ Overview of Dashboard (`/admin/`)
The Street Talks CRM provides a live management portal for WhatsApp leads and Meta Ads performance.

* **Live URL:** `https://meta-automation-9mr8.onrender.com/admin/`
* **Local Path:** [public/admin/index.html](file:///d:/meta%20automation/public/admin/index.html)
* **Real-Time Polling:** Polls every 3 seconds for immediate lead and message updates without page reloads.

---

## 📊 One-Click Excel Export Feature
Located in the top navbar next to the "🎯 Meta Ads" button:

```html
<button id="export-excel-btn" onclick="exportLeadsToExcel()">📊 Export Excel</button>
```

### Export Specification:
* **Sorting:** Automatically pre-sorted by **Lead Score / Ranking** descending (**HOT** leads sorted at top).
* **Format:** Universal UTF-8 CSV with BOM, opening natively in Microsoft Excel, Apple Numbers, and Google Sheets.
* **Fields Included:**
  1. `Rank` (1, 2, 3...)
  2. `Lead Score` (e.g. 95, 80, 50, 10)
  3. `Category / Status` (`HOT`, `WARM`, `COLD`, `UNQUALIFIED`)
  4. `Customer Name`
  5. `Phone Number`
  6. `Business Type`
  7. `Service Required`
  8. `Urgency`
  9. `Budget`
  10. `Date Added`
* **Exclusion:** The long chat message history is excluded to keep the spreadsheet clean.

### Code Reference:
- Function Definition: [app.js](file:///d:/meta%20automation/public/admin/app.js#L1899-L1970)
