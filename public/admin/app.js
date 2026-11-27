// --- Security & PIN Authentication State ---
// Using sessionStorage so the session is automatically cleared when the browser or tab is closed
let adminToken = sessionStorage.getItem('street_talks_admin_token') || null;
let enteredPin = '';

// Attach authorization token to all fetch calls automatically
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    options = options || {};
    options.headers = options.headers || {};
    
    // Normalize headers object
    if (adminToken) {
        if (options.headers instanceof Headers) {
            options.headers.set('Authorization', `Bearer ${adminToken}`);
        } else if (Array.isArray(options.headers)) {
            options.headers.push(['Authorization', `Bearer ${adminToken}`]);
        } else {
            options.headers['Authorization'] = `Bearer ${adminToken}`;
        }
    }
    
    return originalFetch(url, options).then(res => {
        if (res.status === 401 && !url.includes('/auth/')) {
            // Unauthorized / expired session -> show PIN lock
            showPinOverlay();
        }
        return res;
    });
};

function showPinOverlay() {
    enteredPin = '';
    updatePinDots();
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function hidePinOverlay() {
    const overlay = document.getElementById('pin-lock-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updatePinDots() {
    for (let i = 0; i < 6; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (!dot) continue;
        if (i < enteredPin.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled', 'success');
        }
    }
}

async function handlePinInput(digit) {
    if (enteredPin.length >= 6) return;
    enteredPin += digit;
    updatePinDots();
    document.getElementById('pin-error-msg').innerText = '';

    if (enteredPin.length === 6) {
        await submitPin();
    }
}

function handlePinBackspace() {
    if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
        document.getElementById('pin-error-msg').innerText = '';
    }
}

function clearPin() {
    enteredPin = '';
    updatePinDots();
    document.getElementById('pin-error-msg').innerText = '';
}

async function submitPin() {
    const errorEl = document.getElementById('pin-error-msg');
    const dotsContainer = document.getElementById('pin-dots-container');
    
    try {
        const res = await originalFetch('/api/admin/auth/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: enteredPin })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success && data.token) {
            adminToken = data.token;
            // Store only in sessionStorage so it clears on browser close
            sessionStorage.setItem('street_talks_admin_token', adminToken);
            localStorage.removeItem('street_talks_admin_token'); // clean legacy localStorage
            
            // Success animation: glow green
            for (let i = 0; i < 6; i++) {
                const dot = document.getElementById(`dot-${i}`);
                if (dot) dot.classList.add('success');
            }
            
            setTimeout(() => {
                hidePinOverlay();
                fetchLeads();
                fetchConnectedAccounts().catch(() => {});
                fetchAdCampaigns().catch(() => {});
            }, 300);
        } else {
            // Error shake animation
            dotsContainer.classList.add('shake-animation');
            errorEl.innerText = data.error || 'Incorrect PIN';
            setTimeout(() => {
                dotsContainer.classList.remove('shake-animation');
                clearPin();
            }, 500);
        }
    } catch (err) {
        errorEl.innerText = 'Network connection failed. Please retry.';
        clearPin();
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('street_talks_admin_token');
    localStorage.removeItem('street_talks_admin_token');
    adminToken = null;
    showPinOverlay();
}

// Support physical keyboard digit input for desktop users
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('pin-lock-overlay');
    if (!overlay || overlay.style.display === 'none') return;

    if (e.key >= '0' && e.key <= '9') {
        handlePinInput(e.key);
    } else if (e.key === 'Backspace') {
        handlePinBackspace();
    } else if (e.key === 'Escape') {
        clearPin();
    }
});

// Check existing session token on startup
async function checkAuthOnStartup() {
    if (!adminToken) {
        showPinOverlay();
        return;
    }
    
    try {
        const res = await originalFetch('/api/admin/auth/validate-session', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            hidePinOverlay();
            fetchLeads();
            fetchConnectedAccounts().catch(() => {});
            fetchAdCampaigns().catch(() => {});
        } else {
            showPinOverlay();
        }
    } catch (e) {
        showPinOverlay();
    }
}

window.handlePinInput = handlePinInput;
window.handlePinBackspace = handlePinBackspace;
window.clearPin = clearPin;
window.logoutAdmin = logoutAdmin;

// --- Dark Mode Logic ---
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Update icon
    const iconPath = isDark 
        ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />' 
        : '<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />';
    
    document.getElementById('theme-icon').innerHTML = iconPath;
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-icon').innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />';
    }
});

let currentLeadId = null;
let isAiPaused = false;
let currentFilter = 'INBOX'; // 'INBOX' or 'BROADCASTS'
let allLeadsCache = [];

function setFilter(filterType) {
    currentFilter = filterType;
    const inboxBtn = document.getElementById('filter-inbox-btn');
    const broadcastBtn = document.getElementById('filter-broadcasts-btn');
    
    // Active style: solid blue background with white text
    const activeBg = '#3b82f6';
    const activeColor = '#ffffff';
    const activeBorder = '1px solid #3b82f6';

    // Inactive style: transparent background with secondary text color
    const inactiveBg = 'transparent';
    const inactiveColor = 'var(--text-secondary)';
    const inactiveBorder = '1px solid var(--border-color)';
    
    if (filterType === 'INBOX') {
        inboxBtn.style.backgroundColor = activeBg;
        inboxBtn.style.color = activeColor;
        inboxBtn.style.borderColor = '#3b82f6';
        
        broadcastBtn.style.backgroundColor = inactiveBg;
        broadcastBtn.style.color = inactiveColor;
        broadcastBtn.style.borderColor = 'var(--border-color)';
    } else {
        broadcastBtn.style.backgroundColor = activeBg;
        broadcastBtn.style.color = activeColor;
        broadcastBtn.style.borderColor = '#3b82f6';
        
        inboxBtn.style.backgroundColor = inactiveBg;
        inboxBtn.style.color = inactiveColor;
        inboxBtn.style.borderColor = 'var(--border-color)';
    }
    renderLeads();
}

let isFetchingLeads = false;
let lastKnownMessagesCount = 0;

async function fetchLeads(silent = false) {
    if (isFetchingLeads) return;
    isFetchingLeads = true;
    try {
        const response = await fetch('/api/admin/leads');
        if (!response.ok) throw new Error('Failed to fetch leads');
        allLeadsCache = await response.json();
        renderLeads();
        
        // If a lead is currently selected, refresh its conversation in the background
        if (currentLeadId) {
            refreshActiveConversation();
        }
    } catch (error) {
        if (!silent) {
            console.error('Error fetching leads:', error);
            document.getElementById('leads-list').innerHTML = '<div class="loading">Error loading leads.</div>';
        }
    } finally {
        isFetchingLeads = false;
    }
}

async function refreshActiveConversation() {
    if (!currentLeadId) return;
    try {
        const response = await fetch(`/api/admin/leads/${currentLeadId}/conversations`);
        if (!response.ok) return;
        let messages = await response.json();
        messages.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

        // Only redraw if the number of messages or content changed
        if (messages.length !== lastKnownMessagesCount) {
            lastKnownMessagesCount = messages.length;
            renderConversationMessages(messages);
        }
    } catch (e) {
        // Silent fail for polling
    }
}

