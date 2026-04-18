/**
 * Popup Script - popup.js
 * Handles both normal wallet view and sign-in request view
 */

let pendingSignInRequest = null;

document.addEventListener('DOMContentLoaded', async () => {
if (!window.crypto || !window.crypto.subtle) {
    document.body.innerHTML = '<div style="padding: 20px; color: red;"><strong>Error:</strong> Web Crypto API not available.</div>';
    return;
}

    try {
        walletManager = new WalletManager();
        await walletManager.loadWallet();

        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');

        if (mode === 'signin') {
            await initSignInView();
        } else {
            txHandler = new TransactionHandler(walletManager, 'http://127.0.0.1:5000');
            await initWalletView();
            setupEventListeners();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        document.body.innerHTML = '<div style="padding: 20px; color: red;"><strong>Error:</strong> ' + error.message + '</div>';
    }
});

/**
 * Initialize the normal wallet view
 */
async function initWalletView() {
    const walletView = document.getElementById('wallet-view');
    const signinView = document.getElementById('signin-view');
    
    if (walletView) walletView.style.display = 'block';
    if (signinView) signinView.classList.add('hidden');
    
    await updateUI();
    setupWalletEventListeners();
}

/**
 * Initialize the sign-in request view
 */
async function initSignInView() {
    const walletView = document.getElementById('wallet-view');
    const signinView = document.getElementById('signin-view');
    
    if (walletView) walletView.style.display = 'none';
    if (signinView) signinView.classList.remove('hidden');

    // Load pending sign-in request
    pendingSignInRequest = await getPendingSignInRequest();
    
    if (!pendingSignInRequest) {
        alert('No pending sign-in request');
        window.close();
        return;
    }

    // Update sign-in UI with request details
    const originEl = document.getElementById('signinOrigin');
    const messageEl = document.getElementById('signinMessage');
    const addressEl = document.getElementById('signinAddress');
    const pubKeyEl = document.getElementById('signinPublicKey');

    if (originEl) originEl.textContent = pendingSignInRequest.origin || 'Unknown';
    if (messageEl) messageEl.textContent = pendingSignInRequest.challenge;

    // Show wallet details
    if (walletManager.wallet) {
        if (addressEl) addressEl.textContent = walletManager.getAddress();
        if (pubKeyEl) pubKeyEl.textContent = walletManager.getPublicKey();
    } else {
        if (addressEl) addressEl.textContent = 'Wallet not initialized';
        if (pubKeyEl) pubKeyEl.textContent = 'Create a wallet first';
    }

    // Setup sign-in event listeners
    setupSignInEventListeners();
}

/**
 * Get pending sign-in request from session storage
 */
async function getPendingSignInRequest() {
    return new Promise((resolve) => {
        chrome.storage.session.get(['pending_signin_request'], (result) => {
            resolve(result.pending_signin_request || null);
        });
    });
}

/**
 * Clear pending sign-in request
 */
async function clearPendingSignInRequest() {
    return new Promise((resolve) => {
        chrome.storage.session.remove(['pending_signin_request'], resolve);
    });
}

/**
 * Setup event listeners for wallet view
 */
function setupWalletEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // Wallet buttons
    const copyBtn = document.getElementById('copyBtn');
    const copyPubKeyBtn = document.getElementById('copyPublicKeyBtn');
    const createWalletBtn = document.getElementById('createWalletBtn');

    if (copyBtn) copyBtn.addEventListener('click', copyAddress);
    if (copyPubKeyBtn) copyPubKeyBtn.addEventListener('click', copyPublicKey);
    if (createWalletBtn) createWalletBtn.addEventListener('click', createNewWallet);
}

/**
 * Setup event listeners for sign-in view
 */
function setupSignInEventListeners() {
    const approveBtn = document.getElementById('approveSignInBtn');
    const denyBtn = document.getElementById('denySignInBtn');

    if (approveBtn) approveBtn.addEventListener('click', approveSignIn);
    if (denyBtn) denyBtn.addEventListener('click', denySignIn);
}

/**
 * Approve sign-in request
 */
async function approveSignIn() {
    if (!walletManager.wallet) {
        alert('Wallet not initialized');
        return;
    }

    try {
        const approveBtn = document.getElementById('approveSignInBtn');
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.textContent = 'Signing...';
        }

        // Get authentication data (signs the message)
        const authData = await walletManager.getAuthData(pendingSignInRequest.challenge);

        // Send response back to BACKGROUND (not directly to tab - popup can't do that)
        // Background will relay it to the content script
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'WALLET_SIGNIN_RESPONSE',
                tabId: pendingSignInRequest.tabId,
                id: pendingSignInRequest.id,
                success: true,
                data: authData
            });
            console.log('Sign-in response sent to background:', response);
        } catch (error) {
            console.error('Failed to send sign-in response to background:', error);
        }

        // Clear pending request
        await clearPendingSignInRequest();

        // Close popup
        window.close();
    } catch (error) {
        alert('Error signing message: ' + error.message);
        const approveBtn = document.getElementById('approveSignInBtn');
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.textContent = '✓ Sign In';
        }
    }
}

/**
 * Deny sign-in request
 */
