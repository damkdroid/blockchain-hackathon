// =====================
// WALLET MANAGEMENT
// =====================

class WalletManager {
    constructor() {
        this.wallet = null;
        this.nodeUrl = 'http://127.0.0.1:5000';
        this.loadWallet();
    }

    /**
     * Generate new RSA wallet
     */
    async generateWallet() {
        const encrypt = new JSEncrypt({ default_key_size: 2048 });
        
        this.wallet = {
            publicKey: encrypt.getPublicKey(),
            privateKey: encrypt.getPrivateKey(),
            address: encrypt.getPublicKey(),
            createdAt: new Date().toISOString()
        };

        await this.saveWallet();
        return this.wallet;
    }

    /**
     * Save wallet to Chrome storage
     */
    async saveWallet() {
        if (!this.wallet) return;
        
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'blockchain_wallet': this.wallet }, resolve);
        });
    }

    /**
     * Load wallet from Chrome storage
     */
    loadWallet() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['blockchain_wallet'], (result) => {
                if (result.blockchain_wallet) {
                    this.wallet = result.blockchain_wallet;
                }
                resolve(this.wallet);
            });
        });
    }

    /**
     * Get wallet address
     */
    getAddress() {
        return this.wallet ? this.wallet.address : null;
    }

    /**
     * Get public key
     */
    getPublicKey() {
        return this.wallet ? this.wallet.publicKey : null;
    }

    /**
     * Get private key
     */
    getPrivateKey() {
        return this.wallet ? this.wallet.privateKey : null;
    }

    /**
     * Sign transaction
     */
    signTransaction(txData) {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        try {
            const encrypt = new JSEncrypt();
            encrypt.setPrivateKey(this.wallet.privateKey);
            
            // Convert transaction to JSON string for signing
            const txString = JSON.stringify(txData);
            const signature = encrypt.sign(txString, CryptoJS.SHA256, "sha256");
            
            return signature;
        } catch (error) {
            console.error('Signing error:', error);
            throw new Error('Failed to sign transaction: ' + error.message);
        }
    }

    /**
     * Export private key (with confirmation)
     */
    exportPrivateKey() {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }
        return this.wallet.privateKey;
    }

    /**
     * Import private key
     */
    async importPrivateKey(privateKey) {
        try {
            const encrypt = new JSEncrypt();
            encrypt.setPrivateKey(privateKey);
            
            // Verify it's valid by getting public key
            const publicKey = encrypt.getPublicKey();
            
            this.wallet = {
                publicKey: publicKey,
                privateKey: privateKey,
                address: publicKey,
                createdAt: new Date().toISOString()
            };

            await this.saveWallet();
            return this.wallet;
        } catch (error) {
            throw new Error('Invalid private key: ' + error.message);
        }
    }

    /**
     * Clear wallet
     */
    async resetWallet() {
        return new Promise((resolve) => {
            chrome.storage.local.remove('blockchain_wallet', () => {
                this.wallet = null;
                resolve();
            });
        });
    }
}

// =====================
// TRANSACTION HANDLER
// =====================

class TransactionHandler {
    constructor(walletManager, nodeUrl) {
        this.walletManager = walletManager;
        this.nodeUrl = nodeUrl;
        this.txHistory = [];
        this.loadHistory();
    }

    /**
     * Create and sign transaction
     */
    async createTransaction(receiver, amount) {
        if (!this.walletManager.wallet) {
            throw new Error('Wallet not initialized');
        }

        const txData = {
            sender: this.walletManager.getAddress(),
            receiver: receiver,
            amount: parseFloat(amount),
            timestamp: Date.now() / 1000
        };

        // Sign the transaction
        const signature = this.walletManager.signTransaction(txData);

        return {
            ...txData,
            signature: signature
        };
    }

