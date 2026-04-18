// Login Page Logic
const LoginPage = {
    elements: {},
    isLoading: false,

    init() {
        // Check if already logged in
        if (WalletAPI.isLoggedIn()) {
            window.location.href = './dashboard.html';
            return;
        }

        this.cacheElements();
        this.attachEventListeners();
        this.checkWallet();
    },

    cacheElements() {
        this.walletStatus = document.getElementById('walletStatus');
        this.loginMethods = document.getElementById('loginMethods');
        this.btnWalletConnect = document.getElementById('btnWalletConnect');
        this.errorMessage = document.getElementById('errorMessage');
        this.loadingState = document.getElementById('loadingState');
        this.loadingText = document.getElementById('loadingText');
        this.successState = document.getElementById('successState');
    },

    attachEventListeners() {
        this.btnWalletConnect.addEventListener('click', () => this.handleWalletLogin());
        
        // Listen for wallet messages
        window.addEventListener('message', (event) => {
            if (event.data.type === 'WALLET_SIGNIN_RESPONSE') {
                this.handleWalletResponse(event.data);
            }
        });
    },

    async checkWallet() {
        try {
            console.log('Checking wallet availability...');
            const isAvailable = await WalletAPI.isWalletAvailable();
            console.log('Wallet available:', isAvailable);

            if (isAvailable) {
                const status = await WalletAPI.getStatus();
                console.log('Wallet status:', status);
                if (status.ready || isAvailable) {
                    this.setWalletReady(true);
                } else {
                    this.setWalletReady(false);
                }
            } else {
                this.setWalletReady(false);
            }
        } catch (e) {
            console.error('Wallet check failed:', e);
            this.setWalletReady(false);
        }
    },

    setWalletReady(ready) {
        if (ready) {
            this.walletStatus.innerHTML = `
                <div class="status-ready">
                    <i class="fas fa-check-circle"></i>
                    <span>Wallet extension detected and ready</span>
                </div>
            `;
            this.btnWalletConnect.disabled = false;
        } else {
        }

        this.walletStatus.style.display = 'block';
        this.loginMethods.style.display = 'flex';
    },

    async handleWalletLogin() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading('Connecting to wallet...');

        try {
            console.log('Attempting wallet login...');
            
            if (!window.walletExtension) {
                throw new Error('Wallet extension is not available');
            }

            const walletData = await WalletAPI.signIn();

            // Store session
            WalletAPI.storeSession(walletData.address, walletData.publicKey);

            this.showSuccess();
            setTimeout(() => {
                window.location.href = './dashboard.html';
            }, 1500);
        } catch (e) {
            console.error('Wallet login error:', e);
            this.showError(e.message || 'Wallet connection failed. Make sure the wallet extension is installed and running.');
            this.isLoading = false;
        }
    },

    handleWalletResponse(data) {
        if (data.success) {
            WalletAPI.storeSession(data.address, data.publicKey);
            this.showSuccess();
            setTimeout(() => {
                window.location.href = './dashboard.html';
            }, 1500);
        } else {
            this.showError(data.error || 'Wallet signing failed');
            this.isLoading = false;
        }
    },

    showLoading(text) {
        this.loginMethods.style.display = 'none';
        this.errorMessage.style.display = 'none';
        this.successState.style.display = 'none';
        this.loadingText.textContent = text;
        this.loadingState.style.display = 'flex';
    },

    showSuccess() {
        this.loadingState.style.display = 'none';
        this.successState.style.display = 'flex';
    },

    showError(message) {
        this.loadingState.style.display = 'none';
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.loginMethods.style.display = 'flex';
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    LoginPage.init();
});