function renderLeads() {
    const listEl = document.getElementById('leads-list');
    listEl.innerHTML = '';
    
    let hotCount = 0;
    let broadcastCount = 0;
    let totalInboxUnread = 0;
    
    allLeadsCache.forEach(lead => {
        if (lead.lead_status === 'HOT') hotCount++;
        if (lead.lead_status === 'BROADCAST') broadcastCount++;
        if (lead.lead_status !== 'BROADCAST') {
            totalInboxUnread += Number(lead.unread_count || 0);
        }
    });
    
    let leadsToRender = allLeadsCache;
    if (currentFilter === 'BROADCASTS') {
        leadsToRender = allLeadsCache.filter(l => l.has_received_broadcast === true || l.lead_status === 'BROADCAST');
    } else {
        // INBOX mode: Show everything EXCEPT 'BROADCAST' status
        leadsToRender = allLeadsCache.filter(l => l.lead_status !== 'BROADCAST');
    }
    
    leadsToRender.forEach(lead => {
        const card = document.createElement('div');
        const isActive = (currentLeadId === lead.id);
        const unreadCount = Number(lead.unread_count || 0);
        
        card.className = `lead-card ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'unread-lead' : ''}`;
        if (isActive) {
            card.style.borderLeft = '4px solid #3b82f6';
            card.style.background = 'var(--bg-secondary, #f1f5f9)';
        } else if (unreadCount > 0) {
            card.style.borderLeft = '4px solid #25d366';
        }
        card.onclick = () => loadLeadDetail(lead);
        
        const timeStr = new Date(lead.updated_at || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Unread badge pill
        const unreadBadgeHtml = unreadCount > 0
            ? `<span style="background: #25d366; color: white; font-size: 0.7rem; font-weight: bold; border-radius: 12px; padding: 2px 7px; min-width: 18px; text-align: center; box-shadow: 0 1px 3px rgba(37,211,102,0.4);">${unreadCount}</span>`
            : '';

        // Last message preview snippet if available
        const lastMsgPreview = lead.last_message
            ? `<div style="font-size: 0.75rem; color: ${unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary, #6b7280)'}; font-weight: ${unreadCount > 0 ? '600' : 'normal'}; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                ${lead.last_message_sender === 'customer' ? '💬 ' : '🤖 '}${lead.last_message}
               </div>`
            : '';
        
        // Check if customer was called
        const isCalled = lead.called === true;
        const calledBadgeHtml = isCalled 
            ? `<span style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 0.68rem; font-weight: 700; border-radius: 4px; padding: 1px 6px; display: inline-flex; align-items: center; gap: 3px; border: 1px solid rgba(16, 185, 129, 0.3);">📞 Called</span>` 
            : '';

        card.innerHTML = `
            <div class="lead-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="lead-name" style="font-weight: ${unreadCount > 0 ? '700' : '600'}; display: flex; align-items: center; gap: 6px;">
                    ${lead.customer_name || 'Unknown User'}
                    ${unreadCount > 0 ? '<span style="width: 8px; height: 8px; background: #25d366; border-radius: 50%; display: inline-block;"></span>' : ''}
                </span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${calledBadgeHtml}
                    ${unreadBadgeHtml}
                    <span class="status-badge ${lead.lead_status}">${lead.lead_status}</span>
                </div>
            </div>
            <div class="lead-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span style="display: flex; align-items: center; gap: 4px;">
                    ${isCalled ? '<span style="color: #10b981; font-size: 0.85rem;" title="Called">✓</span>' : ''}
                    <span>${lead.phone_number}</span>
                </span>
                <span>${timeStr}</span>
            </div>
            ${lastMsgPreview}
        `;
        listEl.appendChild(card);
    });

    document.getElementById('total-count').innerText = allLeadsCache.length;
    document.getElementById('hot-count').innerText = hotCount;
    
    // Update Inbox Unread Badge
    const inboxBadge = document.getElementById('unread-inbox-badge');
    if (inboxBadge) {
        if (totalInboxUnread > 0) {
            inboxBadge.style.display = 'block';
            inboxBadge.innerText = totalInboxUnread > 99 ? '99+' : totalInboxUnread;
        } else {
            inboxBadge.style.display = 'none';
        }
    }
    
    // Update Broadcasts Badge
    const badge = document.getElementById('unread-broadcasts-badge');
    if (badge) {
        if (broadcastCount > 0) {
            badge.style.display = 'block';
            badge.innerText = broadcastCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

// Manages which main panel is active so panels always take 100% full width
function switchMainPanel(panelName) {
    const detailPanel = document.getElementById('detail-panel');
    const emptyState = document.getElementById('empty-state');
    const bulkPanel = document.getElementById('bulk-panel');
    const adsPanel = document.getElementById('ads-panel');

    const isMobile = window.innerWidth <= 768;

    if (detailPanel) detailPanel.style.setProperty('display', panelName === 'detail' ? 'flex' : 'none', 'important');
    // On mobile screens, emptyState is ALWAYS hidden (never displayed) so it never bleeds or overlaps
    if (emptyState) emptyState.style.setProperty('display', (!isMobile && panelName === 'empty') ? 'flex' : 'none', 'important');
    if (bulkPanel) bulkPanel.style.setProperty('display', panelName === 'bulk' ? 'flex' : 'none', 'important');
    if (adsPanel) adsPanel.style.setProperty('display', panelName === 'ads' ? 'flex' : 'none', 'important');

    // Toggle body class so mobile hides the top navbar when viewing a chat, bulk, or ads panel
    if (panelName === 'detail' || panelName === 'bulk' || panelName === 'ads') {
        document.body.classList.add('in-chat-view');
    } else {
        document.body.classList.remove('in-chat-view');
    }
}

function renderConversationMessages(messages) {
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) return;
    chatWindow.innerHTML = '';
    
    // Calculate current AI state
    const humanInterventions = messages.filter(msg => 
        msg.sender === 'admin' || (msg.sender === 'system' && (msg.message === 'AI_PAUSED' || msg.message === 'AI_RESUMED'))
    );
    
    isAiPaused = false;
    if (humanInterventions.length > 0) {
        const lastIntervention = humanInterventions[humanInterventions.length - 1];
        if (lastIntervention.message !== 'AI_RESUMED') {
            const timeDiff = new Date() - new Date(lastIntervention.timestamp);
            if (timeDiff < 10 * 60 * 1000) {
                isAiPaused = true;
            }
        }
    }
    updateToggleBtn();
    
    messages.forEach(msg => {
        const bubble = document.createElement('div');
        
        let bubbleClass = 'ai';
        if (msg.sender === 'customer') bubbleClass = 'customer';
        else if (msg.sender === 'admin') bubbleClass = 'admin';
        else if (msg.sender === 'system') bubbleClass = 'system';
        
        bubble.className = `bubble ${bubbleClass}`;
        
        let timeStr = "";
        if (msg.timestamp) {
           timeStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        // Add tick mark for admin/ai messages
        let tickHtml = "";
        if (msg.sender === 'admin' || msg.sender === 'ai') {
            tickHtml = "<span>✅</span>";
        }
        
        const deleteSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 14px; height: 14px; color: #ef4444;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
        const deleteHtml = msg.id ? `<button onclick="deleteMessage('${msg.id}', this)" style="background:none; border:none; cursor:pointer; padding: 0; opacity: 1; margin-right: 4px; display: flex; align-items: center;" title="Delete message">${deleteSvg}</button>` : '';
        
        const timeHtml = `<div style="font-size: 0.7rem; text-align: right; margin-top: 4px; display: flex; justify-content: flex-end; align-items: center; gap: 4px;">
            ${deleteHtml}
            <span style="opacity: 0.6; display: flex; align-items: center; gap: 4px;">
                <span>${timeStr}</span>
                ${tickHtml}
            </span>
        </div>`;
        
        let contentHtml = "";
        if (msg.message && msg.message.startsWith('[Voice Message] ')) {
            const url = msg.message.replace('[Voice Message] ', '');
            contentHtml = `🎤 Voice Note<br><audio controls src="${url}" style="margin-top:5px; width: 220px;"></audio>`;
        } else if (msg.message && msg.message.startsWith('[Audio] ')) {
            const url = msg.message.replace('[Audio] ', '');
            contentHtml = `👨‍💻 Admin: 🎤 Audio<br><audio controls src="${url}" style="margin-top:5px; width: 220px;"></audio>`;
        } else if (msg.message && msg.message.startsWith('[Image] ')) {
            const url = msg.message.replace('[Image] ', '');
            contentHtml = `👨‍💻 Admin: 🖼️ Image<br><img src="${url}" style="margin-top:5px; max-width: 220px; border-radius: 6px;" />`;
        } else if (msg.message && msg.message.startsWith('[Video] ')) {
            const url = msg.message.replace('[Video] ', '');
            contentHtml = `👨‍💻 Admin: 🎥 Video<br><video controls src="${url}" style="margin-top:5px; max-width: 220px; border-radius: 6px;"></video>`;
        } else {
            const rawMsg = msg.message || '';
            const escapedText = rawMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            contentHtml = msg.sender === 'admin' ? `👨‍💻 Admin: ${escapedText}` : escapedText;
        }
        
        bubble.innerHTML = contentHtml + timeHtml;
        chatWindow.appendChild(bubble);
    });
    
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function loadLeadDetail(lead) {
    currentLeadId = lead.id;
    lastKnownMessagesCount = 0;
    
    // Clear unread count locally and inform server
    if (lead.unread_count > 0) {
        lead.unread_count = 0;
        fetch(`/api/admin/leads/${lead.id}/read`, { method: 'POST' }).catch(() => {});
    }
    
    renderLeads(); // update active card highlight and badge counts
    switchMainPanel('detail');
    
    // Populate header details
    document.getElementById('detail-name').innerText = lead.customer_name || 'Unknown User';
    document.getElementById('detail-phone').innerText = lead.phone_number;
    const isLeadCalled = lead.called === true;
    const calledHeaderBadge = isLeadCalled 
        ? `<span style="background: #10b981; color: white; font-size: 0.75rem; font-weight: 700; border-radius: 4px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;">📞 CALLED</span>` 
        : '';
    document.getElementById('detail-badges').innerHTML = `${calledHeaderBadge} <span class="status-badge ${lead.lead_status}">${lead.lead_status}</span>`;
    
    // Update menu text & icon for called status
    updateMenuCalledState(isLeadCalled);
    
    // Populate drawer details
    document.getElementById('drawer-name').innerText = lead.customer_name || 'Unknown User';
    const drawerPhoneEl = document.getElementById('drawer-phone');
    if (drawerPhoneEl) {
        drawerPhoneEl.innerText = lead.phone_number || '';
        drawerPhoneEl.setAttribute('data-phone', lead.phone_number || '');
    }
    const drawerCallBtn = document.getElementById('drawer-call-btn');
    if (drawerCallBtn) {
        const cleanDigits = String(lead.phone_number || '').replace(/[^\d+]/g, '');
        drawerCallBtn.href = cleanDigits ? `tel:${cleanDigits}` : '#';
    }
    document.getElementById('drawer-service').innerText = lead.service_required || '-';
    document.getElementById('drawer-timeline').innerText = lead.timeline || '-';
    document.getElementById('drawer-budget').innerText = lead.budget || '-';
    document.getElementById('drawer-score').innerText = `${lead.lead_score || 0}/100`;
    document.getElementById('drawer-requirements').innerText = lead.requirements || 'No specific requirements extracted yet.';

    // Fetch conversation
    try {
        const response = await fetch(`/api/admin/leads/${lead.id}/conversations`);
        let messages = await response.json();
        messages.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
        lastKnownMessagesCount = messages.length;
        renderConversationMessages(messages);
    } catch (error) {
        console.error('Error fetching conversations:', error);
    }
}

function updateToggleBtn() {
    const btn = document.getElementById('ai-toggle-btn');
    const hint = document.getElementById('ai-status-hint');
    if (!btn) return;
    if (isAiPaused) {
        btn.innerHTML = "▶️ Resume AI";
        btn.classList.add('paused');
        if (hint) {
            hint.innerText = "⏸ Bot paused (Human active)";
            hint.style.color = "#f59e0b";
        }
    } else {
        btn.innerHTML = "⏸ Pause AI (10m)";
        btn.classList.remove('paused');
        if (hint) {
            hint.innerText = "⚡ Bot active (Auto-replying)";
            hint.style.color = "#10b981";
        }
    }
}

async function toggleAi() {
    if (!currentLeadId) return;
    const btn = document.getElementById('ai-toggle-btn');
    btn.disabled = true;
    
    try {
        if (isAiPaused) {
            btn.innerText = "Resuming...";
            await fetch(`/api/admin/leads/${currentLeadId}/resume`, { method: 'POST' });
        } else {
            btn.innerText = "Pausing...";
            await fetch(`/api/admin/leads/${currentLeadId}/takeover`, { method: 'POST' });
        }
        
        fetchLeads(); 
        const lead = {id: currentLeadId, phone_number: document.getElementById('detail-phone').innerText};
        loadLeadDetail(lead);
    } catch (err) {
        console.error(err);
        alert('Error toggling AI state');
    } finally {
        btn.disabled = false;
    }
}

function goBack() {
    currentLeadId = null;
    const detailPanel = document.getElementById('detail-panel');
    if (detailPanel) {
        detailPanel.style.transform = '';
        detailPanel.style.transition = '';
    }
    switchMainPanel('empty');
    const contactPanel = document.getElementById('contact-info-panel');
    if (contactPanel) contactPanel.style.display = 'none';
}

// --- WhatsApp iOS Native Left-Edge Swipe to Go Back Gesture ---
(function initIosSwipeToGoBack() {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    let isHorizontalGesture = null;

    // Generous threshold so it easily catches edge swipes on iPhone / Android
    const EDGE_THRESHOLD = 70; // within 70px of left edge
    const MIN_DISMISS_DISTANCE = 70; // drag at least 70px to trigger back

    window.addEventListener('touchstart', (e) => {
        // STRICT CHECK: ONLY active when specifically inside a chat conversation!
        const detailPanel = document.getElementById('detail-panel');
        const isDetailVisible = detailPanel && detailPanel.style.display === 'flex' && document.body.classList.contains('in-chat-view');
        
        // If not in a chat (e.g. on Recent Leads list), block browser history navigation from edge swipe!
        if (!isDetailVisible || !currentLeadId) {
            isSwiping = false;
            // Prevent Safari/Chrome edge swipe from navigating back off the site
            if (e.touches && e.touches[0] && e.touches[0].clientX <= 30) {
                e.preventDefault();
            }
            return;
        }
        if (!e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        if (touch.clientX <= EDGE_THRESHOLD) {
            startX = touch.clientX;
            startY = touch.clientY;
            currentX = startX;
            isSwiping = true;
            isHorizontalGesture = null;
        }
    }, { passive: false, capture: true });

    window.addEventListener('touchmove', (e) => {
        if (!isSwiping || !e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        // Determine if horizontal on the first 5px of movement
        if (isHorizontalGesture === null) {
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                isHorizontalGesture = Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0;
                if (!isHorizontalGesture) {
                    isSwiping = false;
                    return;
                }
            } else {
                return;
            }
        }

        if (!isHorizontalGesture) return;

        currentX = touch.clientX;
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel && deltaX > 0) {
            detailPanel.style.transition = 'none';
            detailPanel.style.transform = `translateX(${deltaX}px)`;
            detailPanel.style.boxShadow = '-5px 0 25px rgba(0,0,0,0.3)';
        }
    }, { passive: true, capture: true });

    const handleTouchEnd = () => {
        if (!isSwiping) return;
        isSwiping = false;

        const detailPanel = document.getElementById('detail-panel');
        if (!detailPanel) return;

        const deltaX = currentX - startX;
        if (isHorizontalGesture && deltaX >= MIN_DISMISS_DISTANCE) {
            // Animate out to the right and return to inbox list
            detailPanel.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
            detailPanel.style.transform = 'translateX(100%)';
            setTimeout(() => {
                detailPanel.style.transform = '';
                detailPanel.style.transition = '';
                detailPanel.style.boxShadow = '';
                goBack();
            }, 220);
        } else {
            // Animate back to original position
            detailPanel.style.transition = 'transform 0.18s ease-out';
            detailPanel.style.transform = 'translateX(0)';
            setTimeout(() => {
                detailPanel.style.transform = '';
                detailPanel.style.transition = '';
                detailPanel.style.boxShadow = '';
            }, 180);
        }

        isHorizontalGesture = null;
    };

    window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });
})();

function toggleContactInfo() {
    const panel = document.getElementById('contact-info-panel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
    } else {
        panel.style.display = 'none';
    }
}

// --- Three Dots Menu & Profile / Call Actions ---
function toggleThreeDotMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('three-dot-dropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

// Close three dot dropdown when clicking anywhere outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('three-dot-dropdown');
    const btn = document.getElementById('three-dot-menu-btn');
    if (dropdown && dropdown.style.display === 'block') {
        if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
            dropdown.style.display = 'none';
        }
    }
});

function openContactProfileModal() {
    const dropdown = document.getElementById('three-dot-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    toggleContactInfo();
}

function updateMenuCalledState(isCalled) {
    const iconEl = document.getElementById('menu-called-icon');
    const textEl = document.getElementById('menu-called-text');
    if (!iconEl || !textEl) return;
    if (isCalled) {
        iconEl.innerText = '🔄';
        textEl.innerText = 'Unmark as Called';
    } else {
        iconEl.innerText = '✅';
        textEl.innerText = 'Mark as Called';
    }
}

async function toggleCurrentLeadCalled() {
    if (!currentLeadId) return;
    const dropdown = document.getElementById('three-dot-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    const currentLead = allLeadsCache.find(l => l.id === currentLeadId);
    const targetState = !(currentLead && currentLead.called === true);

    try {
        const response = await fetch(`/api/admin/leads/${currentLeadId}/called`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ called: targetState })
        });
        const resData = await response.json();
        if (resData.success) {
            if (currentLead) {
                currentLead.called = resData.called;
                currentLead.called_at = resData.called ? new Date().toISOString() : null;
            }
            renderLeads();
            const calledHeaderBadge = resData.called 
                ? `<span style="background: #10b981; color: white; font-size: 0.75rem; font-weight: 700; border-radius: 4px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;">📞 CALLED</span>` 
                : '';
            document.getElementById('detail-badges').innerHTML = `${calledHeaderBadge} <span class="status-badge ${currentLead.lead_status}">${currentLead.lead_status}</span>`;
            updateMenuCalledState(resData.called);
        }
    } catch (e) {
        console.error('Failed to toggle called status:', e);
        alert('Error updating called status.');
    }
}