    /**
     * Send transaction to blockchain node
     */
    async sendTransaction(receiver, amount) {
        try {
            const tx = await this.createTransaction(receiver, amount);

            const response = await fetch(`${this.nodeUrl}/add_transaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sender: tx.sender,
                    receiver: tx.receiver,
                    amount: tx.amount,
                    timestamp: tx.timestamp,
                    signature: tx.signature
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send transaction');
            }

            // Add to local history
            await this.addToHistory({
                type: 'sent',
                to: receiver,
                amount: amount,
                timestamp: new Date().toISOString(),
                hash: tx.signature.substring(0, 8) + '...'
            });

            return data;
        } catch (error) {
            throw new Error('Transaction failed: ' + error.message);
        }
    }

    /**
     * Add transaction to history
     */
    async addToHistory(tx) {
        this.txHistory.push(tx);
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'tx_history': this.txHistory }, resolve);
        });
    }

    /**
     * Load transaction history
     */
    loadHistory() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['tx_history'], (result) => {
                if (result.tx_history) {
                    this.txHistory = result.tx_history;
                }
                resolve(this.txHistory);
            });
        });
    }

    /**
     * Clear history
     */
    async clearHistory() {
        return new Promise((resolve) => {
            chrome.storage.local.remove('tx_history', () => {
                this.txHistory = [];
                resolve();
            });
        });
    }
}

// =====================
// GLOBAL INSTANCES
// =====================

let walletManager;
let txHandler;

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    // Check if required libraries are loaded
    if (typeof JSEncrypt === 'undefined') {
        console.error('JSEncrypt library not loaded');
        document.body.innerHTML = '<div style="padding: 20px; color: red;"><strong>Error:</strong> Failed to load crypto library. Please refresh the extension.</div>';
        return;
    }
    
    try {
        walletManager = new WalletManager();
        txHandler = new TransactionHandler(walletManager, 'http://127.0.0.1:5000');

        await walletManager.loadWallet();
        await updateUI();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        document.body.innerHTML = '<div style="padding: 20px; color: red;"><strong>Error:</strong> ' + error.message + '</div>';
    }
});

// =====================
// UI UPDATES
// =====================

async function updateUI() {
    if (walletManager.wallet) {
        // Update wallet tab
        document.getElementById('walletAddress').textContent = walletManager.getAddress();
        document.getElementById('status').textContent = 'Initialized ✓';
        document.getElementById('keyStatus').classList.remove('hidden');
        
        // Update node URL input
        const nodeUrlInput = document.getElementById('nodeUrl');
        nodeUrlInput.value = txHandler.nodeUrl;
    } else {
        document.getElementById('walletAddress').textContent = 'Not initialized - Create a wallet';
        document.getElementById('status').textContent = 'Uninitialized';
        document.getElementById('keyStatus').classList.add('hidden');
    }

    updateTransactionHistory();
}

function updateTransactionHistory() {
    const historyDiv = document.getElementById('txHistory');
    
    if (txHandler.txHistory.length === 0) {
        historyDiv.innerHTML = '<p class="empty">No transactions yet</p>';
        return;
    }

    historyDiv.innerHTML = txHandler.txHistory
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(tx => `
            <div class="tx-item ${tx.type}">
                <strong>${tx.type === 'sent' ? 'Sent to' : 'Received from'}</strong> ${tx.to || tx.from}
                <div>Amount: <strong>${tx.amount}</strong> coins</div>
                <div class="tx-hash">Hash: ${tx.hash}</div>
                <div style="font-size: 11px; color: #999;">
                    ${new Date(tx.timestamp).toLocaleString()}
                </div>
            </div>
        `)
        .join('');
}

// =====================
// EVENT LISTENERS
// =====================

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // Wallet Tab
    document.getElementById('copyBtn').addEventListener('click', copyAddress);
    document.getElementById('createWalletBtn').addEventListener('click', createNewWallet);
    document.getElementById('exportKeyBtn').addEventListener('click', exportPrivateKey);
    document.getElementById('importKeyBtn').addEventListener('click', importPrivateKey);
    document.getElementById('resetBtn').addEventListener('click', resetWallet);

    // File input for import
    document.getElementById('fileInput').addEventListener('change', handleFileImport);
}

function switchTab(e) {
    const tabName = e.target.dataset.tab;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab and mark button active
    document.getElementById(tabName).classList.add('active');
    e.target.classList.add('active');
}

async function copyAddress() {
    const address = walletManager.getAddress();
    if (!address) {
        alert('Wallet not initialized');
        return;
    }

    try {
        await navigator.clipboard.writeText(address);
        const btn = document.getElementById('copyBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    } catch (err) {
        alert('Failed to copy address');
    }
}

async function createNewWallet() {
    if (walletManager.wallet && !confirm('You already have a wallet. Create a new one? (Old wallet will be lost)')) {
        return;
    }

    try {
        document.getElementById('createWalletBtn').disabled = true;
        document.getElementById('createWalletBtn').textContent = 'Generating...';
        
        await walletManager.generateWallet();
        await updateUI();
        
        alert('✓ Wallet created successfully!');
    } catch (error) {
        alert('Error creating wallet: ' + error.message);
    } finally {
        document.getElementById('createWalletBtn').disabled = false;
        document.getElementById('createWalletBtn').textContent = 'Create New Wallet';
    }
}

async function exportPrivateKey() {
    if (!walletManager.wallet) {
        alert('Wallet not initialized');
        return;
    }

    const confirmed = confirm('⚠️ WARNING: You are about to export your private key!\n\nAnyone with your private key can steal your funds.\n\nContinue?');
    if (!confirmed) return;

    const password = prompt('Enter a password to encrypt the export:');
    if (!password) return;

    try {
        const encrypted = CryptoJS.AES.encrypt(
            JSON.stringify(walletManager.wallet),
            password
        ).toString();

        const dataStr = JSON.stringify({
            encrypted: encrypted,
            timestamp: new Date().toISOString()
        });

        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wallet_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);

        alert('✓ Wallet exported securely!');
    } catch (error) {
        alert('Error exporting wallet: ' + error.message);
    }
}

function importPrivateKey() {
    const fileInput = document.getElementById('fileInput');
    fileInput.click();
}

async function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const password = prompt('Enter the password used to encrypt this wallet:');
    if (!password) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        const decrypted = CryptoJS.AES.decrypt(data.encrypted, password).toString(CryptoJS.enc.Utf8);
        const wallet = JSON.parse(decrypted);

        // Import the private key
        await walletManager.importPrivateKey(wallet.privateKey);
        await updateUI();

        alert('✓ Wallet imported successfully!');
    } catch (error) {
        alert('Error importing wallet: ' + error.message);
    } finally {
        // Reset file input
        e.target.value = '';
    }
}

async function resetWallet() {
    if (!confirm('⚠️ This will delete your wallet permanently!\n\nMake sure you have backed it up!\n\nContinue?')) {
        return;
    }

    try {
        await walletManager.resetWallet();
        await txHandler.clearHistory();
        await updateUI();
        alert('✓ Wallet reset successfully!');
    } catch (error) {
        alert('Error resetting wallet: ' + error.message);
    }
}

async function handleSendTransaction() {
    if (!walletManager.wallet) {
        alert('Create a wallet first!');
        return;
    }

    const receiver = document.getElementById('recipientAddress').value.trim();
    const amount = document.getElementById('amount').value.trim();
    const statusDiv = document.getElementById('txStatus');

    if (!receiver || !amount) {
        showStatus('Please fill in all fields', 'error', statusDiv);
        return;
    }

    if (parseFloat(amount) <= 0) {
        showStatus('Amount must be greater than 0', 'error', statusDiv);
        return;
    }

    try {
        document.getElementById('sendBtn').disabled = true;
        document.getElementById('sendBtn').textContent = 'Sending...';
        
        showStatus('Signing transaction...', 'info', statusDiv);
        
        const result = await txHandler.sendTransaction(receiver, amount);
        
        showStatus('✓ Transaction sent successfully!', 'success', statusDiv);
        
        // Clear inputs
        document.getElementById('recipientAddress').value = '';
        document.getElementById('amount').value = '';
        
        // Update UI
        await updateUI();
        
    } catch (error) {
        showStatus('✗ ' + error.message, 'error', statusDiv);
    } finally {
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('sendBtn').textContent = 'Send Transaction';
    }
}

function showStatus(message, type, element) {
    element.textContent = message;
    element.className = `status-box ${type}`;
    element.classList.remove('hidden');
}

function updateNodeUrl() {
    const nodeUrl = document.getElementById('nodeUrl').value.trim();
    if (nodeUrl) {
        txHandler.nodeUrl = nodeUrl;
    }
}
