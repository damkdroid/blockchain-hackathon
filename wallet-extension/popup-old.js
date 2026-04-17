/**
 * Popup Script - popup.js
 * Handles both normal wallet view and sign-in request view
 */

let walletManager;
let pendingSignInRequest = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        walletManager = new WalletManager();
        await walletManager.loadWallet();

        // Check if we're in sign-in mode
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');

        if (mode === 'signin') {
            await initSignInView();
        } else {
            await initWalletView();
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

        // Send response back to content script
        chrome.runtime.sendMessage({
            type: 'WALLET_SIGNIN_RESPONSE',
            tabId: pendingSignInRequest.tabId,
            success: true,
            data: authData
        });

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
        // Send error response back to content script
        chrome.runtime.sendMessage({
            type: 'WALLET_SIGNIN_RESPONSE',
            tabId: pendingSignInRequest.tabId,
            success: false,
            error: 'User denied sign-in request'
        });

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
    const pubKeyEl = document.getElementById('walletPublicKey');

    if (walletManager.wallet) {
        if (addressEl) addressEl.textContent = walletManager.getAddress();
        if (pubKeyEl) pubKeyEl.textContent = walletManager.getPublicKey();
    } else {
        if (addressEl) addressEl.textContent = 'Not initialized - Create a wallet';
        if (pubKeyEl) pubKeyEl.textContent = 'Not initialized';
    }
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