function callCustomerDirect() {
    const dropdown = document.getElementById('three-dot-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const phoneEl = document.getElementById('detail-phone');
    if (!phoneEl) return;
    const rawPhone = phoneEl.innerText || '';
    const cleanDigits = rawPhone.replace(/[^\d+]/g, '');
    if (cleanDigits) {
        // Automatically mark as called if not already marked
        if (currentLeadId) {
            const currentLead = allLeadsCache.find(l => l.id === currentLeadId);
            if (currentLead && !currentLead.called) {
                toggleCurrentLeadCalled();
            }
        }
        window.location.href = `tel:${cleanDigits}`;
    } else {
        alert('Phone number not available to call.');
    }
}

function copyDrawerPhone(event) {
    if (event) event.stopPropagation();
    const phoneEl = document.getElementById('drawer-phone');
    if (!phoneEl) return;
    const phone = phoneEl.innerText || phoneEl.getAttribute('data-phone') || '';
    if (!phone) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phone).then(showToast).catch(() => fallbackCopy(phone));
    } else {
        fallbackCopy(phone);
    }

    function showToast() {
        const toast = document.getElementById('copy-toast');
        if (toast) {
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 2000);
        }
    }

    function fallbackCopy(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        try {
            document.execCommand('copy');
            showToast();
        } catch (e) {
            console.error('Copy failed:', e);
        }
        document.body.removeChild(temp);
    }
}

window.toggleThreeDotMenu = toggleThreeDotMenu;
window.openContactProfileModal = openContactProfileModal;
window.callCustomerDirect = callCustomerDirect;
window.copyDrawerPhone = copyDrawerPhone;
window.toggleCurrentLeadCalled = toggleCurrentLeadCalled;

async function clearCurrentChat() {
    if (!currentLeadId) return;
    if (!confirm("Are you sure you want to clear this entire conversation? This cannot be undone.")) return;
    
    try {
        const response = await fetch(`/api/admin/leads/${currentLeadId}/conversations`, {
            method: 'DELETE'
        });
        if (response.ok) {
            document.getElementById('chat-window').innerHTML = '';
            toggleContactInfo(); // close drawer
        } else {
            alert('Failed to clear chat.');
        }
    } catch (err) {
        console.error(err);
        alert('Error clearing chat.');
    }
}

let currentDeleteMsgId = null;
let currentDeleteBtnElement = null;

function deleteMessage(msgId, btnElement) {
    currentDeleteMsgId = msgId;
    currentDeleteBtnElement = btnElement;
    document.getElementById('delete-modal').style.display = 'flex';
    
    document.getElementById('btn-delete-everyone').onclick = () => confirmDeleteMessage(true);
    document.getElementById('btn-delete-me').onclick = () => confirmDeleteMessage(false);
}

