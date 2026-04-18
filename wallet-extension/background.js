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

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.type || request.action);

    if (request.action === 'getWalletStatus') {
        chrome.storage.local.get(['blockchain_wallet'], (result) => {
            sendResponse({
                hasWallet: !!result.blockchain_wallet
            });
        });
        return true; // Will respond asynchronously
    }
    else if (request.type === 'WALLET_SIGNIN') {
        // User clicked sign-in button on website
        // Open popup for user to confirm
        handleSignInRequest(request, sender, sendResponse);
        return true;
    }
    else if (request.type === 'WALLET_SIGNIN_RESPONSE') {
        // Response from popup after user confirmed/denied
        // Relay back to content script (using Promise for Manifest V3)
        console.log('Relaying WALLET_SIGNIN_RESPONSE to tabId:', request.tabId, 'type:', typeof request.tabId);
        
        const tabId = parseInt(request.tabId, 10);
        if (!tabId || isNaN(tabId)) {
            console.error('Invalid tabId for relay:', request.tabId);
            sendResponse({ error: 'Invalid tabId' });
            return false;
        }
        
        chrome.tabs.sendMessage(tabId, {
            type: 'WALLET_SIGNIN_RESPONSE',
            id: request.id,
            success: request.success,
            data: request.data,
            error: request.error
        }).then((response) => {
            console.log('Response relayed successfully to tab:', tabId);
        }).catch((error) => {
            console.error('Failed to relay response to tab', tabId, ':', error);
        });
        sendResponse({ received: true });
        return false;
    }

    return true;
});

/**
 * Handle sign-in request from content script
 */
function handleSignInRequest(request, sender, sendResponse) {
    // Store the request data in session storage
    const signinData = {
        tabId: sender.tab.id,
        url: sender.url,
        challenge: request.challenge,
        timestamp: Date.now(),
        origin: request.origin || new URL(sender.url).origin,
        id: request.id
    };

    chrome.storage.session.set({ 'pending_signin_request': signinData }, () => {
        // Open popup window for user confirmation
        const width = 500;
        const height = 650;
        
        chrome.windows.getCurrent((currentWindow) => {
            const left = currentWindow.left + (currentWindow.width - width) / 2;
            const top = currentWindow.top + (currentWindow.height - height) / 2;

            chrome.windows.create({
                url: chrome.runtime.getURL('popup.html?mode=signin'),
                type: 'popup',
                width: width,
                height: height,
                left: left,
                top: top
            });
        });

        sendResponse({ 
            success: true, 
            message: 'Sign-in popup opened' 
        });
    });
}

// Optional: Add any background tasks here
// For example, periodic balance checks, etc.
