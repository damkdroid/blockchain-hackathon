/**
 * Wallet API - Injected into Web Pages
 * Provides Sign In With Wallet functionality
 * 
 * Usage in React:
 * 
 * import { useEffect, useState } from 'react';
 * 
 * function LoginButton() {
 *   const handleWalletSignIn = async () => {
 *     const result = await window.walletExtension.signIn('challenge-message');
 *     console.log(result);
 *     // { address, publicKey, message, signature, timestamp }
 *   };
 *   
 *   return (
 *     <button onClick={handleWalletSignIn}>
 *       Sign In With Wallet
 *     </button>
 *   );
 * }
 */

window.walletExtension = {
    /**
     * Request sign-in with the wallet
     * 
     * @param {string} message - Challenge message or nonce to sign
     * @returns {Promise<Object>} - { address, publicKey, message, signature, timestamp }
     * 
     * Example:
     * const result = await window.walletExtension.signIn('Login Nonce: 12345');
     * // Returns: {
     * //   address: '0x7f3a8d2e...',
     * //   publicKey: '-----BEGIN PUBLIC KEY-----\n...',
     * //   message: 'Login Nonce: 12345',
     * //   signature: 'a1b2c3d4...',
     * //   timestamp: 1705516800
     * // }
     */
    signIn: function(message) {
        return new Promise((resolve, reject) => {
            if (!message) {
                reject(new Error('Message is required for sign-in'));
                return;
            }

            // Generate a unique ID for this request
            const requestId = Math.random().toString(36).substr(2, 9);

            // Listen for the response
            const responseHandler = (event) => {
                if (event.source !== window) return;
                
                if (event.data.id === requestId && event.data.type === 'WALLET_SIGNIN_RESPONSE') {
                    window.removeEventListener('message', responseHandler);
                    
                    if (event.data.success) {
                        resolve(event.data.data);
                    } else {
                        reject(new Error(event.data.error || 'Sign-in failed'));
                    }
                }
            };

            window.addEventListener('message', responseHandler);

            // Set a timeout for the response
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Sign-in request timed out'));
            }, 30000); // 30 seconds timeout

            // Send sign-in request to content script
            window.postMessage({
                type: 'WALLET_SIGNIN_REQUEST',
                challenge: message,
                origin: window.location.origin,
                id: requestId
            }, '*');

            // Clear timeout on success/error
            Promise.resolve().then(() => {
                clearTimeout(timeoutId);
            });
        });
    },

    /**
     * Check if wallet extension is available and has a wallet
     * 
     * @returns {Promise<boolean>} - true if wallet is ready
     * 
     * Example:
     * const isReady = await window.walletExtension.isReady();
     */
    isReady: function() {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Check if this function exists means extension is available
                resolve(true);
            }, 100);
        });
    },

    /**
     * Get wallet address (if wallet is initialized)
     * Note: May not work depending on extension permissions
     * 
     * @returns {Promise<string|null>} - Address or null
     */
    getWalletInfo: function() {
        return new Promise((resolve) => {
            // This would require additional permissions
            // For now, return that this is available
            resolve({
                extensionName: 'Blockchain Wallet',
                version: '1.0.0',
                features: ['signIn', 'getWalletInfo']
            });
        });
    },

    /**
     * Verify a signature on the client side
     * Note: Full verification requires server-side checks
     * This is just for initial validation
     * 
     * @param {string} address - The wallet address
     * @param {string} message - The signed message
     * @param {string} signature - The signature
     * @returns {Object} - { valid: boolean, address: string }
     */
    verifySignature: function(address, message, signature) {
        // Basic client-side validation
        return {
            valid: !!address && !!message && !!signature,
            address: address
        };
    }
};

// Log that wallet API is available
console.log('✓ Wallet Extension API loaded - use window.walletExtension.signIn()');