async function confirmDeleteMessage(forEveryone) {
    document.getElementById('delete-modal').style.display = 'none';
    if (!currentDeleteMsgId) return;
    
    try {
        const query = forEveryone ? '?recall=true' : '';
        const response = await fetch(`/api/admin/conversations/${currentDeleteMsgId}${query}`, { method: 'DELETE' });
        if (response.ok) {
            const bubble = currentDeleteBtnElement.closest('.bubble');
            if (bubble) bubble.remove();
        } else {
            alert('Failed to delete message.');
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting message.');
    }
    
    currentDeleteMsgId = null;
    currentDeleteBtnElement = null;
}

// Bulk Send Feature
function toggleBulkPanel() {
    const bulkPanel = document.getElementById('bulk-panel');
    if (bulkPanel && bulkPanel.style.display === 'flex') {
        hideBulkPanel();
    } else {
        showBulkPanel();
    }
}

function showBulkPanel() {
    switchMainPanel('bulk');
}

function hideBulkPanel() {
    if (currentLeadId) {
        switchMainPanel('detail');
    } else {
        switchMainPanel('empty');
    }
}

async function sendBulkBroadcast() {
    const templateName = document.getElementById('bulk-template').value.trim();
    const language = document.getElementById('bulk-language').value.trim() || 'en';
    const imageUrl = document.getElementById('bulk-image-url')?.value.trim();
    const imageFile = document.getElementById('bulk-image-file')?.files[0];
    const variables = document.getElementById('bulk-variables')?.value.trim();
    const messageText = document.getElementById('bulk-message-text')?.value.trim();
    const numbersRaw = document.getElementById('bulk-numbers').value;
    
    if (!templateName) return alert("Please enter the template name.");
    if (!numbersRaw) return alert("Please enter at least one phone number.");

    const numbers = numbersRaw.split('\n')
        .map(n => n.replace(/\D/g, ''))
        .filter(n => n.length >= 10);
        
    if (numbers.length === 0) return alert("No valid phone numbers found.");

    const btn = document.getElementById('bulk-send-btn');
    const statusDiv = document.getElementById('bulk-status');
    btn.disabled = true;
    btn.innerText = "Sending... Please wait.";
    statusDiv.style.display = 'none';
    
    try {
        const formData = new FormData();
        formData.append('templateName', templateName);
        formData.append('language', language);
        formData.append('numbersRaw', JSON.stringify(numbers));
        if (imageUrl) formData.append('imageUrl', imageUrl);
        if (imageFile) formData.append('imageFile', imageFile);
        if (variables) formData.append('variables', variables);
        if (messageText) formData.append('messageText', messageText);

        const res = await fetch('/api/admin/bulk-send', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        statusDiv.style.display = 'block';
        if (data.success && data.successCount > 0) {
            statusDiv.innerHTML = `✅ Successfully sent to <b>${data.successCount}</b> numbers.`;
            if (data.failCount > 0) {
                statusDiv.innerHTML += `<br>❌ Failed: <b>${data.failCount}</b>. Reason: ${data.lastError}`;
            }
            statusDiv.style.backgroundColor = '#d1fae5';
            statusDiv.style.color = '#065f46';
        } else if (data.success && data.failCount > 0) {
            statusDiv.innerHTML = `❌ Failed to send to <b>${data.failCount}</b> numbers.<br>Reason from Meta: <b>${data.lastError}</b>`;
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
        } else {
            statusDiv.innerHTML = `❌ Error: ${data.error}`;
            statusDiv.style.backgroundColor = '#fee2e2';
            statusDiv.style.color = '#991b1b';
        }
    } catch (err) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `❌ Error sending broadcast.`;
        statusDiv.style.backgroundColor = '#fee2e2';
        statusDiv.style.color = '#991b1b';
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 Send Broadcast";
    }
}

async function sendAdminReply() {
    if (!currentLeadId) return;
    const input = document.getElementById('admin-reply-input');
    const text = input.value.trim();
    if (!text) return;

    // Optimistic UI Update: Instantly show the message on the screen
    input.value = '';
    
    const chatWindow = document.getElementById('chat-window');
    const bubble = document.createElement('div');
    bubble.className = `bubble admin`;
    
    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const tempId = 'tick-' + Date.now();
    const timeHtml = `<div style="font-size: 0.7rem; opacity: 0.6; text-align: right; margin-top: 4px; display: flex; justify-content: flex-end; align-items: center; gap: 4px;">
        <span>${timeStr}</span>
        <span id="${tempId}">🕓</span>
    </div>`;
    const escapedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    bubble.innerHTML = `👨‍💻 Admin: ${escapedText}` + timeHtml;
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    
    try {
        const response = await fetch(`/api/admin/leads/${currentLeadId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        const tickSpan = document.getElementById(tempId);
        if (response.ok) {
            const data = await response.json();
            if (tickSpan) tickSpan.innerText = '✅';
            
            // Add delete button dynamically if we got the ID
            if (data.id && tickSpan) {
                const deleteSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 14px; height: 14px; color: #ef4444;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = deleteSvg;
                deleteBtn.title = "Delete message";
                deleteBtn.style = "background:none; border:none; cursor:pointer; padding: 0; opacity: 1; margin-right: 4px; display: flex; align-items: center;";
                deleteBtn.onclick = function() { deleteMessage(data.id, this); };
                tickSpan.parentNode.insertBefore(deleteBtn, tickSpan.previousSibling);
            }
            
            // Automatically pause AI locally since admin sent a message
            if (!isAiPaused) {
                isAiPaused = true;
                updateToggleBtn();
            }
        } else {
            if (tickSpan) tickSpan.innerText = '❌';
            alert('Failed to send message to WhatsApp');
        }
    } catch (err) {
        console.error(err);
        const tickSpan = document.getElementById(tempId);
        if (tickSpan) tickSpan.innerText = '❌';
        alert('Error sending message');
    }
    
    input.focus();
}

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function startRecording() {
    if (!currentLeadId || isRecording) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const file = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
            
            // Release microphone
            stream.getTracks().forEach(track => track.stop());
            
            // Don't upload if it's too short (e.g., accidental click)
            if (audioChunks.length > 0) {
                await uploadFileToWhatsApp(file, 'audio');
            }
        };

        mediaRecorder.start();
        isRecording = true;
        document.getElementById('voice-record-btn').classList.add('recording');
    } catch (err) {
        console.error('Microphone access denied or error:', err);
        alert('Could not access microphone.');
    }
}

function stopRecording() {
    if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('voice-record-btn').classList.remove('recording');
    }
}

async function uploadFileToWhatsApp(file, type) {
    if (!currentLeadId || !file) return;

    // Determine type if not provided
    if (!type) {
        type = 'document';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const chatWindow = document.getElementById('chat-window');
    const bubble = document.createElement('div');
    bubble.className = `bubble admin`;
    
    const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const tempId = 'tick-' + Date.now();
    const timeHtml = `<div style="font-size: 0.7rem; opacity: 0.6; text-align: right; margin-top: 4px; display: flex; justify-content: flex-end; align-items: center; gap: 4px;">
        <span>${timeStr}</span>
        <span id="${tempId}">🕓</span>
    </div>`;
    
    bubble.innerHTML = `👨‍💻 Admin: Sending [${type}]...` + timeHtml;
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const response = await fetch(`/api/admin/leads/${currentLeadId}/media`, {
            method: 'POST',
            body: formData
        });
        
        const tickSpan = document.getElementById(tempId);
        if (response.ok) {
            const data = await response.json();
            if (tickSpan) tickSpan.innerText = '✅';
            
            // Add delete button dynamically if we got the ID
            if (data.id && tickSpan) {
                const deleteSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 14px; height: 14px; color: #ef4444;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = deleteSvg;
                deleteBtn.title = "Delete message";
                deleteBtn.style = "background:none; border:none; cursor:pointer; padding: 0; opacity: 1; margin-right: 4px; display: flex; align-items: center;";
                deleteBtn.onclick = function() { deleteMessage(data.id, this); };
                tickSpan.parentNode.insertBefore(deleteBtn, tickSpan.previousSibling);
            }
            
            // Automatically pause AI locally since admin sent media
            if (!isAiPaused) {
                isAiPaused = true;
                updateToggleBtn();
            }
            
            // Update bubble text to show it sent
            let mediaHtml = `<a href="${data.url}" target="_blank">View File</a>`;
            if (type === 'audio') mediaHtml = `<br><audio controls src="${data.url}" style="margin-top:5px; width: 220px;"></audio>`;
            else if (type === 'image') mediaHtml = `<br><img src="${data.url}" style="margin-top:5px; max-width: 220px; border-radius: 6px;" />`;
            else if (type === 'video') mediaHtml = `<br><video controls src="${data.url}" style="margin-top:5px; max-width: 220px; border-radius: 6px;"></video>`;
            
            bubble.innerHTML = `👨‍💻 Admin: [${type.toUpperCase()}] ${mediaHtml}` + timeHtml;
            if (tickSpan) document.getElementById(tempId).innerText = '✅'; // re-assign since innerHTML replaced it
        } else {
            if (tickSpan) tickSpan.innerText = '❌';
            alert('Failed to send media to WhatsApp');
        }
    } catch (err) {
        console.error(err);
        const tickSpan = document.getElementById(tempId);
        if (tickSpan) tickSpan.innerText = '❌';
        alert('Error sending media');
    }
}

let pendingMediaFile = null;

function handleMediaUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    pendingMediaFile = file;
    const container = document.getElementById('media-preview-container');
    container.innerHTML = ''; // clear old

    const objectUrl = URL.createObjectURL(file);
    
    if (file.type.startsWith('image/')) {
        container.innerHTML = `<img src="${objectUrl}" style="max-width: 100%; max-height: 300px; border-radius: 4px;" />`;
    } else if (file.type.startsWith('video/')) {
        container.innerHTML = `<video controls src="${objectUrl}" style="max-width: 100%; max-height: 300px; border-radius: 4px;"></video>`;
    } else if (file.type.startsWith('audio/')) {
        container.innerHTML = `<audio controls src="${objectUrl}" style="max-width: 100%;"></audio>`;
    } else {
        container.innerHTML = `<div style="padding: 40px; font-weight: bold;">📄 Document selected</div>`;
    }

    document.getElementById('media-preview-modal').style.display = 'flex';
    event.target.value = ''; // reset so we can select the same file again if needed
}

function cancelMediaSend() {
    pendingMediaFile = null;
    document.getElementById('media-preview-modal').style.display = 'none';
}

async function confirmMediaSend() {
    if (!pendingMediaFile) return;
    const btn = document.getElementById('confirm-media-btn');
    btn.disabled = true;
    btn.innerText = 'Sending...';

    await uploadFileToWhatsApp(pendingMediaFile);

    btn.disabled = false;
    btn.innerText = 'Send';
    document.getElementById('media-preview-modal').style.display = 'none';
    pendingMediaFile = null;
}

// ============================================
// Meta Ads Manager Frontend Logic
// ============================================

let connectedAdAccounts = [];
let connectedPages = [];
let allCampaignsCache = [];
let uploadedAdImagePublicUrl = '';
let uploadedAdImageHash = '';

function toggleAdsPanel() {
    const adsPanel = document.getElementById('ads-panel');
    if (!adsPanel) return;
    const isVisible = adsPanel.style.display === 'flex' || 
                      (window.getComputedStyle(adsPanel).display !== 'none' && adsPanel.style.display !== 'none');
    if (isVisible) {
        hideAdsPanel();
    } else {
        showAdsPanel();
    }
}

function showAdsPanel() {
    switchMainPanel('ads');
    fetchConnectedAccounts();
    fetchAdCampaigns();
}

function hideAdsPanel() {
    if (currentLeadId) {
        switchMainPanel('detail');
    } else {
        switchMainPanel('empty');
    }
}

async function fetchConnectedAccounts() {
    try {
        const res = await fetch('/api/ads/accounts');
        const data = await res.json();
        if (data.success) {
            connectedAdAccounts = data.adAccounts || [];
            connectedPages = data.pages || [];

            // Update UI bar
            if (connectedAdAccounts.length > 0) {
                const acc = connectedAdAccounts[0];
                document.getElementById('connected-ad-account').innerText = `${acc.name} (${acc.account_id})`;

                // Dynamically update Top Up link to direct ad account billing hub
                const topUpBtn = document.getElementById('top-up-billing-btn');
                if (topUpBtn && acc.account_id) {
                    const bizId = acc.business?.id || '237173455626416';
                    topUpBtn.href = `https://business.facebook.com/latest/billing_hub/accounts?business_id=${bizId}&payment_account_id=${acc.account_id}&asset_id=${acc.account_id}`;
                }

                // Render Available Balance & Total Spend from Meta Account
                const balanceEl = document.getElementById('metric-account-balance');
                if (balanceEl) {
                    const currency = acc.currency === 'INR' ? '₹' : (acc.currency === 'USD' ? '$' : `${acc.currency} `);
                    
                    // 1. Check funding_source_details.display_string (e.g. "Available balance (₹39.99 INR)")
                    let displayedBalance = null;
                    if (acc.funding_source_details && acc.funding_source_details.display_string) {
                        const match = acc.funding_source_details.display_string.match(/[\d,.]+/);
                        if (match) {
                            displayedBalance = `${currency}${match[0]}`;
                        }
                    }

                    // 2. Fallback to acc.balance if funding_source_details is not present
                    if (!displayedBalance) {
                        if (acc.balance !== undefined && acc.balance !== null && parseFloat(acc.balance) > 0) {
                            const balNum = (parseFloat(acc.balance) / 100).toFixed(2);
                            displayedBalance = `${currency}${balNum}`;
                        } else {
                            displayedBalance = `${currency}0.00`;
                        }
                    }

                    balanceEl.innerText = displayedBalance;

                    if (acc.amount_spent !== undefined && acc.amount_spent !== null) {
                        const spentNum = (parseFloat(acc.amount_spent) / 100).toFixed(2);
                        const spendEl = document.getElementById('metric-total-spend');
                        if (spendEl) spendEl.innerText = `${currency}${spentNum}`;
                    }
                }
            } else {
                document.getElementById('connected-ad-account').innerText = 'Primary Company Account Connected';
            }

            if (connectedPages.length > 0) {
                const p = connectedPages[0];
                document.getElementById('connected-page').innerText = p.name;
                const previewPageName = document.querySelector('#preview-image-box')?.parentElement?.querySelector('div[style*="font-weight: 600"]');
                if (previewPageName) previewPageName.innerText = p.name;

                if (p.instagram_business_account) {
                    document.getElementById('connected-instagram').innerText = `@${p.instagram_business_account.username || 'Connected'}`;
                } else {
                    document.getElementById('connected-instagram').innerText = 'Linked via Page';
                }
            } else {
                document.getElementById('connected-page').innerText = 'Not Linked Yet';
                document.getElementById('connected-instagram').innerText = 'Not Linked Yet';
            }

            // WhatsApp status check based on whether env has phone number
            const waBadge = document.getElementById('whatsapp-status-badge');
            if (waBadge) {
                if (data.whatsappConnected) {
                    waBadge.innerText = 'WhatsApp Connected: Active';
                    waBadge.style.background = '#dcfce7';
                    waBadge.style.color = '#15803d';
                } else {
                    waBadge.innerText = 'WhatsApp: Not Configured in .env';
                    waBadge.style.background = '#fee2e2';
                    waBadge.style.color = '#b91c1c';
                }
            }
            populateWhatsAppNumbers();
        } else {
            document.getElementById('connected-ad-account').innerText = 'Connected';
            document.getElementById('connected-page').innerText = 'Not Linked Yet';
            document.getElementById('connected-instagram').innerText = 'Not Linked Yet';
        }
    } catch (err) {
        console.warn('Could not fetch accounts:', err);
    }
}

