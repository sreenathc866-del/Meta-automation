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
        
        card.innerHTML = `
            <div class="lead-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="lead-name" style="font-weight: ${unreadCount > 0 ? '700' : '600'}; display: flex; align-items: center; gap: 6px;">
                    ${lead.customer_name || 'Unknown User'}
                    ${unreadCount > 0 ? '<span style="width: 8px; height: 8px; background: #25d366; border-radius: 50%; display: inline-block;"></span>' : ''}
                </span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadgeHtml}
                    <span class="status-badge ${lead.lead_status}">${lead.lead_status}</span>
                </div>
            </div>
            <div class="lead-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span>${lead.phone_number}</span>
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

    if (detailPanel) detailPanel.style.display = (panelName === 'detail') ? 'flex' : 'none';
    if (emptyState) emptyState.style.display = (panelName === 'empty') ? 'flex' : 'none';
    if (bulkPanel) bulkPanel.style.display = (panelName === 'bulk') ? 'flex' : 'none';
    if (adsPanel) adsPanel.style.display = (panelName === 'ads') ? 'flex' : 'none';
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
    document.getElementById('detail-badges').innerHTML = `<span class="status-badge ${lead.lead_status}">${lead.lead_status}</span>`;
    
    // Populate drawer details
    document.getElementById('drawer-name').innerText = lead.customer_name || 'Unknown User';
    document.getElementById('drawer-phone').innerText = lead.phone_number;
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
    switchMainPanel('empty');
    const contactPanel = document.getElementById('contact-info-panel');
    if (contactPanel) contactPanel.style.display = 'none';
}

function toggleContactInfo() {
    const panel = document.getElementById('contact-info-panel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
    } else {
        panel.style.display = 'none';
    }
}

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
    if (adsPanel && adsPanel.style.display === 'flex') {
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
                    // Meta returns balance/amount_spent in cents / subunits (divide by 100) or direct number
                    if (acc.balance !== undefined && acc.balance !== null) {
                        const balNum = (parseFloat(acc.balance) / 100).toFixed(2);
                        balanceEl.innerText = `${currency}${balNum}`;
                    } else {
                        balanceEl.innerText = `${currency}0.00`;
                    }

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

    if (badge) {
        badge.innerText = `${allCampaignsCache.length} Campaign${allCampaignsCache.length === 1 ? '' : 's'}`;
        badge.style.background = '#dbeafe';
        badge.style.color = '#1e40af';
    }

    let activeCount = 0;
    allCampaignsCache.forEach((c, idx) => {
        try {
            if (!c) return;
            const statusUpper = String(c.status || 'DRAFT').toUpperCase();
            if (statusUpper === 'ACTIVE') activeCount++;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.style.display = 'table-row';

            const statusColor = statusUpper === 'ACTIVE' ? '#10b981' : (statusUpper === 'PAUSED' ? '#f59e0b' : '#6b7280');
            const isApproved = !!c.approved;
            const approvedBadge = isApproved 
                ? `<span style="background: #dcfce7; color: #15803d; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">✅ Approved</span>`
                : `<span style="background: #fee2e2; color: #b91c1c; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">⏳ Needs Approval</span>`;

            const campId = String(c.id || c.meta_campaign_id || idx);
            const safeCampId = campId.replace(/'/g, "\\'");
            let actionBtns = '';

            if (!isApproved) {
                actionBtns += `<button onclick="approveCampaign('${safeCampId}')" style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Approve</button>`;
            } else if (!c.published) {
                actionBtns += `<button onclick="publishCampaign('${safeCampId}')" style="background: #2563eb; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">🚀 Publish to Meta</button>`;
            } else {
                if (statusUpper === 'ACTIVE') {
                    actionBtns += `<button onclick="toggleCampaignStatus('${safeCampId}', 'PAUSED')" style="background: #f59e0b; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Pause</button>`;
                } else {
                    actionBtns += `<button onclick="toggleCampaignStatus('${safeCampId}', 'ACTIVE')" style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Resume</button>`;
                }
            }

            actionBtns += `<button onclick="viewCampaignInsights('${safeCampId}')" style="background: transparent; color: #3b82f6; border: 1px solid #3b82f6; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Insights</button>`;

            const rawBudget = c.dailyBudget !== undefined && c.dailyBudget !== null && c.dailyBudget !== '' ? c.dailyBudget : (c.budget || '500');
            const displayBudget = Number(rawBudget) > 0 ? `₹${rawBudget}/day` : (rawBudget === 0 || rawBudget === '0' ? 'Account Budget' : `₹${rawBudget}/day`);
            const displayName = c.name || 'Untitled Campaign';
            const displayId = c.meta_campaign_id || c.id || 'N/A';
            const displayDest = c.destinationType || 'WHATSAPP';

            tr.innerHTML = `
                <td style="padding: 12px 14px; font-weight: 600; border-right: 1px solid var(--border-color); vertical-align: middle;">
                    <div style="color: var(--text-primary); font-size: 0.95rem; line-height: 1.25; word-break: break-word;">${displayName}</div>
                    <div style="font-size: 0.73rem; color: var(--text-secondary); font-weight: normal; margin-top: 3px; word-break: break-all;">ID: ${displayId}</div>
                </td>
                <td style="padding: 12px 14px; border-right: 1px solid var(--border-color); vertical-align: middle;">
                    <span style="font-size: 0.8rem; background: var(--table-header-bg); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); display: inline-block; font-weight: 600;">${displayDest}</span>
                </td>
                <td style="padding: 12px 14px; font-weight: 700; border-right: 1px solid var(--border-color); color: var(--text-primary); vertical-align: middle; white-space: nowrap;">${displayBudget}</td>
                <td style="padding: 12px 14px; border-right: 1px solid var(--border-color); vertical-align: middle; text-align: center; white-space: nowrap;">${approvedBadge}</td>
                <td style="padding: 12px 14px; border-right: 1px solid var(--border-color); vertical-align: middle; text-align: center; white-space: nowrap;">
                    <span style="color: ${statusColor}; font-weight: 700; font-size: 0.85rem;">● ${statusUpper}</span>
                </td>
                <td style="padding: 12px 16px; text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 8px; align-items: center; justify-content: flex-end;">${actionBtns}</div>
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

async function approveCampaign(id) {
    if (!confirm('Are you sure you want to approve this campaign for publishing to Meta?')) return;
    try {
        const res = await fetch(`/api/ads/campaigns/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvedBy: 'Admin' })
        });
        const data = await res.json();
        if (data.success) {
            fetchAdCampaigns();
        } else {
            alert('Approval failed: ' + data.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

async function publishCampaign(id) {
    if (!confirm('Publish this approved campaign to Meta Marketing API?')) return;
    try {
        const res = await fetch(`/api/ads/campaigns/${id}/publish`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('Campaign published to Meta! Current delivery status is PAUSED until explicitly activated.');
            fetchAdCampaigns();
        } else {
            alert('Meta Publish Failed: ' + data.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

async function toggleCampaignStatus(id, newStatus) {
    try {
        const res = await fetch(`/api/ads/campaigns/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            fetchAdCampaigns();
        } else {
            alert('Status update failed: ' + data.error);
        }
    } catch (err) {
        alert(err.message);
    }
}

async function viewCampaignInsights(id) {
    try {
        const res = await fetch(`/api/ads/campaigns/${id}/insights`);
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

// Initial load
fetchLeads();
fetchConnectedAccounts().catch(e => console.warn('Init account fetch error:', e));
fetchAdCampaigns().catch(e => console.warn('Init campaign fetch error:', e));

// Automatic Live Sync: Automatically poll every 3 seconds so incoming messages & AI replies show up in real-time
setInterval(() => {
    fetchLeads(true); // silent polling
}, 3000);

