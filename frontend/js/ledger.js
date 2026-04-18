const Ledger = {
    NODE_URL: "http://127.0.0.1:5000",
    chain: [],
    
    async init() {
        App.init();
        const sidebar = document.getElementById('sidebar');
        const navbar = document.getElementById('navbar');
        if (sidebar) sidebar.innerHTML = getSidebarHTML('ledger');
        if (navbar) navbar.innerHTML = getNavbarHTML();
        
        await this.loadChainData();
        this.renderTable();
    },
    
    async loadChainData() {
        try {
            const response = await fetch(`${this.NODE_URL}/chain`);
            this.chain = await response.json();
            console.log('Loaded chain data:', this.chain);
        } catch (e) {
            console.error('Failed to load chain data:', e);
        }
    },
    
    renderTable() {
        const tbody = document.getElementById('ledgerBody');
        if (!tbody) return;

        // Get only the 2 most recent blocks
        const blocks = this.chain.slice(0, 2).reverse();
        
        let rowCount = 0;
        tbody.innerHTML = blocks.map((block) => {
            return block.transactions.map((tx) => {
                rowCount++;
                const timestamp = new Date(tx.timestamp * 1000).toLocaleString();
                const senderShort = tx.sender ? tx.sender.slice(0, 6) + '...' + tx.sender.slice(-4) : 'SYSTEM';
                const receiverShort = tx.receiver ? tx.receiver.slice(0, 6) + '...' + tx.receiver.slice(-4) : 'N/A';
                
                return `
                    <tr style="animation: fadeIn 0.3s ease ${rowCount * 0.05}s backwards">
                        <td><span class="tx-id-cell" title="${tx.sender}">${senderShort}</span></td>
                        <td><span class="timestamp-cell">${timestamp}</span></td>
                        <td>
                            <div class="originator-cell">
                                <div class="originator-icon blue">⬡</div>
                                ${receiverShort}
                            </div>
                        </td>
                        <td class="amount-cell">${(tx.amount || 0).toLocaleString()} KLT</td>
                        <td class="status-cell">
                            <span class="status-badge verified">VERIFIED</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }).join('');

        const info = document.getElementById('paginationInfo');
        if (info) {
            info.textContent = `Showing 2 most recent blocks from blockchain`;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Ledger.init();
});


// Keep old functions for backwards compatibility with HTML
function initSearch() {}
function initFilter() {}
function initPagination() {}
function updatePaginationBtns() {}