let currentCampaignTab = 'all';

function switchCampaignTab(tab) {
    currentCampaignTab = tab;
    document.querySelectorAll('.campaigns-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-camp-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    renderCampaignsTable();
}

async function fetchAdCampaigns() {
    const tbody = document.getElementById('campaigns-table-body');
    const badge = document.getElementById('campaigns-count-badge');
    if (badge) badge.innerText = 'Syncing...';
    try {
        const res = await fetch('/api/ads/campaigns');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const campaigns = await res.json();
        allCampaignsCache = Array.isArray(campaigns) ? campaigns : [];
        renderCampaignsTable();
    } catch (err) {
        console.error('Error fetching campaigns:', err);
        allCampaignsCache = [];
        if (badge) {
            badge.innerText = 'Error';
            badge.style.background = '#fee2e2';
            badge.style.color = '#b91c1c';
        }
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: #ef4444; font-weight: 500;">Failed to load campaigns: ${err.message}. <button onclick="fetchAdCampaigns()" style="margin-left: 8px; text-decoration: underline; background: none; border: none; color: #3b82f6; cursor: pointer; font-weight: 600;">Click to Retry</button></td></tr>`;
        }
    }
}

function renderCampaignsTable() {
    const tbody = document.getElementById('campaigns-table-body');
    const badge = document.getElementById('campaigns-count-badge');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!Array.isArray(allCampaignsCache) || allCampaignsCache.length === 0) {
        if (badge) {
            badge.innerText = '0 Campaigns';
            badge.style.background = '#f3f4f6';
            badge.style.color = '#6b7280';
        }
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-secondary);">No campaigns yet. Click <strong>✨ Create Campaign</strong> to build one with AI!</td></tr>`;
        const activeMetric = document.getElementById('metric-active-campaigns');
        if (activeMetric) activeMetric.innerText = '0';
        return;
    }

    // Sort: Drafts ALWAYS come first (unapproved drafts top priority, then approved drafts, then live campaigns)
    const sortedCampaigns = [...allCampaignsCache].sort((a, b) => {
        const isDraftA = String(a.status || '').toUpperCase() === 'DRAFT' || !a.published || a.source !== 'META_LIVE';
        const isDraftB = String(b.status || '').toUpperCase() === 'DRAFT' || !b.published || b.source !== 'META_LIVE';
        if (isDraftA && !isDraftB) return -1;
        if (!isDraftA && isDraftB) return 1;
        // Among drafts: unapproved first
        if (isDraftA && isDraftB) {
            if (!a.approved && b.approved) return -1;
            if (a.approved && !b.approved) return 1;
        }
        return 0;
    });

    const draftCampaigns = sortedCampaigns.filter(c => String(c.status || '').toUpperCase() === 'DRAFT' || !c.published || c.source !== 'META_LIVE');
    const liveCampaigns = sortedCampaigns.filter(c => c.source === 'META_LIVE' || (c.published && String(c.status || '').toUpperCase() !== 'DRAFT'));

    // Update tab badges
    const badgeTabAll = document.getElementById('badge-tab-all');
    if (badgeTabAll) badgeTabAll.innerText = sortedCampaigns.length;
    const badgeTabDrafts = document.getElementById('badge-tab-drafts');
    if (badgeTabDrafts) badgeTabDrafts.innerText = draftCampaigns.length;
    const badgeTabLive = document.getElementById('badge-tab-live');
    if (badgeTabLive) badgeTabLive.innerText = liveCampaigns.length;

    if (badge) {
        badge.innerText = `${sortedCampaigns.length} Campaign${sortedCampaigns.length === 1 ? '' : 's'}`;
        badge.style.background = '#dbeafe';
        badge.style.color = '#1e40af';
    }

    let campaignsToRender = sortedCampaigns;
    if (currentCampaignTab === 'drafts') {
        campaignsToRender = draftCampaigns;
    } else if (currentCampaignTab === 'live') {
        campaignsToRender = liveCampaigns;
    }

    if (campaignsToRender.length === 0) {
        const emptyMsg = currentCampaignTab === 'drafts'
            ? 'No draft campaigns right now. Click <strong>✨ Create Campaign</strong> to create a new draft!'
            : 'No live Meta campaigns found for this account.';
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 2.5rem; text-align: center; color: var(--text-secondary);">${emptyMsg}</td></tr>`;
        return;
    }

    let activeCount = 0;
    campaignsToRender.forEach((c, idx) => {
        try {
            if (!c) return;
            const statusUpper = String(c.status || 'DRAFT').toUpperCase();
            if (statusUpper === 'ACTIVE') activeCount++;

            const isDraft = statusUpper === 'DRAFT' || (!c.published && !c.meta_campaign_id) || (c.source !== 'META_LIVE' && !c.published && !c.meta_campaign_id);
            const isApproved = !!c.approved;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.style.display = 'table-row';
            if (isDraft) {
                tr.className = 'campaign-row-draft';
            }

            const statusColor = statusUpper === 'ACTIVE' ? '#10b981' : (statusUpper === 'PAUSED' ? '#f59e0b' : '#d97706');
            
            let approvedBadge = '';
            if (isDraft) {
                approvedBadge = isApproved
                    ? `<span style="background: #dcfce7; color: #15803d; font-size: 0.72rem; font-weight: 700; padding: 4px 8px; border-radius: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">✅ Approved</span>`
                    : `<span style="background: #fee2e2; color: #b91c1c; font-size: 0.72rem; font-weight: 700; padding: 4px 8px; border-radius: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">⏳ Needs Approval</span>`;
            } else {
                approvedBadge = `<span style="background: #f1f5f9; color: #475569; font-size: 0.72rem; font-weight: 600; padding: 4px 8px; border-radius: 12px; white-space: nowrap;">Live Meta</span>`;
            }

            const campId = String(c.meta_campaign_id || c.id || idx);
            const safeCampId = campId.replace(/'/g, "\\'");
            let actionBtns = '';

            if (isDraft) {
                if (!isApproved) {
                    actionBtns += `<button onclick="approveCampaign('${safeCampId}', this)" style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 700; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">✅ Approve</button>`;
                } else if (!c.published && !c.meta_campaign_id) {
                    actionBtns += `<button onclick="publishCampaign('${safeCampId}', this)" style="background: #2563eb; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 700; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">🚀 Publish to Meta</button>`;
                }
                actionBtns += `<button onclick="deleteCampaignDraft('${safeCampId}', this)" style="background: transparent; color: #ef4444; border: 1px solid #fca5a5; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.78rem; font-weight: 600; white-space: nowrap;" title="Delete this draft">🗑️ Delete</button>`;
            } else {
                if (statusUpper === 'ACTIVE') {
                    actionBtns += `<button onclick="toggleCampaignStatus('${safeCampId}', 'PAUSED', this)" style="background: #f59e0b; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Pause</button>`;
                } else {
                    actionBtns += `<button onclick="toggleCampaignStatus('${safeCampId}', 'ACTIVE', this)" style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Resume</button>`;
                }
                actionBtns += `<button onclick="viewCampaignInsights('${safeCampId}')" style="background: transparent; color: #3b82f6; border: 1px solid #3b82f6; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.78rem; font-weight: 600; white-space: nowrap;">Insights</button>`;
            }

            const rawBudget = c.dailyBudget !== undefined && c.dailyBudget !== null && c.dailyBudget !== '' ? c.dailyBudget : (c.budget || '500');
            const displayBudget = Number(rawBudget) > 0 ? `₹${rawBudget}/day` : (rawBudget === 0 || rawBudget === '0' ? 'Account Budget' : `₹${rawBudget}/day`);
            const displayName = c.name || 'Untitled Campaign';
            const displayId = c.meta_campaign_id || c.id || 'N/A';
            const displayDest = c.destinationType || 'WHATSAPP';
            const friendlyDest = displayDest === 'OUTCOME_ENGAGEMENT' ? 'Meta Engagement' : (displayDest === 'OUTCOME_LEADS' ? 'Meta Leads' : (displayDest === 'WHATSAPP' ? 'WhatsApp Direct' : displayDest));

            const typeBadge = isDraft
                ? `<span class="campaign-draft-badge">📝 LOCAL DRAFT</span>`
                : `<span class="campaign-live-badge" style="background: #f1f5f9; color: #475569; border-color: #cbd5e1;">⏸️ META PAUSED</span>`;

            let creativeSnippet = '';
            if (c.headline || c.primaryText) {
                const textPreview = (c.headline || c.primaryText || '').slice(0, 50);
                creativeSnippet = `<div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 2px; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">“${textPreview}”</div>`;
            }

            let imageThumb = '';
            if (c.imageUrl) {
                imageThumb = `<img src="${c.imageUrl}" alt="Creative" style="width: 36px; height: 36px; border-radius: 5px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" onerror="this.style.display='none'">`;
            }

            tr.innerHTML = `
                <td style="padding: 8px 12px; font-weight: 600; border-right: 1px solid var(--border-color); vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${imageThumb}
                        <div style="min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <span style="color: var(--text-primary); font-size: 0.9rem; line-height: 1.25; font-weight: 700;">${displayName}</span>
                                ${typeBadge}
                            </div>
                            ${creativeSnippet}
                            <div style="font-size: 0.7rem; color: var(--text-secondary); font-weight: normal; margin-top: 2px;">ID: ${displayId}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 8px 12px; border-right: 1px solid var(--border-color); vertical-align: middle;">
                    <span style="font-size: 0.75rem; background: var(--table-header-bg); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); display: inline-block; font-weight: 600;">${friendlyDest}</span>
                </td>
                <td style="padding: 8px 12px; font-weight: 700; border-right: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; white-space: nowrap; font-size: 0.85rem;">${displayBudget}</td>
                <td style="padding: 8px 12px; border-right: 1px solid var(--border-color); vertical-align: middle; text-align: center; white-space: nowrap;">${approvedBadge}</td>
                <td style="padding: 8px 12px; border-right: 1px solid var(--border-color); vertical-align: middle; text-align: center; white-space: nowrap;">
                    <span style="color: ${statusColor}; font-weight: 700; font-size: 0.8rem;">● ${statusUpper}</span>
                </td>
                <td style="padding: 8px 12px; text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">${actionBtns}</div>
                </td>
            `;
            tbody.appendChild(tr);
        } catch (rowErr) {
            console.error('Error rendering row for campaign:', c, rowErr);
        }
    });

    const activeMetric = document.getElementById('metric-active-campaigns');
    if (activeMetric) activeMetric.innerText = activeCount;
}

