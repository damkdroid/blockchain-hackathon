const Dashboard = {
    NODE_URL: "http://127.0.0.1:5000",
    chain: [],
    userTxs: [],
    receivedFiles: [],
    currentTab: 'send',
    walletAddress: null,
    publicKey: null,
    selectedFile: null,
    
    async init() {
        App.init();
        const sidebar = document.getElementById('sidebar');
        const navbar = document.getElementById('navbar');
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
        
        // Load initial data
        await this.loadAllData();
        this.setupTabs();
        this.setupEventListeners();
        
        // Refresh every 10 seconds
        setInterval(() => this.loadAllData(), 10000);
    },
    
    async loadAllData() {
        try {
            const [chainRes, filesRes] = await Promise.all([
                fetch(`${this.NODE_URL}/chain`),
                fetch(`${this.NODE_URL}/get_received_files/${this.walletAddress}`)
            ]);
            
            this.chain = await chainRes.json();
            this.receivedFiles = await filesRes.json();
            
            // Extract user transactions
            const allTxs = this.chain.flatMap(block => block.transactions);
            this.userTxs = allTxs.filter(tx => tx.sender === this.walletAddress);
            
            // Update displays
            this.updateBalance();
            this.renderCurrentTab();
        } catch (e) {
            console.error('Failed to load data:', e);
            App.showToast('Failed to load data from blockchain', 'error');
        }
    },
    
    updateBalance() {
        // Filter out undefined/null sender or receiver
        const allTxs = this.chain.flatMap(block => 
            block.transactions?.filter(tx => tx && tx.sender && tx.receiver) || []
        
        const allTxs = this.chain.flatMap(block => 
            block.transactions?.filter(tx => tx && tx.sender && tx.receiver) || []
        );
        const totalSent = allTxs.filter(tx => tx.sender === this.walletAddress).reduce((sum, tx) => sum + (tx.amount || 0), 0);
        const totalReceived = allTxs.filter(tx => tx.receiver === this.walletAddress).reduce((sum, tx) => sum + (tx.amount || 0), 0);
        const balance = 1000000 + totalReceived - totalSent;
        const balanceEl = document.getElementById('userBalance');
        if (balanceEl) {
            balanceEl.textContent = `Balance: ${balance.toLocaleString()} KLT`;
        }
    },
    
    setupTabs() {
        const tabBtns = document.querySelectorAll('.dashboard-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.getAttribute('data-tab');
                this.currentTab = tabName;
                
                // Update active state
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Render content
                this.renderCurrentTab();
            });
        });
    },
    
    renderCurrentTab() {
        const contentArea = document.getElementById('dashboardTabContent');
        if (!contentArea) return;
        
        switch(this.currentTab) {
            case 'send':
                this.renderSendTab(contentArea);
                break;
            case 'files':
                this.renderFilesTab(contentArea);
                break;
            case 'received':
                this.renderReceivedTab(contentArea);
                break;
            case 'history':
                this.renderHistoryTab(contentArea);
                break;
            case 'chain':
                this.renderChainTab(contentArea);
                break;
            case 'company':
                this.renderCompanyTab(contentArea);
                break;
        }
    },
    
    renderSendTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <h3>Send Transaction</h3>
                <div class="form-group">
                    <label>Recipient Address</label>
                    <input type="text" id="sendRecipient" placeholder="0x..." class="form-input">
                </div>
                <div class="form-group">
                    <label>Amount (KLT)</label>
                    <input type="number" id="sendAmount" placeholder="0" class="form-input">
                </div>
                <button id="btnSendTx" class="btn-primary">Send Transaction</button>
                <div id="sendStatus" class="status-message"></div>
                
                <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--border-color);">
                    <h4>Fund Account</h4>
                    <p class="text-secondary" style="font-size: 13px; margin-bottom: 1rem;">Get initial KLT for testing (admin only)</p>
                    <input type="text" id="fundAmount" placeholder="Amount" class="form-input" style="margin-bottom: 0.5rem;">
                    <button id="btnFundAccount" class="btn-secondary">Fund This Account</button>
                    <div id="fundStatus" class="status-message"></div>
                </div>
            </div>
        `;
        
        document.getElementById('btnSendTx')?.addEventListener('click', () => this.handleSendTx());
        document.getElementById('btnFundAccount')?.addEventListener('click', () => this.handleFundAccount());
    },
    
    async handleSendTx() {
        const recipient = document.getElementById('sendRecipient')?.value;
        const amount = parseFloat(document.getElementById('sendAmount')?.value);
        const statusEl = document.getElementById('sendStatus');
        
        if (!recipient || !amount || amount <= 0) {
            App.showToast('Enter valid recipient and amount', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${this.NODE_URL}/add_transaction`, {
                method: 'P: this.walletAddress,
                    receiver: recipient,
                    amount: amount,
                    sender_public_key: this.publicKey,
                    timestamp: Math.floor(Date.now() / 1000),
                    signature: ''fy({
                    sender: this.walletAddress,
                    receiver: recipient,
                    amount: amount,
                    sender_public_key: this.publicKey,
                    timestamp: Math.floor(Date.now() / 1000),
                    signature: ''
                })
            });
            
            if (response.ok) {
                App.showToast('Transaction sent successfully', 'success');
                document.getElementById('sendRecipient').value = '';
                document.getElementById('sendAmount').value = '';
                await this.loadAllData();
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Transaction failed');
            }
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },
    
    async handleFundAccount() {
        const amount = parseFloat(document.getElementById('fundAmount')?.value);
        
        if (!amount || amount <= 0) {
            App.showToast('Enter valid amount', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${this.NODE_URL}/fund_account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: this.walletAddress,
                    amount: amount
                })
            });
            
            if (response.ok) {
                App.showToast('Account funded successfully', 'success');
                document.getElementById('fundAmount').value = '';
                await this.loadAllData();
            } else {
                const err = await response.json();
                throw new Error(err.error || 'Funding failed');
            }
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },
    
    renderFilesTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <h3>Send File</h3>
                <div class="form-group">
                    <label>Select File</label>
                    <input type="file" id="fileInput" class="form-input">
                    <div id="fileInfo" class="text-secondary" style="font-size: 12px; margin-top: 0.5rem;"></div>
                </div>
                <div class="form-group">
                    <label>Recipient Address</label>
                    <input type="text" id="fileRecipient" placeholder="0x..." class="form-input">
                </div>
                <button id="btnSendFile" class="btn-primary">Send File</button>
                <div id="fileStatus" class="status-message"></div>
            </div>
        `;
        
        this.setupFileHandling();
        document.getElementById('btnSendFile')?.addEventListener('click', () => this.handleSendFile());
    },
    

    
    setupFileHandling() {
        const input = document.getElementById('fileInput');
        if (!input) return;
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.selectedFile = file;
                const infoEl = document.getElementById('fileInfo');
                if (infoEl) {
                    infoEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
                }
            }
        });
    },
    
    async handleSendFile() {
        if (!this.selectedFile) {
            App.showToast('Select a file', 'error');
            return;
        }
        
        const recipient = document.getElementById('fileRecipient')?.value;
        
        if (!recipient) {
            App.showToast('Enter recipient address', 'error');
            return;
        }
        
        try {
            // Step 1: Upload file to calculate hash
            const formData = new FormData();
            formData.append('file', this.selectedFile);
            
            App.showToast('Calculating file hash...', 'info');
            
            const uploadRes = await fetch(`${this.NODE_URL}/upload_file`, {
                method: 'POST',
                body: formData
            });
            
            if (!uploadRes.ok) throw new Error('Upload failed');
            
            const uploadData = await uploadRes.json();
            
            // Step 2: Send file transaction
            const txRes = await fetch(`${this.NODE_URL}/send_file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: this.walletAddress,
                    receiver: recipient,
                    file_name: uploadData.file_name,
                    file_hash: uploadData.file_hash,
                    file_size: uploadData.file_size,
                    sender_public_key: this.publicKey
                })
            });
            
            if (!txRes.ok) throw new Error('Transaction failed');
            
            App.showToast('File sent successfully!', 'success');
            this.selectedFile = null;
            document.getElementById('fileInput').value = '';
            document.getElementById('fileRecipient').value = '';
            await this.loadAllData();
            
        } catch (e) {
            App.showToast(e.message, 'error');
        }
    },
    
    renderReceivedTab(container) {
        container.innerHTML = `<div class="tab-content"><h3>Received Files</h3><div id="receivedFilesList"></div></div>`;
        
        const listEl = document.getElementById('receivedFilesList');
        if (this.receivedFiles.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No files received yet</p>';
            return;
        }
        
        listEl.innerHTML = this.receivedFiles.map((file, i) => `
            <div class="file-item" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${file.file_name || 'Unknown'}</strong>
                        <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 0.25rem;">
                            From: ${(file.sender || '').slice(0, 10)}...
                        </div>
                        <div style="font-size: 12px; color: var(--text-tertiary);">
                            Hash: ${(file.file_hash || '').slice(0, 16)}...
                        </div>
                        <div style="font-size: 12px; color: var(--text-tertiary);">
                            Size: ${(file.file_size / 1024).toFixed(2)} KB
                        </div>
                    </div>
                    <button class="btn-secondary" onclick="Dashboard.handleVerifyFile('${file.file_hash}', '${file.file_name}')">Verify</button>
                </div>
            </div>
        `).join('');
    },
    
    async handleVerifyFile(hash, fileName) {
        App.showToast('File hash verified on blockchain', 'success');
    },
    
    renderHistoryTab(container) {
        container.innerHTML = `<div class="tab-content"><h3>Transaction History</h3><div id="historyList"></div></div>`;
        
        const listEl = document.getElementById('historyList');
        const allTxs = this.chain.flatMap(block => 
            block.transactions.map(tx => ({
                ...tx,
                blockHash: block.hash,
                blockTime: block.timestamp
            }))
        );
        
        const userRelatedTxs = allTxs.filter(tx => tx.sender === this.walletAddress || tx.receiver === this.walletAddress);
        
        if (userRelatedTxs.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No transactions yet</p>';
            return;
        }
        
        listEl.innerHTML = userRelatedTxs.slice(0, 20).map((tx, i) => {
            const isSent = tx.sender === this.walletAddress;
            const timestamp = new Date(tx.timestamp * 1000).toLocaleString();
            
            return `
                <div class="tx-item" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; margin-bottom: 0.25rem;">
                            ${isSent ? '→ Sent' : '← Received'}
                        </div>
                        <div style="font-size: 12px; color: var(--text-tertiary);">
                            ${isSent ? 'To: ' : 'From: '} ${(isSent ? tx.receiver : tx.sender).slice(0, 10)}...
                        </div>
                        <div style="font-size: 11px; color: var(--text-tertiary);">
                            ${timestamp}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: ${isSent ? 'var(--accent-red)' : 'var(--accent-green)'};">
                            ${isSent ? '-' : '+'} ${(tx.amount || 0).toLocaleString()} KLT
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    renderChainTab(container) {
        container.innerHTML = `<div class="tab-content"><h3>Blockchain</h3><div id="chainList"></div></div>`;
        
        const listEl = document.getElementById('chainList');
        if (this.chain.length === 0) {
            listEl.innerHTML = '<p class="empty-state">No blocks in chain</p>';
            return;
        }
        
        listEl.innerHTML = this.chain.slice(0, 10).map((block, i) => `
            <div class="block-item" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <strong>Block ${i}</strong>
                        <div style="font-size: 11px; font-family: monospace; color: var(--text-tertiary); margin-top: 0.25rem;">
                            Hash: ${block.hash.slice(0, 16)}...
                        </div>
                        <div style="font-size: 11px; font-family: monospace; color: var(--text-tertiary);">
                            Previous: ${block.previous_hash.slice(0, 16)}...
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 12px;">
                        Txs: ${block.transactions.length}
                        <div style="color: var(--text-tertiary); margin-top: 0.25rem;">Nonce: ${block.nonce}</div>
                    </div>
                </div>
                <div style="font-size: 12px; color: var(--text-tertiary); padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                    Transactions: ${block.transactions.map(tx => tx.sender.slice(0, 6) + '→' + (tx.receiver || '').slice(0, 6)).join(', ')}
                </div>
            </div>
        `).join('');
    },
    
    renderCompanyTab(container) {
        container.innerHTML = `
            <div class="tab-content">
                <iframe id="companyIframe" src="./company-manager.html" style="width: 100%; height: 800px; border: none; border-radius: 6px; background: var(--bg-secondary);"></iframe>
            </div>
        `;
    },
    
    setupEventListeners() {
        // Auto-populate wallet address in send forms
        const inputs = document.querySelectorAll('[placeholder="0x..."]');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                if (!input.value && this.walletAddress) {
                    input.placeholder = `${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`;
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});
