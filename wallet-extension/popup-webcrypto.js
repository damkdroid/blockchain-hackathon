// =====================
// WALLET MANAGEMENT (Using Web Crypto API)
// =====================

class WalletManager {
    constructor() {
        this.wallet = null;
        this.loadWallet();
    }

    /**
     * Generate new ECDSA wallet using Web Crypto API
     */
    async generateWallet() {
        try {
            // Generate ECDSA P-256 key pair (more efficient than RSA)
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true, // extractable
                ["sign", "verify"]
            );

            // Export keys
            const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
            const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
            
            // Export public key to PEM format
            const publicKeyPem = await this._publicKeyToPem(keyPair.publicKey);

            // Create address from public key
            const publicKeyStr = JSON.stringify(publicKeyJwk);
            const publicKeyHex = this._publicKeyJwkToHex(publicKeyStr);
            const address = await this._hash(publicKeyStr);

            this.wallet = {
                publicKeyJwk: publicKeyStr,
                publicKeyHex: publicKeyHex,
                publicKeyPem: publicKeyPem,
                privateKey: JSON.stringify(privateKeyJwk),
                address: address,
                createdAt: new Date().toISOString()
            };

            await this.saveWallet();
            return this.wallet;
        } catch (error) {
            throw new Error('Failed to generate wallet: ' + error.message);
        }
    }

    /**
     * Hash function using SubtleCrypto
     */
    async _hash(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return '0x' + hashHex.substring(0, 40); // Short address
    }

    /**
     * Convert JWK public key to readable hex format (uncompressed)
     */
    _publicKeyJwkToHex(jwkStr) {
        try {
            const jwk = JSON.parse(jwkStr);
            // Decode base64url to hex
            const xHex = this._base64urlToHex(jwk.x);
            const yHex = this._base64urlToHex(jwk.y);
            // Return uncompressed format: 04 + x + y
            return '04' + xHex + yHex;
        } catch (e) {
            return 'Invalid Public Key';
        }
    }

    /**
     * Convert base64url to hex
     */
    _base64urlToHex(str) {
        const padding = '='.repeat((4 - str.length % 4) % 4);
        const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
        const bytes = atob(base64);
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += bytes.charCodeAt(i).toString(16).padStart(2, '0');
        }
        return hex;
    }

    /**
     * Export public key to PEM format
     */
    async _publicKeyToPem(publicKeyObj) {
        try {
            if (!publicKeyObj) return null;
            
            // Export as SPKI (SubjectPublicKeyInfo) binary format
            const spkiBuffer = await window.crypto.subtle.exportKey("spki", publicKeyObj);
            
            // Convert to base64
            const spkiArray = new Uint8Array(spkiBuffer);
            let binaryStr = '';
            for (let i = 0; i < spkiArray.byteLength; i++) {
                binaryStr += String.fromCharCode(spkiArray[i]);
            }
            const base64 = btoa(binaryStr);
            
            // Wrap with PEM headers and format
            const pem = '-----BEGIN PUBLIC KEY-----\n' +
                       base64.replace(/(.{64})/g, '$1\n') +
                       '\n-----END PUBLIC KEY-----';
            
            return pem;
        } catch (e) {
            console.error('PEM conversion error:', e);
            return null;
        }
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
        return new Promise(async (resolve) => {
            chrome.storage.local.get(['blockchain_wallet'], async (result) => {
                if (result.blockchain_wallet) {
                    this.wallet = result.blockchain_wallet;
                    
                    // Convert old wallet format to new format
                    let needsSave = false;
                    
                    if (this.wallet.publicKey && !this.wallet.publicKeyJwk) {
                        // Old format: publicKey contains the JWK
                        this.wallet.publicKeyJwk = this.wallet.publicKey;
                        needsSave = true;
                    }
                    
                    // Ensure hex format exists
                    if (!this.wallet.publicKeyHex && this.wallet.publicKeyJwk) {
                        this.wallet.publicKeyHex = this._publicKeyJwkToHex(this.wallet.publicKeyJwk);
                        needsSave = true;
                    }
                    
                    // Generate PEM format if missing
                    if (!this.wallet.publicKeyPem && this.wallet.publicKeyJwk) {
                        try {
                            const jwk = JSON.parse(this.wallet.publicKeyJwk);
                            const importedKey = await window.crypto.subtle.importKey(
                                "jwk",
                                jwk,
                                { name: "ECDSA", namedCurve: "P-256" },
                                true,
                                ["verify"]
                            );
                            this.wallet.publicKeyPem = await this._publicKeyToPem(importedKey);
                            needsSave = true;
                        } catch (e) {
                            console.error('PEM generation error:', e);
                        }
                    }
                    
                    if (needsSave) {
                        await this.saveWallet();
                    }
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
     * Get public key (PEM format - standard format)
     */
    getPublicKey() {
        if (!this.wallet) return null;
        
        // Return PEM format if available, fallback to hex then JWK
        if (this.wallet.publicKeyPem) {
            return this.wallet.publicKeyPem;
        } else if (this.wallet.publicKeyHex) {
            return this.wallet.publicKeyHex;
        } else if (this.wallet.publicKeyJwk) {
            return this._publicKeyJwkToHex(this.wallet.publicKeyJwk);
        } else if (this.wallet.publicKey) {
            // Old format
            return this._publicKeyJwkToHex(this.wallet.publicKey);
        }
        return null;
    }

    /**
     * Get public key JWK (for internal use)
     */
    getPublicKeyJwk() {
        return this.wallet ? this.wallet.publicKeyJwk : null;
    }

    /**
     * Get private key
     */
    getPrivateKey() {
        return this.wallet ? this.wallet.privateKey : null;
    }
}

// =====================
// GLOBAL INSTANCES
// =====================

let walletManager;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        walletManager = new WalletManager();

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
        document.getElementById('walletPublicKey').textContent = walletManager.getPublicKey();
    } else {
        document.getElementById('walletAddress').textContent = 'Not initialized - Create a wallet';
        document.getElementById('walletPublicKey').textContent = 'Not initialized';
    }
}

// =====================
// EVENT LISTENERS
// =====================

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // Wallet buttons
    document.getElementById('copyBtn').addEventListener('click', copyAddress);
    document.getElementById('copyPublicKeyBtn').addEventListener('click', copyPublicKey);
    document.getElementById('createWalletBtn').addEventListener('click', createNewWallet);
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
    if (!address || address === 'Not initialized - Create a wallet') {
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

async function copyPublicKey() {
    const publicKey = walletManager.getPublicKey();
    if (!publicKey || publicKey === 'Not initialized') {
        alert('Wallet not initialized');
        return;
    }

    try {
        await navigator.clipboard.writeText(publicKey);
        const btn = document.getElementById('copyPublicKeyBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    } catch (err) {
        alert('Failed to copy public key');
    }
}