let audienceMap = null;
let audienceMarker = null;
let audienceCircle = null;
let selectedLocationData = null; // No default location pinned initially
let locationSearchTimeout = null;

function openNewCampaignModal() {
    document.getElementById('campaign-modal').style.display = 'flex';
    
    // Set default start date and time if empty
    const startDateInput = document.getElementById('camp-start-date');
    const startTimeInput = document.getElementById('camp-start-time');
    if (startDateInput && !startDateInput.value) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        startDateInput.value = `${year}-${month}-${day}`;
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        if (startTimeInput) startTimeInput.value = `${hours}:${minutes}`;
    }

    if (selectedLocationData) {
        setTimeout(() => initAudienceMap(), 200);
    }

    // Populate WhatsApp phone numbers from connected page
    populateWhatsAppNumbers();
}

function clearSelectedLocation() {
    selectedLocationData = null;
    document.getElementById('location-chip').style.display = 'none';
    document.getElementById('no-location-msg').style.display = 'block';
    document.getElementById('map-wrapper').style.display = 'none';
    document.getElementById('camp-locations').value = 'India';
    document.getElementById('camp-location-search').value = '';
}

function initAudienceMap() {
    const mapContainer = document.getElementById('audience-map');
    if (!mapContainer || !selectedLocationData) return;

    document.getElementById('map-wrapper').style.display = 'block';

    if (!audienceMap) {
        audienceMap = L.map('audience-map').setView([selectedLocationData.lat, selectedLocationData.lon], 9);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(audienceMap);

        audienceCircle = L.circle([selectedLocationData.lat, selectedLocationData.lon], {
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.28,
            weight: 2,
            radius: selectedLocationData.radiusKm * 1000
        }).addTo(audienceMap);

        audienceMarker = L.marker([selectedLocationData.lat, selectedLocationData.lon]).addTo(audienceMap)
            .bindPopup(`<b>${selectedLocationData.name}</b><br>Target Radius: ${selectedLocationData.radiusKm} km`)
            .openPopup();
    } else {
        audienceMap.invalidateSize();
        audienceCircle.setLatLng([selectedLocationData.lat, selectedLocationData.lon]);
        audienceMarker.setLatLng([selectedLocationData.lat, selectedLocationData.lon]);
        centerMapOnSelected();
    }
}

function centerMapOnSelected() {
    if (!audienceMap || !selectedLocationData) return;
    audienceMap.setView([selectedLocationData.lat, selectedLocationData.lon], 9);
}

function updateAudienceRadius(km) {
    const radiusNum = parseInt(km, 10);
    if (selectedLocationData) {
        selectedLocationData.radiusKm = radiusNum;
    }
    
    document.getElementById('radius-val-display').innerText = radiusNum;
    const chipRadius = document.getElementById('chip-radius');
    if (chipRadius) chipRadius.innerText = radiusNum;

    if (audienceCircle) {
        audienceCircle.setRadius(radiusNum * 1000);
    }
    if (audienceMarker && selectedLocationData) {
        audienceMarker.setPopupContent(`<b>${selectedLocationData.name}</b><br>Target Radius: ${radiusNum} km`);
    }
}

// Live Autocomplete with crystal-clear high contrast styling
async function handleLocationInput(query) {
    clearTimeout(locationSearchTimeout);
    const dropdown = document.getElementById('location-suggestions-dropdown');
    
    if (!query || query.trim().length < 2) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    locationSearchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/ads/targeting/search?type=adgeolocation&q=${encodeURIComponent(query.trim())}`);
            const data = await res.json();
            const suggestions = data.data || [];

            if (suggestions.length === 0) {
                dropdown.innerHTML = `<div style="padding: 12px 16px; font-size: 0.9rem; color: #64748b; background: #ffffff;">No locations found matching "<strong>${query}</strong>"</div>`;
                dropdown.style.display = 'block';
                return;
            }

            dropdown.innerHTML = '';
            suggestions.slice(0, 10).forEach(loc => {
                const item = document.createElement('div');
                item.style.padding = '10px 16px';
                item.style.cursor = 'pointer';
                item.style.borderBottom = '1px solid #f1f5f9';
                item.style.background = '#ffffff';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'center';
                item.style.transition = 'background 0.15s ease';

                item.onmouseenter = () => {
                    item.style.background = '#eff6ff';
                };
                item.onmouseleave = () => {
                    item.style.background = '#ffffff';
                };

                const regionStr = loc.region ? `, ${loc.region}` : '';
                const countryStr = loc.country_name ? `, ${loc.country_name}` : '';
                const fullName = `${loc.name}${regionStr}${countryStr}`;
                const typeLabel = loc.type ? loc.type.toUpperCase() : 'LOCATION';

                item.innerHTML = `
                    <div style="text-align: left;">
                        <div style="font-weight: 700; font-size: 0.92rem; color: #0f172a;">${loc.name}</div>
                        <div style="font-size: 0.78rem; color: #475569; margin-top: 2px;">${loc.region || ''} ${countryStr}</div>
                    </div>
                    <span style="font-size: 0.7rem; background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px; font-weight: 700; letter-spacing: 0.5px;">${typeLabel}</span>
                `;

                item.onclick = () => selectLocation(fullName, loc);
                dropdown.appendChild(item);
            });

            dropdown.style.display = 'block';
        } catch (err) {
            console.error('Location search error:', err);
        }
    }, 250);
}

// Select location from dropdown & automatically Geocode + render Map
async function selectLocation(fullName, locObj) {
    const dropdown = document.getElementById('location-suggestions-dropdown');
    dropdown.style.display = 'none';
    document.getElementById('camp-location-search').value = '';
    
    const radius = parseInt(document.getElementById('camp-radius-slider')?.value || 40, 10);
    selectedLocationData = {
        name: fullName,
        lat: 10.0,
        lon: 76.0,
        radiusKm: radius
    };

    document.getElementById('camp-locations').value = fullName;
    document.getElementById('chip-text').innerText = `📍 ${fullName}`;
    document.getElementById('chip-radius').innerText = radius;
    document.getElementById('location-chip').style.display = 'inline-flex';
    document.getElementById('no-location-msg').style.display = 'none';

    // Geocode coordinates via OpenStreetMap Nominatim for exact map pin
    try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullName)}&format=json&limit=1`);
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
            selectedLocationData.lat = parseFloat(geoData[0].lat);
            selectedLocationData.lon = parseFloat(geoData[0].lon);
        }
    } catch (e) {
        console.warn('Geocoding notice:', e.message);
    }

    initAudienceMap();
    if (audienceMap) {
        audienceMap.setView([selectedLocationData.lat, selectedLocationData.lon], 10);
        if (audienceMarker) {
            audienceMarker.setLatLng([selectedLocationData.lat, selectedLocationData.lon]);
            audienceMarker.setPopupContent(`<b>${fullName}</b><br>Target Radius: ${selectedLocationData.radiusKm} km`).openPopup();
        }
        if (audienceCircle) {
            audienceCircle.setLatLng([selectedLocationData.lat, selectedLocationData.lon]);
            audienceCircle.setRadius(selectedLocationData.radiusKm * 1000);
        }
    }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('location-suggestions-dropdown');
    const input = document.getElementById('camp-location-search');
    if (dropdown && e.target !== input && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function closeCampaignModal() {
    document.getElementById('campaign-modal').style.display = 'none';
}

function onDestinationChange(dest) {
    const waConfig = document.getElementById('whatsapp-number-config');
    const webConfig = document.getElementById('website-url-config');

    if (waConfig) {
        waConfig.style.display = (dest === 'WHATSAPP') ? 'block' : 'none';
    }
    if (webConfig) {
        webConfig.style.display = (dest === 'WEBSITE') ? 'block' : 'none';
    }

    const destLabel = document.getElementById('preview-destination-label');
    if (destLabel) {
        if (dest === 'WHATSAPP') {
            const num = (document.getElementById('camp-whatsapp-number')?.value || '').trim();
            destLabel.innerText = num ? `wa.me/${num} • WhatsApp` : 'wa.me • WhatsApp';
        } else if (dest === 'LEAD_GENERATION') {
            destLabel.innerText = 'Meta Instant Form';
        } else {
            const webUrl = (document.getElementById('camp-website-url')?.value || '').trim();
            if (webUrl.includes('wa.me')) {
                destLabel.innerText = 'wa.me • WhatsApp (Direct Link)';
            } else {
                try {
                    const host = new URL(webUrl).hostname;
                    destLabel.innerText = `${host} • Website`;
                } catch {
                    destLabel.innerText = 'Website / WhatsApp Link';
                }
            }
        }
    }
}

function updateWebsitePreviewUrl(val) {
    const destLabel = document.getElementById('preview-destination-label');
    if (!destLabel) return;
    const clean = (val || '').trim();
    if (clean.includes('wa.me')) {
        destLabel.innerText = 'wa.me • WhatsApp (Direct Link)';
    } else {
        try {
            const host = new URL(clean).hostname;
            destLabel.innerText = `${host} • Website`;
        } catch {
            destLabel.innerText = clean || 'Website';
        }
    }
}

function populateWhatsAppNumbers() {
    const select = document.getElementById('camp-whatsapp-select');
    const input = document.getElementById('camp-whatsapp-number');
    if (!select || !input) return;

    select.innerHTML = '<option value="">-- Choose Linked Page Number --</option>';

    let defaultNumber = '';

    // Check connected pages for phone numbers (e.g. Kairali has +919497694866)
    if (connectedPages && connectedPages.length > 0) {
        connectedPages.forEach(p => {
            if (p.phone) {
                const opt = document.createElement('option');
                opt.value = p.phone;
                opt.innerText = `📱 ${p.name.trim()} (${p.phone})`;
                select.appendChild(opt);
                if (!defaultNumber) defaultNumber = p.phone;
            }
        });
    }

    const customOpt = document.createElement('option');
    customOpt.value = 'CUSTOM';
    customOpt.innerText = '➕ Custom Number (Type manually)';
    select.appendChild(customOpt);

    // If input is empty and we have a linked page number, prefill it!
    if (!input.value && defaultNumber) {
        select.value = defaultNumber;
        input.value = defaultNumber;
        updateWhatsAppPreviewNumber(defaultNumber);
    }
}

function onWhatsAppNumberSelect(val) {
    const input = document.getElementById('camp-whatsapp-number');
    if (!input) return;
    if (val && val !== 'CUSTOM') {
        input.value = val;
        updateWhatsAppPreviewNumber(val);
    } else if (val === 'CUSTOM') {
        input.value = '';
        input.focus();
    }
}

function updateWhatsAppPreviewNumber(val) {
    const cleanNum = (val || '').trim();
    const destLabel = document.getElementById('preview-destination-label');
    if (destLabel) {
        if (cleanNum) {
            destLabel.innerText = `wa.me/${cleanNum} • WhatsApp`;
        } else {
            destLabel.innerText = 'wa.me • WhatsApp';
        }
    }
}

function toggleEndDateUI(show) {
    const container = document.getElementById('end-date-container');
    if (container) {
        container.style.display = show ? 'block' : 'none';
    }
}

function onBudgetChange(val) {
    const num = Math.max(191, Math.round(Number(val) || 191));
    const budgetSlider = document.getElementById('camp-budget-slider');
    const budgetInput = document.getElementById('camp-budget');
    const budgetDisplay = document.getElementById('budget-display');
    const summaryBudget = document.getElementById('summary-budget');
    const summaryGst = document.getElementById('summary-gst');
    const summaryTotal = document.getElementById('summary-total');

    if (budgetSlider && budgetSlider.value != num) budgetSlider.value = num;
    if (budgetInput && budgetInput.value != num) budgetInput.value = num;
    if (budgetDisplay) budgetDisplay.innerText = num;

    const gst = Math.round(num * 0.18 * 100) / 100;
    const total = Math.round((num + gst) * 100) / 100;

    if (summaryBudget) summaryBudget.innerText = num.toFixed(2);
    if (summaryGst) summaryGst.innerText = gst.toFixed(2);
    if (summaryTotal) summaryTotal.innerText = total.toFixed(2);
}

async function runAiGeneration() {
    const productName = document.getElementById('ai-product-name').value;
    const description = document.getElementById('ai-product-desc').value;
    const destination = document.getElementById('camp-destination').value;
    const placements = document.getElementById('camp-placements').value;

    if (!productName || !description) {
        alert('Please enter a product name and description to generate AI ad copy.');
        return;
    }

    const btn = document.getElementById('btn-generate-ai');
    btn.disabled = true;
    btn.innerText = '✨ Generating High-Converting Copy...';

    try {
        const res = await fetch('/api/ads/generate-creative', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productName,
                description,
                destination,
                platform: placements
            })
        });

        const data = await res.json();
        if (data.variations && data.variations.length > 0) {
            renderAiVariations(data.variations);
        } else {
            alert('Could not generate variations: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = '✨ Generate AI Ad Copy & Angles';
    }
}

