const Dashboard = {
    NODE_URL: "http://127.0.0.1:5000",
    chain: [],
    pending: [],
    userTxs: [],
    receivedFiles: [],
    companies: [],
    selectedCompanyId: '',
    currentTab: 'send',
    walletAddress: null,
    publicKey: null,
    selectedFile: null,
    initialLoadDone: false,
    
    async init() {
        App.init();
        const sidebar = document.getElementById('sidebar');
        const navbar = document.getElementById('navbar');
        const footer = document.getElementById('footer');
        if (sidebar) sidebar.innerHTML = getSidebarHTML('dashboard');
        if (navbar) navbar.innerHTML = getNavbarHTML();
        
        // Get wallet info from session
        const session = WalletAPI?.getSession?.();
        this.walletAddress = session?.address;
        this.publicKey = session?.publicKey;
        
        if (!this.walletAddress) {
            window.location.href = './login.html';
            return;
        }
        
        await this.loadAllData();
        this.setupTabs();
        
        // Copy address logic
        document.getElementById('copyAddress')?.addEventListener('click', () => {
            if (this.walletAddress) {
                navigator.clipboard.writeText(this.walletAddress);
                App.showToast('Address copied to clipboard', 'success');
            }
        });
        
        // Refresh every 3 seconds
        setInterval(() => this.loadAllData(), 3000);
    },
    
    truncate(str, n = 12) {
        if (!str) return '—';
        if (str.length <= n * 2 + 3) return str;
        return str.slice(0, n) + '...' + str.slice(-n);
    },

    timeAgo(ts) {
        if (!ts) return '—';
        const diff = Date.now() / 1000 - ts;
        if (diff < 60) return `${Math.floor(diff)}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    },

    async loadAllData() {
        try {
            const [chainRes, pendingRes, companiesRes, filesRes] = await Promise.all([
                fetch(`${this.NODE_URL}/chain`),
                fetch(`${this.NODE_URL}/get_transactions`),
                fetch(`${this.NODE_URL}/companies`),
                fetch(`${this.NODE_URL}/get_received_files/${this.walletAddress}`)
            ]);
            
            this.chain = await chainRes.json();
            this.pending = await pendingRes.json();
            this.companies = await companiesRes.json();
            this.receivedFiles = await filesRes.json();
            
            // Auto-select company
            if (this.companies.length > 0 && !this.selectedCompanyId) {
                const userCompany = this.companies.find(c => c.owner === this.walletAddress);
                this.selectedCompanyId = userCompany?.company_id || this.companies[0].company_id;
            }
            
            // Build user transactions list (confirmed + pending)
            this.userTxs = [
                ...this.chain.flatMap(block =>
                    (block.transactions || [])
                        .filter(tx => tx.sender === this.walletAddress || tx.receiver === this.walletAddress)
                        .map(tx => ({ ...tx, confirmed: true, blockHash: block.hash }))
                ),
                ...this.pending
                    .filter(tx => tx.sender === this.walletAddress || tx.receiver === this.walletAddress)
                    .map(tx => ({ ...tx, confirmed: false }))
            ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            this.updateBalance();
            
            // Only render the whole tab on the initial load to avoid wiping user input
            if (!this.initialLoadDone) {
                this.renderCurrentTab();
                this.initialLoadDone = true;
            } else {
                // If we are in the 'chain' or 'history' tab, we might want to refresh the list 
                // because those are read-only, but for 'send', 'files' and 'received' we must NOT wipe the UI.
                if (['history', 'chain'].includes(this.currentTab)) {
                    this.renderCurrentTab();
                }
            }
        } catch (e) {
            console.error('Failed to load data:', e);
        }
    },
    
    updateBalance() {
        const balance = this.chain
            .flatMap(b => b.transactions || [])
            .reduce((acc, tx) => {
                if (tx.receiver === this.walletAddress) acc += (tx.amount || 0);
                if (tx.sender === this.walletAddress) acc -= (tx.amount || 0);
                return acc;
            }, 0);

        const balanceEl = document.getElementById('userBalance');
        if (balanceEl) balanceEl.textContent = `${balance.toFixed(4)} KLT`;
        
        const walletEl = document.getElementById('walletAddr');
        if (walletEl && this.walletAddress) {
            walletEl.textContent = `${this.walletAddress.slice(0, 10)}...${this.walletAddress.slice(-6)}`;
        }

        const pendingEl = document.getElementById('pendingCount');
        if (pendingEl) pendingEl.textContent = this.pending.length;

        const totalTxEl = document.getElementById('totalTxCount');
        if (totalTxEl) {
            const confirmedCount = this.chain.reduce((acc, b) => acc + (b.transactions?.length || 0), 0);
            totalTxEl.textContent = confirmedCount;
        }
    },
    
    setupTabs() {
        document.querySelectorAll('.dashboard-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTab = btn.getAttribute('data-tab');
                document.querySelectorAll('.dashboard-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderCurrentTab();
            });
        });
    },
    
    renderCurrentTab() {
        const el = document.getElementById('dashboardTabContent');
        if (!el) return;
        switch(this.currentTab) {
            case 'send': this.renderSendTab(el); break;
            case 'files': this.renderFilesTab(el); break;
            case 'received': this.renderReceivedTab(el); break;
            case 'history': this.renderHistoryTab(el); break;
            case 'chain': this.renderChainTab(el); break;
        }
    },
    
    // ===== SEND TAB =====
    renderSendTab(container) {
        const walletAddr = this.walletAddress?.toLowerCase();
        // Filter companies where user is owner or employee
        const myCompanies = this.companies.filter(company => {
            if (!walletAddr) return false;
            if (company.owner?.toLowerCase() === walletAddr) return true;
            if (company.employees) {
                if (Array.isArray(company.employees)) {
                    return company.employees.some(emp => {
                        const addr = typeof emp === 'string' ? emp : emp.address;
                        return addr?.toLowerCase() === walletAddr;
                    });
                } else {
                    return Object.keys(company.employees).some(addr => addr.toLowerCase() === walletAddr);
                }
            }
            return false;
        });

        const companyOptions = myCompanies.map(c =>
            `<option value="${c.company_id}" ${c.company_id === this.selectedCompanyId ? 'selected' : ''}>${c.name} (${this.truncate(c.company_id)})</option>`
        ).join('');

        container.innerHTML = `
            <div class="tab-content">
                <h3>Send Transaction</h3>
                <div class="form-group">
                    <label>Company</label>
                    <select id="sendCompany" class="form-input"">
                        <option value="">-- Select a company --</option>
                        ${companyOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Recipient Address</label>
                    <input type="text" id="sendRecipient" placeholder="0x..." class="form-input">
                </div>
                <div class="form-group">
                    <label>Amount (KLT)</label>
                    <input type="number" id="sendAmount" placeholder="0.00" min="0" step="0.0001" class="form-input">
                </div>
                <button id="btnSendTx" type="button" class="btn-primary">Send Transaction</button>
                
                <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--border-color);">
                    <h4>Fund Account</h4>
                    <p class="text-secondary" style="font-size: 13px; margin-bottom: 1rem;">Get initial KLT for testing</p>
                    <button id="btnFundAccount" type="button" class="btn-secondary">Fund Account (1000 KLT)</button>
                </div>
                <div id="sendStatus" class="status-message"></div>
            </div>
        `;
        
        document.getElementById('sendCompany')?.addEventListener('change', (e) => {
            this.selectedCompanyId = e.target.value;
        });

        document.getElementById('btnSendTx')?.addEventListener('click', () => this.handleSendTx());
        document.getElementById('btnFundAccount')?.addEventListener('click', () => this.handleFundAccount());
    },
    
    async handleSendTx() {
        const recipient = document.getElementById('sendRecipient')?.value;
        const amount = parseFloat(document.getElementById('sendAmount')?.value);
        
        if (!this.selectedCompanyId) {
            App.showToast('Please select a company', 'error');
            return;
        }
        if (!recipient || !amount || amount <= 0) {
            App.showToast('Enter valid recipient and amount', 'error');
            return;
        }
        
        try {
            // Build transaction data
            const txData = {
                sender: this.walletAddress,
                receiver: recipient.trim(),
                amount: amount,
                timestamp: Math.floor(Date.now() / 1000),
                company_id: this.selectedCompanyId,
                role: 'employee'
            };

            // Try wallet signing (only needed for personal transactions)
            let signature = '';
            if (!this.selectedCompanyId) {
                try {
                    if (window.walletExtension) {
                        const challenge = JSON.stringify(txData);
                        const result = await WalletAPI.signIn();
                        signature = result.signature || '';
                    }
                } catch (signErr) {
                    console.warn('Wallet signing skipped:', signErr.message);
                }
            }

            const payload = {
                ...txData,
                signature: signature,
                sender_public_key: this.publicKey
            };
            
            const response = await fetch(`${this.NODE_URL}/add_transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Transaction failed');
            
            // Check if transaction is pending approval
            if (data.status === 'pending_approval') {
                App.showToast(`⏳ Transaction pending approval! Awaiting ${data.required_approvers.join(', ')} approval.`, 'info');
            } else {
                App.showToast('✓ Transaction submitted successfully!', 'success');
            }
            
            document.getElementById('sendRecipient').value = '';
            document.getElementById('sendAmount').value = '';
            await this.loadAllData();
            this.renderCurrentTab();
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },
    
    async handleFundAccount() {
        try {
            const response = await fetch(`${this.NODE_URL}/fund_account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: this.walletAddress, amount: 1000 })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Funding failed');
            App.showToast('✓ Account funded with 1000 KLT!', 'success');
            setTimeout(() => this.loadAllData(), 1000);
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },

    // ===== FILES TAB =====
    renderFilesTab(container) {
        const companyLabel = this.selectedCompanyId
            ? (this.companies.find(c => c.company_id === this.selectedCompanyId)?.name || 'Unknown')
            : '';

        container.innerHTML = `
            <div class="tab-content">
                <h3>Send File</h3>
                <div class="form-group">
                    <label>Select File</label>
                    <input type="file" id="fileInput" class="form-input">
                    <div id="fileInfo" class="text-secondary" style="font-size: 12px; margin-top: 0.5rem;"></div>
                </div>
                <div id="fileHashDisplay" style="display:none; font-size: 11px; font-family: monospace; color: var(--text-secondary); word-break: break-all; padding: 8px 10px; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 1rem;"></div>
                <div class="form-group">
                    <label>Recipient Address</label>
                    <input type="text" id="fileRecipient" placeholder="0x..." class="form-input">
                </div>
                ${companyLabel ? `<div style="font-size: 12px; color: var(--text-secondary); padding: 8px 10px; background: var(--bg-secondary); border-radius: 4px; margin-bottom: 1rem;">Company: ${companyLabel}</div>` : ''}
                <button id="btnSendFile" type="button" class="btn-primary">Send File</button>
                <div id="fileStatus" class="status-message"></div>
            </div>
        `;
        
        this.setupFileHandling();
        document.getElementById('btnSendFile')?.addEventListener('click', () => this.handleSendFile());
    },
    
    setupFileHandling() {
        document.getElementById('fileInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.selectedFile = file;
                const infoEl = document.getElementById('fileInfo');
                if (infoEl) infoEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            }
        });
    },
    
    async handleSendFile() {
        if (!this.selectedFile) { App.showToast('Select a file', 'error'); return; }
        const recipient = document.getElementById('fileRecipient')?.value;
        if (!recipient) { App.showToast('Enter recipient address', 'error'); return; }
        
        try {
            App.showToast('Calculating file hash...', 'info');
            const formData = new FormData();
            formData.append('file', this.selectedFile);
            
            const uploadRes = await fetch(`${this.NODE_URL}/upload_file`, { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error('File hash calculation failed');
            const uploadData = await uploadRes.json();
            
            const hashEl = document.getElementById('fileHashDisplay');
            if (hashEl) { hashEl.style.display = 'block'; hashEl.textContent = `Hash: ${uploadData.file_hash}`; }

            const txRes = await fetch(`${this.NODE_URL}/send_file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: this.walletAddress,
                    receiver: recipient.trim(),
                    file_name: uploadData.file_name,
                    file_hash: uploadData.file_hash,
                    file_size: uploadData.file_size,
                    company_id: this.selectedCompanyId || null,
                    sender_public_key: this.publicKey
                })
            });
            if (!txRes.ok) throw new Error('File transaction failed');
            
            App.showToast(`File sent! Hash: ${uploadData.file_hash.substring(0, 16)}...`, 'success');
            this.selectedFile = null;
            document.getElementById('fileInput').value = '';
            document.getElementById('fileRecipient').value = '';
            await this.loadAllData();
            this.renderCurrentTab();
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },

    // ===== RECEIVED FILES TAB =====
    renderReceivedTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Received Files</h3>
                    <button class="btn-secondary" onclick="Dashboard.loadAllData().then(() => Dashboard.renderCurrentTab())" style="font-size: 12px;">
                        <i class="fas fa-sync"></i> Refresh
                    </button>
                </div>
                <div id="receivedFilesList"></div>
            </div>
        `;
        const listEl = document.getElementById('receivedFilesList');
        
        if (!this.receivedFiles || this.receivedFiles.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No files received yet.</p>';
            return;
        }
        
        listEl.innerHTML = this.receivedFiles.map((file, i) => `
            <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>${file.file_name || 'Unknown'}</strong>
                        <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 0.25rem;">From: ${this.truncate(file.sender, 8)}</div>
                        <div style="font-size: 12px; color: var(--text-tertiary);">Size: ${((file.file_size || 0) / 1024).toFixed(2)} KB</div>
                    </div>
                    <span style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: ${file.confirmed ? 'rgba(0,230,118,0.1)' : 'rgba(255,159,67,0.1)'}; color: ${file.confirmed ? 'var(--accent-green)' : 'var(--accent-orange)'};">
                        ${file.confirmed ? '✓ Confirmed' : 'Pending'}
                    </span>
                </div>
                <div style="font-size: 10px; font-family: monospace; color: var(--text-tertiary); word-break: break-all; padding: 6px 8px; background: var(--bg-secondary); border-radius: 3px; margin-bottom: 0.5rem;">
                    Hash: ${(file.file_hash || '').substring(0, 16)}...${(file.file_hash || '').slice(-16)}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="file" id="verify-file-${i}" style="flex: 1; font-size: 12px;">
                    <button class="btn-secondary" onclick="Dashboard.verifyFile(${i})" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">Verify</button>
                </div>
                <div id="verify-status-${i}" style="margin-top: 0.5rem;"></div>
            </div>
        `).join('');
    },
    
    async verifyFile(index) {
        const file = this.receivedFiles[index];
        const fileInput = document.getElementById(`verify-file-${index}`);
        const statusEl = document.getElementById(`verify-status-${index}`);
        
        if (!fileInput?.files[0]) {
            statusEl.innerHTML = '<span style="color: var(--accent-red); font-size: 12px;">Select a file to verify</span>';
            return;
        }
        
        statusEl.innerHTML = '<span style="color: var(--accent); font-size: 12px;">Verifying...</span>';
        
        try {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('expected_hash', file.file_hash);
            
            const res = await fetch(`${this.NODE_URL}/verify_file`, { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.verified) {
                statusEl.innerHTML = '<span style="color: var(--accent-green); font-size: 12px;">✓ File verified! Hash matches blockchain record.</span>';
            } else {
                statusEl.innerHTML = `<span style="color: var(--accent-red); font-size: 12px;">✗ Hash mismatch!<br>Expected: ${data.expected}<br>Actual: ${data.actual}</span>`;
            }
        } catch (e) {
            statusEl.innerHTML = `<span style="color: var(--accent-red); font-size: 12px;">Error: ${e.message}</span>`;
        }
    },

    // ===== HISTORY TAB =====
    renderHistoryTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Transaction History</h3>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-secondary" onclick="Dashboard.exportToCSV()" style="font-size: 12px;">
                            <i class="fas fa-file-csv"></i> Export CSV
                        </button>
                        <button class="btn-primary" onclick="Dashboard.exportToPDF()" style="font-size: 12px;">
                            <i class="fas fa-file-pdf"></i> Export PDF
                        </button>
                    </div>
                </div>
                <div id="historyList"></div>
            </div>
        `;
        const listEl = document.getElementById('historyList');
        
        if (this.userTxs.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No transactions yet.</p>';
            return;
        }
        
        listEl.innerHTML = this.userTxs.slice(0, 30).map(tx => {
            const isSent = tx.sender === this.walletAddress;
            return `
                <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; background: ${isSent ? 'rgba(255,76,106,0.1)' : 'rgba(0,230,118,0.1)'}; color: ${isSent ? 'var(--accent-red)' : 'var(--accent-green)'};">
                                ${isSent ? 'Debit' : 'Credit'}
                            </span>
                            ${!tx.confirmed ? '<span style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: rgba(0,152,255,0.1); color: var(--accent);">pending</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: var(--text-tertiary); font-family: monospace;">
                            ${isSent ? `To: <span style="color:var(--text-tertiary)">${this.truncate(tx.receiver, 10)}</span>` : `From: <span style="color:var(--text-tertiary)">${this.truncate(tx.sender, 10)}</span>`}
                        </div>
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">${this.timeAgo(tx.timestamp)}</div>
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: ${isSent ? 'var(--accent-red)' : 'var(--accent-green)'};">
                        ${isSent ? '-' : '+'}${parseFloat(tx.amount || 0).toFixed(4)}
                    </div>
                </div>
            `;
        }).join('');
    },

    exportToCSV() {
        if (this.userTxs.length === 0) {
            App.showToast('No transactions to export', 'info');
            return;
        }

        const headers = ['Timestamp', 'Type', 'From', 'To', 'Amount', 'Status', 'Block Hash'];
        const csvContent = [
            headers.join(','),
            ...this.userTxs.map(tx => {
                const type = tx.sender === this.walletAddress ? 'DEBIT' : 'CREDIT';
                const date = new Date((tx.timestamp || 0) * 1000).toLocaleString();
                return [
                    `"${date}"`,
                    type,
                    `"${tx.sender}"`,
                    `"${tx.receiver}"`,
                    tx.amount,
                    tx.confirmed ? 'Confirmed' : 'Pending',
                    `"${tx.blockHash || 'N/A'}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `transactions_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        App.showToast('Exporting transactions to CSV...', 'success');
    },

    exportToPDF() {
        if (this.userTxs.length === 0) {
            App.showToast('No transactions to export', 'info');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(18);
            doc.text("Transaction Statement", 14, 22);
            
            doc.setFontSize(11);
            doc.text(`Wallet: ${this.walletAddress}`, 14, 30);
            doc.text(`Date Generated: ${new Date().toLocaleString()}`, 14, 36);

            const tableColumn = ["Date", "Type", "Counterparty", "Amount", "Status"];
            const tableRows = [];

            this.userTxs.forEach(tx => {
                const isSent = tx.sender === this.walletAddress;
                const type = isSent ? 'DEBIT' : 'CREDIT';
                const counterparty = isSent ? tx.receiver : tx.sender;
                const date = new Date((tx.timestamp || 0) * 1000).toLocaleString();
                
                tableRows.push([
                    date,
                    type,
                    this.truncate(counterparty, 12),
                    `${isSent ? '-' : '+'}${parseFloat(tx.amount || 0).toFixed(4)}`,
                    tx.confirmed ? 'Confirmed' : 'Pending'
                ]);
            });

            doc.autoTable({
                startY: 45,
                head: [tableColumn],
                body: tableRows,
                theme: 'striped',
                headStyles: { fillColor: [209, 180, 18] }, // gold color
            });

            doc.save(`transactions_${new Date().getTime()}.pdf`);
            App.showToast('Exporting transactions to PDF...', 'success');
        } catch (e) {
            console.error(e);
            App.showToast('Error generating PDF', 'error');
        }
    },

    // ===== CHAIN TAB =====
    renderChainTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Blockchain (${this.chain.length} blocks)</h3>
                    <button class="btn-secondary" onclick="Dashboard.loadAllData()">Refresh</button>
                </div>
                <div id="chainList"></div>
            </div>
        `;
        
        const listEl = document.getElementById('chainList');
        if (this.chain.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No blocks in chain</p>';
            return;
        }
        
        listEl.innerHTML = [...this.chain].reverse().map((block, i) => `
            <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>Block #${this.chain.length - 1 - i}</strong>
                    <span style="font-size: 11px; font-family: monospace; color: var(--text-tertiary);">${this.truncate(block.hash, 10)}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                    ${block.transactions.length} transaction${block.transactions.length !== 1 ? 's' : ''} · ${this.timeAgo(block.timestamp)}
                </div>
                ${block.transactions.map(tx => `
                    <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-top: 1px solid var(--border-color); color: var(--text-secondary); font-family: monospace;">
                        <span>${this.truncate(tx.sender, 8)} → ${this.truncate(tx.receiver, 8)}</span>
                        <span style="font-weight: 500; color: var(--text-primary);">${parseFloat(tx.amount || 0).toFixed(4)}</span>
                    </div>
                `).join('')}
                ${block.transactions.length === 0 ? '<div style="font-size: 12px; color: var(--text-tertiary);">Genesis block</div>' : ''}
            </div>
        `).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Dashboard = Dashboard;
    Dashboard.init();
});
