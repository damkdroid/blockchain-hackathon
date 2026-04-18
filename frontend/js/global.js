const App = {
    currentPage: '',

    init() {
        this.detectCurrentPage();
        this.initSidebar();
        this.initNavbar();
        this.initToastContainer();
    },

    detectCurrentPage() {
        const path = window.location.pathname;
        const file = path.split('/').pop().replace('.html', '') || 'index';
        const map = {
            'index': 'landing',
            'dashboard': 'dashboard',
            'ledger': 'ledger',
            'company-manager': 'company-manager',
            'audit': 'audit',
            'network': 'network'
        };
        this.currentPage = map[file] || 'dashboard';
    },

    initSidebar() {
        const navItems = document.querySelectorAll('.nav-item[data-page]');
        navItems.forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === this.currentPage) {
                item.classList.add('active');
            }
            item.addEventListener('click', () => {
                const href = item.getAttribute('data-href');
                if (href) window.location.href = href;
            });
        });


    },

    getPagePath(page) {
        const currentPath = window.location.pathname;
        const inPages = currentPath.includes('/pages/');
        if (page === 'landing') return inPages ? '../index.html' : 'index.html';
        return inPages ? `${page}.html` : `pages/${page}.html`;
    },

    initNavbar() {
        const searchInput = document.querySelector('.navbar-search input');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    App.showToast('Search initiated for: ' + searchInput.value, 'info');
                    searchInput.value = '';
                }
            });
        }
    },

    initToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    },

    showToast(message, type = 'info', duration = 3500) {
        const container = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
            <div class="toast-icon" style="color: ${type === 'success' ? 'var(--accent-green)' : type === 'error' ? 'var(--accent-red)' : 'var(--accent)'}">${icons[type] || icons.info}</div>
            <span class="toast-message">${message}</span>
            <div class="toast-close" onclick="this.parentElement.classList.add('toast-exit'); setTimeout(() => this.parentElement.remove(), 300)">✕</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },



    logout() {
        if (window.WalletAPI) WalletAPI.clearSession();
        const isInPages = window.location.pathname.includes('/pages/');
        window.location.href = isInPages ? './login.html' : 'pages/login.html';
    },

    simulateApiCall(duration = 1500) {
        return new Promise(resolve => setTimeout(resolve, duration));
    },

    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num);
    },

    formatCurrency(num, currency = 'KLT') {
        return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency}`;
    },

    generateTxId() {
        const chars = '0123456789abcdef';
        let id = '0x';
        for (let i = 0; i < 40; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    },

    truncateHash(hash, start = 6, end = 4) {
        if (hash.length <= start + end) return hash;
        return `${hash.slice(0, start)}...${hash.slice(-end)}`;
    },

    logout() {
        if (WalletAPI) {
            WalletAPI.clearSession();
            this.showToast('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1000);
        }
    }
};

function getSidebarHTML(activePage) {
    const pages = [
        { id: 'dashboard', label: 'Dashboard', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
        { id: 'company-manager', label: 'Company Manager', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
        { id: 'audit', label: 'Audit Trail', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
        { id: 'network', label: 'Network', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/></svg>' }
    ];

    const isInPages = window.location.pathname.includes('/pages/');
    const getHref = (id) => {
        return isInPages ? `${id}.html` : `pages/${id}.html`;
    };

    let navHTML = pages.map(p => `
        <a href="${getHref(p.id)}" class="nav-item ${p.id === activePage ? 'active' : ''}" data-page="${p.id}">
            <span class="nav-icon">${p.icon}</span>
            ${p.label}
        </a>
    `).join('');

    return `
        <div class="sidebar-header">
            <div class="sidebar-vault-info">
                <h2 style="font-family: Poppins; color: gold; margin-left:20px">Sidebar</h2>
            </div>
        </div>
        <nav class="sidebar-nav">
            ${navHTML}
        </nav>
        <div class="sidebar-bottom">
            <a href="${isInPages ? 'dashboard.html' : 'pages/dashboard.html'}" class="btn-new-tx">+ New Transaction</a>
        </div>
    
    `;
} function getNavbarHTML(searchPlaceholder = 'Search hash, node...') {
    const isInPages = window.location.pathname.includes('/pages/');
    const brandLink = isInPages ? '../index.html' : 'index.html';

    return `
        <a href="${brandLink}" class="navbar-brand">                 <i class="fa-solid fa-building-columns fa-lg"></i>
The Kinetic Ledger</a>
    `;
}

document.addEventListener('DOMContentLoaded', () => App.init());