function renderAiVariations(variations) {
    const container = document.getElementById('ai-variations-container');
    container.style.display = 'block';
    container.innerHTML = '<div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 8px;">Select an AI Generated Variation to Apply:</div>';

    variations.forEach((v, idx) => {
        const card = document.createElement('div');
        card.style.background = 'var(--bg-surface)';
        card.style.border = '1px solid var(--border-color)';
        card.style.borderRadius = '6px';
        card.style.padding = '10px 14px';
        card.style.marginBottom = '8px';
        card.style.cursor = 'pointer';
        card.style.transition = 'border-color 0.2s';
        card.onmouseover = () => card.style.borderColor = '#3b82f6';
        card.onmouseout = () => card.style.borderColor = 'var(--border-color)';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 0.85rem; color: #3b82f6;">${v.angle || `Option ${idx+1}`}</span>
                <span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;">Apply Copy ➔</span>
            </div>
            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px;">"${v.headline}"</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${v.primaryText}</div>
        `;

        card.onclick = () => {
            document.getElementById('camp-headline').value = v.headline || '';
            document.getElementById('camp-primary-text').value = v.primaryText || '';
            document.getElementById('camp-description').value = v.description || '';
            updateAdPreview();
        };

        container.appendChild(card);
    });
}

function updateAdPreview() {
    const primaryText = document.getElementById('camp-primary-text').value || 'Transform your clinic with state-of-the-art VR rehabilitation.';
    const headline = document.getElementById('camp-headline').value || 'Chat with Oqulix Specialists';
    const description = document.getElementById('camp-description').value || 'Instant responses on WhatsApp';
    const imageUrl = uploadedAdImagePublicUrl || document.getElementById('camp-image-url').value;

    document.getElementById('preview-primary-text').innerText = primaryText;
    document.getElementById('preview-headline').innerText = headline;
    document.getElementById('preview-desc').innerText = description;

    const imgBox = document.getElementById('preview-image-box');
    if (imageUrl) {
        imgBox.innerHTML = `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'color:#9ca3af;font-size:0.85rem;\\'>Image loading failed</span>';" />`;
    }
}

async function handleAdImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Instant local preview via FileReader (works immediately even before network upload)
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedAdImagePublicUrl = e.target.result;
        updateAdPreview();
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);
    if (connectedAdAccounts && connectedAdAccounts[0]?.id) {
        formData.append('adAccountId', connectedAdAccounts[0].id);
    }

    try {
        const res = await fetch('/api/ads/upload-image', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.publicUrl) {
            uploadedAdImagePublicUrl = data.publicUrl;
            uploadedAdImageHash = data.imageHash || '';
            document.getElementById('camp-image-url').value = data.publicUrl;
            updateAdPreview();
        }
    } catch (err) {
        console.warn('Background upload note:', err.message);
    }
}

async function saveCampaignDraft() {
    const name = document.getElementById('camp-name').value || 'New Meta Campaign';
    const primaryText = document.getElementById('camp-primary-text').value;
    const headline = document.getElementById('camp-headline').value;
    const description = document.getElementById('camp-description').value;
    const imageUrl = uploadedAdImagePublicUrl || document.getElementById('camp-image-url').value;
    const destinationType = document.getElementById('camp-destination').value;
    const placements = document.getElementById('camp-placements').value;
    const dailyBudget = document.getElementById('camp-budget').value || '500';
    const locationsInput = (document.getElementById('camp-locations')?.value || 'India').trim();
    const ageMin = parseInt(document.getElementById('camp-age-min').value) || 18;
    const ageMax = parseInt(document.getElementById('camp-age-max').value) || 65;
    const gender = document.querySelector('input[name="camp-gender"]:checked')?.value || 'ALL';
    const interests = document.getElementById('camp-interests').value;

    const selectedAdAccount = connectedAdAccounts[0]?.id || 'act_primary';
    const selectedPage = connectedPages[0]?.id || 'page_primary';
    const instagramActorId = connectedPages[0]?.instagram_business_account?.id || null;

    const targeting = {
        age_min: ageMin,
        age_max: ageMax,
        publisher_platforms: placements === 'INSTAGRAM_ONLY' ? ['instagram'] : (placements === 'FACEBOOK_ONLY' ? ['facebook'] : ['facebook', 'instagram'])
    };

    if (selectedLocationData && selectedLocationData.lat && selectedLocationData.lon) {
        targeting.geo_locations = {
            custom_locations: [
                {
                    latitude: selectedLocationData.lat,
                    longitude: selectedLocationData.lon,
                    radius: selectedLocationData.radiusKm,
                    distance_unit: 'kilometer'
                }
            ]
        };
    } else {
        targeting.geo_locations = { countries: ['IN'] };
    }

    if (gender === 'MEN') targeting.genders = [1];
    else if (gender === 'WOMEN') targeting.genders = [2];

    // Meta Schedule & Duration settings
    const startDateVal = document.getElementById('camp-start-date')?.value;
    const startTimeVal = document.getElementById('camp-start-time')?.value || '00:00';
    const durationType = document.querySelector('input[name="camp-duration-type"]:checked')?.value || 'CONTINUOUS';
    const endDateVal = document.getElementById('camp-end-date')?.value;
    const endTimeVal = document.getElementById('camp-end-time')?.value || '23:59';
    const businessHoursOnly = document.getElementById('camp-business-hours')?.checked || false;

    let isoStartTime = null;
    let isoEndTime = null;

    if (startDateVal) {
        try {
            isoStartTime = new Date(`${startDateVal}T${startTimeVal}`).toISOString();
        } catch (e) {
            console.warn('Invalid start date/time');
        }
    }

    if (durationType === 'END_DATE' && endDateVal) {
        try {
            isoEndTime = new Date(`${endDateVal}T${endTimeVal}`).toISOString();
        } catch (e) {
            console.warn('Invalid end date/time');
        }
    }

    // WhatsApp Receiving Number
    const rawWaNumber = document.getElementById('camp-whatsapp-number')?.value || '';
    const cleanWaNumber = rawWaNumber.replace(/[^0-9+]/g, '');

    if (destinationType === 'WHATSAPP' && !cleanWaNumber) {
        alert('Please specify the WhatsApp phone number that will receive incoming messages from this ad.');
        return;
    }

    // Website URL / Direct WhatsApp Link
    const websiteUrl = (document.getElementById('camp-website-url')?.value || '').trim();

    if (destinationType === 'WEBSITE' && !websiteUrl) {
        alert('Please specify the destination website URL or WhatsApp link.');
        return;
    }

    const campaignPayload = {
        name,
        primaryText,
        headline,
        description,
        imageUrl,
        imageHash: uploadedAdImageHash,
        destinationType,
        whatsappPhoneNumber: cleanWaNumber,
        websiteUrl: websiteUrl,
        placements,
        dailyBudget,
        startDate: startDateVal,
        startTime: isoStartTime,
        durationType,
        endDate: endDateVal,
        endTime: isoEndTime,
        businessHoursOnly,
        adAccountId: selectedAdAccount,
        pageId: selectedPage,
        instagramActorId,
        locations: locationsInput,
        gender,
        targeting
    };

    try {
        const res = await fetch('/api/ads/campaigns/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(campaignPayload)
        });
        const data = await res.json();
        if (data.success) {
            closeCampaignModal();
            fetchAdCampaigns();
            alert('Campaign draft saved successfully! Remember to review and click "Approve" before publishing.');
        } else {
            alert('Failed to save draft: ' + data.error);
        }
    } catch (err) {
        alert('Error saving draft: ' + err.message);
    }
}

