const Audit = {
    NODE_URL: "http://127.0.0.1:5000",
    chain: [],

    async init() {
        App.init();
        const sidebar = document.getElementById('sidebar');
        const navbar = document.getElementById('navbar');
        if (sidebar) sidebar.innerHTML = getSidebarHTML('audit');
        if (navbar) navbar.innerHTML = getNavbarHTML();

        await this.loadChainData();
        this.renderTimeline();
    },

    async loadChainData() {
        try {
            const response = await fetch(`${this.NODE_URL}/chain`);
            this.chain = await response.json();
            console.log('Loaded chain for audit trail:', this.chain);
        } catch (e) {
            console.error('Failed to load chain data:', e);
        }
    },

    renderTimeline() {
        const container = document.getElementById('auditTimeline');
        if (!container) return;

        container.innerHTML = '';

        // Show last 10 blocks in timeline (forensic view)
        const blocks = [...this.chain].slice(-10).reverse();

        blocks.forEach((block, blockIdx) => {
            // For each transaction in block, create timeline item
            block.transactions.forEach((tx, txIdx) => {
                const el = document.createElement('div');
                el.className = 'timeline-item';

                const timestamp = new Date(tx.timestamp * 1000).toLocaleString();
                const sender = tx.sender || 'SYSTEM';
                const senderShort = sender.slice(0, 6) + '...' + sender.slice(-4);
                const receiver = tx.receiver || 'N/A';
                const receiverShort = receiver.slice(0, 6) + '...' + receiver.slice(-4);

                let color = 'var(--accent)';
                if (txIdx % 3 === 1) color = 'var(--accent-green)';
                else if (txIdx % 3 === 2) color = 'var(--accent-purple)';

                const actualBlockIndex = this.chain.length - 1 - blockIdx;
                const title = `Block #${actualBlockIndex}`;
                const body = `
From: ${senderShort}
To: ${receiverShort}
Amount: ${(tx.amount || 0).toLocaleString()} KLT
Block: ${block.hash.slice(0, 8)}...`;

                el.innerHTML = `
                    <div class="marker" style="background:${color}; border-color: var(--bg-primary)"></div>
                    <div class="timeline-card">
                        <div class="timeline-meta">${timestamp}</div>
                        <h3 style="margin:0 0 8px 0">${title}</h3>
                        <pre style="white-space:pre-wrap;color:var(--text-secondary);margin:0">${body}</pre>
                    </div>
                `;
                container.appendChild(el);
            });
        });
    }
};

window.addEventListener('DOMContentLoaded', () => {
    Audit.init();
});
