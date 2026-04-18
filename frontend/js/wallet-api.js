// Wallet API Helper
const WalletAPI = {
    // Check if wallet extension is available
    async isWalletAvailable() {
        // Check multiple times as extension may load after page
        for (let i = 0; i < 5; i++) {
            if (window.walletExtension !== undefined) {
                console.log('Wallet extension detected');
                return true;
            }
            // Wait 500ms and retry
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('Wallet extension not detected after retries');
        return false;
    },

    // Get wallet status
    async getStatus() {
        try {
            if (!window.walletExtension) {
                console.warn('walletExtension not available');
                return { ready: false };
            }
            
            // Try to get status from extension
            const status = await window.walletExtension.getStatus?.();
            console.log('Wallet status:', status);
            return status || { ready: true }; // If extension exists, assume ready
        } catch (e) {
            console.error('Error getting wallet status:', e);
            return { ready: false };
        }
    },

    // Sign in with wallet
    async signIn() {
        return new Promise((resolve, reject) => {
            try {
                if (!window.walletExtension) {
                    reject(new Error('Wallet extension not available'));
                    return;
                }

                const messageId = Date.now();
                const challenge = `Sign in to Blockchain App\nTimestamp: ${Date.now()}`;

                // Use the injected wallet extension API
                window.walletExtension.signIn(challenge)
                    .then(result => {
                        resolve({
                            address: result.address,
                            publicKey: result.publicKey,
                            signature: result.signature
                        });
                    })
                    .catch(err => {
                        reject(new Error(err.message || 'Wallet signing failed'));
                    });
            } catch (e) {
                reject(e);
            }
        });
    },

    // Demo account for testing
    getDemoAccount() {
        return {
            address: '0x' + '7f'.repeat(20), // Dummy address
            publicKey: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${('00').repeat(32)}
-----END PUBLIC KEY-----`,
            isDemoAccount: true
        };
    },

    // Store session
    storeSession(address, publicKey) {
        localStorage.setItem('walletAddress', address);
        localStorage.setItem('publicKey', publicKey);
        localStorage.setItem('loginTime', Date.now().toString());
    },

    // Get stored session
    getSession() {
        const address = localStorage.getItem('walletAddress');
        const publicKey = localStorage.getItem('publicKey');
        if (address && publicKey) {
            return { address, publicKey };
        }
        return null;
    },

    // Clear session
    clearSession() {
        localStorage.removeItem('walletAddress');
        localStorage.removeItem('publicKey');
        localStorage.removeItem('loginTime');
    },

    // Check if user is logged in
    isLoggedIn() {
        return this.getSession() !== null;
    }
};

// Export for use in other scripts
window.WalletAPI = WalletAPI;