async function approveCampaign(id, btn) {
    if (!id) return;
    let shouldProceed = true;
    try {
        if (typeof window.confirm === 'function') {
            shouldProceed = window.confirm('Are you sure you want to approve this campaign for publishing to Meta?');
        }
    } catch (e) {
        shouldProceed = true;
    }
    if (!shouldProceed) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Approving...';
    }

    try {
        const safeId = encodeURIComponent(String(id).trim());
        const res = await fetch(`/api/ads/campaigns/${safeId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvedBy: 'Admin' })
        });
        const data = await res.json();
        if (data.success) {
            await fetchAdCampaigns();
        } else {
            alert('Approval failed: ' + (data.error || 'Server error'));
            if (btn) {
                btn.disabled = false;
                btn.innerText = '✅ Approve';
            }
        }
    } catch (err) {
        alert('Approval error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerText = '✅ Approve';
        }
    }
}

async function publishCampaign(id, btn) {
    if (!id) return;
    let shouldProceed = true;
    try {
        if (typeof window.confirm === 'function') {
            shouldProceed = window.confirm('Publish this approved campaign to Meta Marketing API?');
        }
    } catch (e) {
        shouldProceed = true;
    }
    if (!shouldProceed) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Publishing...';
    }

    try {
        const safeId = encodeURIComponent(String(id).trim());
        const res = await fetch(`/api/ads/campaigns/${safeId}/publish`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('Campaign published to Meta! Current delivery status is PAUSED until explicitly activated.');
            await fetchAdCampaigns();
        } else {
            alert('Meta Publish Failed: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🚀 Publish to Meta';
            }
        }
    } catch (err) {
        alert('Publish error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerText = '🚀 Publish to Meta';
        }
    }
}

async function toggleCampaignStatus(id, newStatus, btn) {
    if (!id) return;
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Updating...';
    }
    try {
        const safeId = encodeURIComponent(String(id).trim());
        const res = await fetch(`/api/ads/campaigns/${safeId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            await fetchAdCampaigns();
        } else {
            alert('Status update failed: ' + (data.error || 'Server error'));
            if (btn) {
                btn.disabled = false;
                btn.innerText = newStatus === 'ACTIVE' ? 'Resume' : 'Pause';
            }
        }
    } catch (err) {
        alert('Status error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerText = newStatus === 'ACTIVE' ? 'Resume' : 'Pause';
        }
    }
}

async function viewCampaignInsights(id) {
    if (!id) return;
    try {
        const safeId = encodeURIComponent(String(id).trim());
        const res = await fetch(`/api/ads/campaigns/${safeId}/insights`);
        const data = await res.json();
        if (data.success) {
            const ins = data.metaInsights;
            alert(`📊 Performance Insights for "${data.campaign.name}":\n\n` +
                  `• Total Spend: $${ins.spend || '0.00'}\n` +
                  `• Impressions: ${ins.impressions || '0'}\n` +
                  `• Reach: ${ins.reach || '0'}\n` +
                  `• Clicks: ${ins.clicks || '0'}\n` +
                  `• Cost per Click (CPC): $${ins.cpc || '0.00'}\n` +
                  `• Attributed CRM WhatsApp / Lead Inquiries: ${data.attributedLeadsCount || 0}`);
        } else {
            alert('Failed to fetch insights: ' + data.error);
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteCampaignDraft(id, btn) {
    if (!id) return;
    let shouldProceed = true;
    try {
        if (typeof window.confirm === 'function') {
            shouldProceed = window.confirm('Are you sure you want to delete this draft campaign? This cannot be undone.');
        }
    } catch (e) {
        shouldProceed = true;
    }
    if (!shouldProceed) return;

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Deleting...';
    }

    try {
        const safeId = encodeURIComponent(String(id).trim());
        const res = await fetch(`/api/ads/campaigns/${safeId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            await fetchAdCampaigns();
        } else {
            alert('Failed to delete draft: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🗑️ Delete';
            }
        }
    } catch (e) {
        alert('Failed to delete draft: ' + e.message);
        if (btn) {
            btn.disabled = false;
            btn.innerText = '🗑️ Delete';
        }
    }
}

// Explicit Global Window Attachments for inline HTML event handlers
window.switchMainPanel = switchMainPanel;
window.toggleAdsPanel = toggleAdsPanel;
// --- Export Leads to Real Excel (.xlsx) with Perfect Formatting & Auto-Fit Column Widths ---
function exportLeadsToExcel() {
    if (!allLeadsCache || allLeadsCache.length === 0) {
        alert('No leads available to export.');
        return;
    }

    // Sort leads by ranking / score descending
    const sortedLeads = [...allLeadsCache].sort((a, b) => {
        const scoreA = Number(a.lead_score || (a.lead_status === 'HOT' ? 95 : (a.lead_status === 'WARM' ? 65 : 20)));
        const scoreB = Number(b.lead_score || (b.lead_status === 'HOT' ? 95 : (b.lead_status === 'WARM' ? 65 : 20)));
        return scoreB - scoreA;
    });

    // Helper to format clean phone number without scientific notation (e.g. +91 94970 34866)
    const formatPhoneNumber = (raw) => {
        if (!raw) return 'N/A';
        const digits = String(raw).replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) {
            return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
        } else if (digits.length === 10) {
            return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
        }
        return `+${digits}`;
    };

    const headers = [
        'Rank',
        'Lead Score',
        'Category / Status',
        'Customer Name',
        'Phone Number',
        'Business Type',
        'Service Required',
        'Urgency',
        'Budget',
        'Date Added'
    ];

    const dataRows = sortedLeads.map((lead, index) => {
        const rank = index + 1;
        const score = lead.lead_score !== undefined ? lead.lead_score : (lead.lead_status === 'HOT' ? 95 : (lead.lead_status === 'WARM' ? 65 : 20));
        const status = lead.lead_status || 'UNQUALIFIED';
        const name = lead.customer_name || 'Unknown';
        const phone = formatPhoneNumber(lead.phone_number);
        const business = lead.business_type || 'N/A';
        const service = lead.service_required || 'In-Auto Advertising';
        const urgency = lead.urgency || 'MEDIUM';
        const budget = lead.budget || 'N/A';
        const dateAdded = lead.created_at ? new Date(lead.created_at).toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }) : 'N/A';

        return [
            rank,
            score,
            status,
            name,
            phone,
            business,
            service,
            urgency,
            budget,
            dateAdded
        ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `StreetTalks_Customer_Rankings_${dateStr}.xlsx`;

    // If XLSX library is loaded, generate a real formatted .xlsx workbook
    if (typeof XLSX !== 'undefined') {
        const worksheetData = [headers, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        // Auto-fit column widths so no text or headers are cut off or squished
        const colWidths = headers.map((header, colIndex) => {
            let maxLen = header.length;
            dataRows.forEach(row => {
                const cellVal = row[colIndex] ? String(row[colIndex]) : '';
                if (cellVal.length > maxLen) {
                    maxLen = cellVal.length;
                }
            });
            // Add comfortable padding of 4 characters to each column
            return { wch: Math.max(maxLen + 4, 12) };
        });
        ws['!cols'] = colWidths;

        // Apply styles: Header styling + Highlight HOT leads in Red
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // 1. Style Header Row
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const headerAddress = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[headerAddress]) {
                ws[headerAddress].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "1E293B" } }, // Dark navy header
                    alignment: { horizontal: "center", vertical: "center" }
                };
            }
        }

        // 2. Style Data Rows & Highlight HOT leads in Red
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const rowIndex = R - 1; // index in dataRows
            const leadData = sortedLeads[rowIndex];
            const isHot = (leadData && (leadData.lead_status === 'HOT' || leadData.lead_score >= 80));

            // Ensure Phone Number column (index 4 / E) is explicitly treated as plain text strings
            const phoneCellAddress = XLSX.utils.encode_cell({ r: R, c: 4 });
            if (ws[phoneCellAddress]) {
                ws[phoneCellAddress].t = 's'; // Force type String
            }

            // Apply styling across the row
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellAddress]) continue;

                if (isHot) {
                    // Highlight HOT leads with soft light-red background and vivid red bold text
                    ws[cellAddress].s = {
                        fill: { fgColor: { rgb: "FEE2E2" } }, // Light red fill
                        font: { color: { rgb: "DC2626" }, bold: (C === 2 || C === 3) }, // Red text, bold on status/name
                        border: {
                            top: { style: "thin", color: { rgb: "FCA5A5" } },
                            bottom: { style: "thin", color: { rgb: "FCA5A5" } },
                            left: { style: "thin", color: { rgb: "FCA5A5" } },
                            right: { style: "thin", color: { rgb: "FCA5A5" } }
                        }
                    };
                } else {
                    // Regular clean row borders
                    ws[cellAddress].s = {
                        border: {
                            top: { style: "thin", color: { rgb: "E2E8F0" } },
                            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
                        }
                    };
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Customer Rankings');
        XLSX.writeFile(wb, fileName);
    } else {
        // Fallback to CSV if offline / CDN issue, using tab delimiter & text formatting
        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            let str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const csvRows = dataRows.map(row => row.map(escapeCsv).join(','));
        const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...csvRows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `StreetTalks_Customer_Rankings_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

window.exportLeadsToExcel = exportLeadsToExcel;
window.showAdsPanel = showAdsPanel;
window.hideAdsPanel = hideAdsPanel;
window.switchCampaignTab = switchCampaignTab;
window.fetchAdCampaigns = fetchAdCampaigns;
window.fetchConnectedAccounts = fetchConnectedAccounts;
window.openNewCampaignModal = openNewCampaignModal;
window.closeCampaignModal = closeCampaignModal;
window.approveCampaign = approveCampaign;
window.deleteCampaignDraft = deleteCampaignDraft;
window.publishCampaign = publishCampaign;
window.toggleCampaignStatus = toggleCampaignStatus;
window.viewCampaignInsights = viewCampaignInsights;
window.toggleAi = toggleAi;
window.toggleBulkPanel = toggleBulkPanel;
window.toggleDarkMode = toggleDarkMode;

// Initial load with authentication verification
checkAuthOnStartup();

// Automatic Live Sync: Automatically poll every 3 seconds only if authenticated
setInterval(() => {
    if (adminToken && (!document.getElementById('pin-lock-overlay') || document.getElementById('pin-lock-overlay').style.display === 'none')) {
        fetchLeads(true); // silent polling
    }
}, 3000);

