/**
 * Background Service Worker
 * Handles background tasks and message passing
 */

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Blockchain Wallet Extension installed');
    
    // Initialize default storage values
    chrome.storage.local.get(['blockchain_wallet'], (result) => {
        if (!result.blockchain_wallet) {
            console.log('No wallet found. User will need to create one.');
        }
    });
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getWalletStatus') {
        chrome.storage.local.get(['blockchain_wallet'], (result) => {
            sendResponse({
                hasWallet: !!result.blockchain_wallet
            });
        });
        return true; // Will respond asynchronously
    }
});

// Optional: Add any background tasks here
// For example, periodic balance checks, etc.
