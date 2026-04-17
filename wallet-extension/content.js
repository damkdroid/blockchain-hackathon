/**
 * Content Script
 * Runs on web pages and enables "Sign In With Wallet" functionality
 * Injects a global object that websites can use
 */

// Inject wallet API into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('wallet-api.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', (event) => {
    // Only accept messages from our own page
    if (event.source !== window) return;

    if (event.data.type && event.data.type.startsWith('WALLET_')) {
        // Relay wallet requests to background script
        chrome.runtime.sendMessage(event.data, (response) => {
            // Send response back to page
            // window.postMessage({
            //    type: event.data.type + '_RESPONSE', 
            //     response: response,
            //     id: event.data.id
            // }, '*');
        });
    }
});

// Listen for responses from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'WALLET_SIGNIN_RESPONSE') {
        // Relay response back to the page script
        window.postMessage({
            type: 'WALLET_SIGNIN_RESPONSE',
            id: request.id, 
            success: request.success,
            data: request.data,
            error: request.error
        }, '*');
    }
});