async function denySignIn() {
    try {
        // Send error response back to content script via tabs.sendMessage (Manifest V3 Promise)
        try {
            const response = await chrome.tabs.sendMessage(pendingSignInRequest.tabId, {
                type: 'WALLET_SIGNIN_RESPONSE',
                id: pendingSignInRequest.id,
                success: false,
                error: 'User denied sign-in request'
            });
            console.log('Denial response sent successfully');
        } catch (error) {
            console.error('Failed to send denial response:', error);
        }

        // Clear pending request
        await clearPendingSignInRequest();

        // Close popup
        window.close();
    } catch (error) {
        console.error('Error denying sign-in:', error);
        window.close();
    }
}

/**
 * Update wallet UI
 */
async function updateUI() {
    const addressEl = document.getElementById('walletAddress');
    const statusEl = document.getElementById('status');
    const keyStatusEl = document.getElementById('keyStatus');
    const nodeUrlInput = document.getElementById('nodeUrl');

    if (walletManager.wallet) {
        if (addressEl) addressEl.textContent = walletManager.getAddress();
        if (statusEl) statusEl.textContent = 'Initialized ✓';
        if (keyStatusEl) keyStatusEl.classList.remove('hidden');
        if (nodeUrlInput && txHandler) nodeUrlInput.value = txHandler.nodeUrl;
    } else {
        if (addressEl) addressEl.textContent = 'Not initialized - Create a wallet';
        if (statusEl) statusEl.textContent = 'Uninitialized';
        if (keyStatusEl) keyStatusEl.classList.add('hidden');
    }

    updateTransactionHistory();
}

/**
 * Switch tabs
 */
function switchTab(e) {
    const tabName = e.target.dataset.tab;
    
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const tabEl = document.getElementById(tabName);
    if (tabEl) {
        tabEl.classList.add('active');
        e.target.classList.add('active');
    }
}

/**
 * Copy address to clipboard
 */
async function copyAddress() {
    const address = walletManager.getAddress();
    if (!address || address === 'Not initialized - Create a wallet') {
        alert('Wallet not initialized');
        return;
    }

    try {
        await navigator.clipboard.writeText(address);
        const btn = document.getElementById('copyBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    } catch (err) {
        alert('Failed to copy address');
    }
}

/**
 * Copy public key to clipboard
 */
async function copyPublicKey() {
    const publicKey = walletManager.getPublicKey();
    if (!publicKey || publicKey === 'Not initialized') {
        alert('Wallet not initialized');
        return;
    }

    try {
        await navigator.clipboard.writeText(publicKey);
        const btn = document.getElementById('copyPublicKeyBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    } catch (err) {
        alert('Failed to copy public key');
    }
}

/**
 * Create new wallet
 */
async function createNewWallet() {
    if (walletManager.wallet && !confirm('You already have a wallet. Create a new one? (Old wallet will be lost)')) {
        return;
    }

    try {
        const btn = document.getElementById('createWalletBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Generating...';
        }
        
        await walletManager.generateWallet();
        await updateUI();
        
        alert('✓ Wallet created successfully!');
    } catch (error) {
        alert('Error creating wallet: ' + error.message);
    } finally {
        const btn = document.getElementById('createWalletBtn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Create New Wallet';
        }
    }
}

    /**
     * Generate new RSA wallet
     */
    async function generateWallet() {
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
    async function  saveWallet() {
        if (!this.wallet) return;
        
        return new Promise((resolve) => {
            chrome.storage.local.set({ 'blockchain_wallet': this.wallet }, resolve);
        });
    }

    /**
     * Load wallet from Chrome storage
     */
    async function loadWallet() {
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
    async function getAddress() {
        return this.wallet ? this.wallet.address : null;
    }

    /**
     * Get public key
     */
    async function getPublicKey() {
        return this.wallet ? this.wallet.publicKey : null;
    }

    /**
     * Get private key
     */
    async function getPrivateKey() {
        return this.wallet ? this.wallet.privateKey : null;
    }

    /**
     * Sign transaction
     */
    async function signTransaction(txData) {
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
    async function exportPrivateKey() {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }
        return this.wallet.privateKey;
    }

    /**
     * Import private key
     */
    async function  importPrivateKey(privateKey) {
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
    async function  resetWallet() {
        return new Promise((resolve) => {
            chrome.storage.local.remove('blockchain_wallet', () => {
                this.wallet = null;
                resolve();
            });
        });
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
            timestamp: Math.floor(Date.now() / 1000)
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
let txHandler;

// Initialize when popup opens

// =====================
// UI UPDATES
// =====================

async function updateUI() {
    const addressEl = document.getElementById('walletAddress');
    const pubKeyEl = document.getElementById('walletPublicKey');

    if (walletManager.wallet) {
        if (addressEl) addressEl.textContent = walletManager.getAddress();
        if (pubKeyEl) pubKeyEl.textContent = walletManager.getPublicKey();
    } else {
        if (addressEl) addressEl.textContent = 'Not initialized - Create a wallet';
        if (pubKeyEl) pubKeyEl.textContent = 'Not initialized';
    }

    updateTransactionHistory();
}

function updateTransactionHistory() {
    const historyDiv = document.getElementById('txHistory');
    if (!historyDiv) return; 
    
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

    // Wallet buttons - only ones that exist in HTML
    const copyBtn = document.getElementById('copyBtn');
    const copyPubKeyBtn = document.getElementById('copyPublicKeyBtn');
    const createWalletBtn = document.getElementById('createWalletBtn');

    if (copyBtn) copyBtn.addEventListener('click', copyAddress);
    if (copyPubKeyBtn) copyPubKeyBtn.addEventListener('click', copyPublicKey);
    if (createWalletBtn) createWalletBtn.addEventListener('click', createNewWallet);
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
