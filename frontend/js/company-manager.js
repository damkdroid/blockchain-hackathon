// Company Manager Module
const CompanyManager = {
    NODE_URL: "http://127.0.0.1:5000",
    selectedCompany: null,
    companies: [],
    pendingApprovals: [],
    approvalThreshold: 0,
    approvalRoles: [],
    isLoading: false,

    init() {
        // Check if user is logged in
        if (!WalletAPI || !WalletAPI.isLoggedIn()) {
            window.location.href = './login.html';
            return;
        }

        this.cacheElements();
        this.attachEventListeners();
        this.fetchCompanies();
        setInterval(() => this.fetchCompanies(), 10000);
        setInterval(() => this.fetchPendingApprovals(), 5000);
    },

    cacheElements() {
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabPanes = document.querySelectorAll('.tab-pane');
        this.inputCompanyName = document.getElementById('companyName');
        this.btnCreateCompany = document.getElementById('btnCreateCompany');
        this.statusCreate = document.getElementById('statusCreate');
        this.companiesList = document.getElementById('companiesList');
        this.selectedCompanyDisplay = document.getElementById('selectedCompanyDisplay');
        this.inputEmployeeAddress = document.getElementById('employeeAddress');
        this.selectEmployeeRole = document.getElementById('employeeRole');
        this.btnAddEmployee = document.getElementById('btnAddEmployee');
        this.employeesList = document.getElementById('employeesList');
        this.statusEmployee = document.getElementById('statusEmployee');
        this.selectedCompanyApproval = document.getElementById('selectedCompanyApproval');
        this.inputApprovalThreshold = document.getElementById('approvalThreshold');
        this.approvalRoleCheckboxes = document.querySelectorAll('.approval-role');
        this.btnSetApprovalRules = document.getElementById('btnSetApprovalRules');
        this.statusApproval = document.getElementById('statusApproval');
        this.pendingList = document.getElementById('pendingList');
    },

    attachEventListeners() {
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        this.btnCreateCompany.addEventListener('click', () => this.handleCreateCompany());
        this.btnAddEmployee.addEventListener('click', () => this.handleAddEmployee());
        this.btnSetApprovalRules.addEventListener('click', () => this.handleSetApprovalRules());
    },

    switchTab(tabName) {
        this.tabBtns.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        this.tabPanes.forEach(pane => pane.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
    },

    truncate(str, n = 12) {
        if (!str) return '—';
        if (str.length <= n * 2 + 3) return str;
        return str.slice(0, n) + '...' + str.slice(-n);
    },

    async fetchCompanies() {
        try {
            const res = await fetch(`${this.NODE_URL}/companies`);
            if (!res.ok) throw new Error('Failed to fetch companies');
            this.companies = await res.json();
            this.renderCompaniesList();
        } catch (e) {
            console.error('Failed to fetch companies:', e);
        }
    },

    async fetchPendingApprovals() {
        if (!this.selectedCompany) {
            this.renderPendingApprovals([]);
            return;
        }
        try {
            const res = await fetch(`${this.NODE_URL}/pending_approvals/${this.selectedCompany.company_id}`);
            if (!res.ok) throw new Error('Failed to fetch pending approvals');
            const data = await res.json();
            this.pendingApprovals = data.pending || [];
            this.approvalThreshold = data.approval_threshold || 0;
            this.approvalRoles = data.required_roles || [];
            this.renderPendingApprovals(this.pendingApprovals);
        } catch (e) {
            console.error('Failed to fetch pending approvals:', e);
        }
    },

    renderCompaniesList() {
        if (this.companies.length === 0) {
            this.companiesList.innerHTML = '<p class="empty-state">No companies yet. Create one to get started.</p>';
            return;
        }

        const walletAddress = localStorage.getItem('walletAddress')?.toLowerCase();

        // Filter companies where user is owner or employee
        const myCompanies = this.companies.filter(company => {
            if (!walletAddress) return false;
            if (company.owner?.toLowerCase() === walletAddress) return true;
            if (company.employees) {
                if (Array.isArray(company.employees)) {
                    return company.employees.some(emp => {
                        const addr = typeof emp === 'string' ? emp : emp.address;
                        return addr?.toLowerCase() === walletAddress;
                    });
                } else {
                    return Object.keys(company.employees).some(addr => addr.toLowerCase() === walletAddress);
                }
            }
            return false;
        });

        if (myCompanies.length === 0) {
            this.companiesList.innerHTML = '<p class="empty-state">You are not part of any companies yet. Create one or ask to be added.</p>';
            return;
        }

        this.companiesList.innerHTML = myCompanies.map(company => `
            <div class="company-card ${this.selectedCompany?.company_id === company.company_id ? 'selected' : ''}" data-company-id="${company.company_id}">
                <div class="company-header">
                    <h3 class="company-title">${company.name}</h3>
                    ${company.owner === walletAddress ? '<span class="company-badge">Owner</span>' : ''}
                </div>
                <div class="company-id">${this.truncate(company.company_id, 16)}</div>
                <div class="company-meta">
                    ${company.employees_count || 0} employee${(company.employees_count || 0) !== 1 ? 's' : ''} • 
                    Balance: ${company.balance || 'N/A'}
                </div>
            </div>
        `).join('');

        this.companiesList.querySelectorAll('.company-card').forEach(card => {
            card.addEventListener('click', () => {
                const companyId = card.dataset.companyId;
                this.selectedCompany = this.companies.find(c => c.company_id === companyId);
                this.renderCompaniesList();
                this.updateSelectedCompanyDisplay();
                this.updateUIPermissions();
                this.renderEmployeesList();
                this.fetchPendingApprovals();
                App.showToast(`Selected: ${this.selectedCompany.name}`, 'info');
            });
        });
    },

    updateUIPermissions() {
        if (!this.selectedCompany) return;
        const walletAddress = localStorage.getItem('walletAddress')?.toLowerCase();
        const isOwner = this.selectedCompany.owner?.toLowerCase() === walletAddress;

        const empForm = document.getElementById('employeeForm');
        const appForm = document.getElementById('approvalForm');

        if (empForm) empForm.style.display = isOwner ? 'block' : 'none';
        if (appForm) appForm.style.display = isOwner ? 'block' : 'none';

        // Remove any existing messages
        document.querySelectorAll('.owner-only-msg').forEach(m => m.remove());

        if (!isOwner) {
            const msg = document.createElement('p');
            msg.className = 'empty-state owner-only-msg';
            msg.style.padding = '20px';
            msg.style.background = 'rgba(255,255,255,0.02)';
            msg.style.borderRadius = '8px';
            msg.innerHTML = '<i class="fas fa-lock" style="margin-right: 8px;"></i> Only the company owner can manage employees and approval rules.';

            if (empForm) empForm.parentNode.insertBefore(msg, empForm);
            // We also need a message for approval rules tab
            if (appForm) {
                const msg2 = msg.cloneNode(true);
                appForm.parentNode.insertBefore(msg2, appForm);
            }
        }
    },

    updateSelectedCompanyDisplay() {
        const display = this.selectedCompany ? this.selectedCompany.name : '—';
        if (this.selectedCompanyDisplay) this.selectedCompanyDisplay.value = display;
        if (this.selectedCompanyApproval) this.selectedCompanyApproval.value = display;
    },

    async handleCreateCompany() {
        const companyName = this.inputCompanyName.value.trim();
        if (!companyName) {
            App.showToast('Please enter a company name', 'error');
            return;
        }
        const walletAddress = localStorage.getItem('walletAddress');
        const publicKey = localStorage.getItem('publicKey');
        if (!walletAddress || !publicKey) {
            App.showToast('Please sign in with your wallet first', 'error');
            return;
        }

        this.isLoading = true;
        this.btnCreateCompany.disabled = true;
        this.btnCreateCompany.textContent = 'Creating...';

        try {
            const res = await fetch(`${this.NODE_URL}/create_company`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: companyName,
                    owner_address: walletAddress,
                    owner_public_key: publicKey,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create company');
            }
            App.showToast(`✓ Company "${companyName}" created!`, 'success');
            this.inputCompanyName.value = '';
            this.fetchCompanies();
        } catch (e) {
            App.showToast(`✗ ${e.message}`, 'error');
        } finally {
            this.isLoading = false;
            this.btnCreateCompany.disabled = false;
            this.btnCreateCompany.innerHTML = '<i class="fas fa-plus"></i> Create Company';
        }
    },

    async handleAddEmployee() {
        if (!this.selectedCompany) {
            App.showToast('Please select a company first (My Companies tab)', 'error');
            return;
        }
        const employeeAddress = this.inputEmployeeAddress.value.trim();
        if (!employeeAddress) {
            App.showToast('Please enter employee address', 'error');
            return;
        }
        const employeeRole = this.selectEmployeeRole.value;

        const requesterAddress = localStorage.getItem('walletAddress');
        if (!requesterAddress) {
            App.showToast('Authentication error: Wallet address not found', 'error');
            return;
        }

        this.isLoading = true;
        this.btnAddEmployee.disabled = true;
        this.btnAddEmployee.textContent = 'Adding...';

        try {
            const placeholderPubKey = `-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${employeeAddress.slice(2, 66)}\n-----END PUBLIC KEY-----`;
            const res = await fetch(`${this.NODE_URL}/add_employee`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: this.selectedCompany.company_id,
                    employee_address: employeeAddress,
                    employee_public_key: placeholderPubKey,
                    role: employeeRole,
                    requester_address: requesterAddress
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to add employee');
            }
            App.showToast(`✓ Employee added as ${employeeRole}!`, 'success');
            this.inputEmployeeAddress.value = '';
            this.selectEmployeeRole.value = 'employee';
            this.fetchCompanies();
            // Re-render employees after fetching updated data
            setTimeout(() => this.renderEmployeesList(), 1000);
        } catch (e) {
            App.showToast(`✗ ${e.message}`, 'error');
        } finally {
            this.isLoading = false;
            this.btnAddEmployee.disabled = false;
            this.btnAddEmployee.innerHTML = '<i class="fas fa-user-plus"></i> Add Employee';
        }
    },

    renderEmployeesList() {
        if (!this.selectedCompany) {
            this.employeesList.innerHTML = '<p class="empty-state">Select a company to view employees.</p>';
            return;
        }

        const employees = this.selectedCompany.employees;
        if (!employees || (Array.isArray(employees) && employees.length === 0) || (typeof employees === 'object' && Object.keys(employees).length === 0)) {
            this.employeesList.innerHTML = '<p class="empty-state">No employees yet.</p>';
            return;
        }

        // Handle both object format {address: {role, joined_at}} and array format [{address, role}]
        let employeeEntries = [];
        if (Array.isArray(employees)) {
            employeeEntries = employees.map(emp => [emp.address, { role: emp.role || 'employee', joined_at: emp.joined_at }]);
        } else {
            employeeEntries = Object.entries(employees);
        }

        this.employeesList.innerHTML = `
            <h4 style="font-size: 14px; font-weight: 500; margin-bottom: 12px; color: var(--text-primary);">
                Employees (${employeeEntries.length})
            </h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${employeeEntries.map(([addr, info]) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px;">
                        <div>
                            <div style="font-size: 13px; font-weight: 500; color: var(--text-primary);">${this.truncate(addr, 10)}</div>
                            <div style="font-size: 11px; color: var(--text-tertiary); text-transform: capitalize;">${info.role}</div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-tertiary);">${new Date(info.joined_at * 1000).toLocaleDateString()}</div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    async handleSetApprovalRules() {
        if (!this.selectedCompany) {
            App.showToast('Please select a company first', 'error');
            return;
        }
        const walletAddress = localStorage.getItem('walletAddress');
        if (this.selectedCompany.owner !== walletAddress) {
            App.showToast('Only company owner can set approval rules', 'error');
            return;
        }

        const threshold = parseFloat(this.inputApprovalThreshold.value) || 0;
        const roles = Array.from(this.approvalRoleCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (roles.length === 0) {
            App.showToast('Please select at least one approver role', 'error');
            return;
        }

        // Validation: Only managers and owners can approve (not employees)
        if (roles.includes('employee')) {
            App.showToast('Employees cannot be required approvers. Only Managers and Owners can approve transactions.', 'error');
            return;
        }

        this.isLoading = true;
        this.btnSetApprovalRules.disabled = true;
        this.btnSetApprovalRules.textContent = 'Setting...';

        try {
            const res = await fetch(`${this.NODE_URL}/set_approval_rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: this.selectedCompany.company_id,
                    threshold: threshold,
                    required_approvers: roles,
                    requester_address: walletAddress
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to set approval rules');
            }
            App.showToast(`✓ Approval rules set! Threshold: ${threshold}, Approvers: ${roles.join(', ')}`, 'success');
            this.fetchPendingApprovals();
        } catch (e) {
            App.showToast(`✗ ${e.message}`, 'error');
        } finally {
            this.isLoading = false;
            this.btnSetApprovalRules.disabled = false;
            this.btnSetApprovalRules.innerHTML = '<i class="fas fa-lock"></i> Set Approval Rules';
        }
    },

    renderPendingApprovals(approvals) {
        if (!approvals || approvals.length === 0) {
            this.pendingList.innerHTML = '<p class="empty-state">No pending approvals.</p>';
            return;
        }

        const walletAddress = localStorage.getItem('walletAddress');
        const isOwner = this.selectedCompany?.owner === walletAddress;

        this.pendingList.innerHTML = approvals.map((approval) => {
            // Support both data structures: {transaction: {sender, receiver, amount}} and flat {sender, receiver, amount}
            const tx = approval.transaction || approval;
            const sender = tx.sender || '';
            const receiver = tx.receiver || '';
            const amount = tx.amount || 'N/A';
            const status = approval.status || 'pending';
            const requiredApprovers = approval.required_approvers || [];
            const currentApprovals = approval.approvals || {};
            const approvalCount = Object.keys(currentApprovals).length;

            const statusColor = status === 'approved' ? 'var(--accent-green)' : status === 'rejected' ? 'var(--accent-red)' : 'var(--accent)';
            const statusBg = status === 'approved' ? 'rgba(0,230,118,0.1)' : status === 'rejected' ? 'rgba(255,76,106,0.1)' : 'rgba(0,152,255,0.1)';

            return `
                <div class="pending-card" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div>
                            <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">
                                ${this.truncate(sender, 10)} → ${this.truncate(receiver, 10)}
                            </div>
                            <div style="font-size: 13px; color: var(--accent); font-weight: 500; margin-bottom: 4px;">${amount} KLT</div>
                            <div style="font-size: 12px; color: var(--text-tertiary); font-family: monospace;">ID: ${this.truncate(approval.tx_id, 16)}</div>
                        </div>
                        <span style="font-size: 11px; padding: 4px 8px; border-radius: 4px; background: ${statusBg}; color: ${statusColor}; font-weight: 500; text-transform: capitalize;">${status}</span>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
                            Approvals: ${approvalCount} / ${requiredApprovers.length || 1}
                            ${isOwner ? '<span style="margin-left: 8px; color: var(--accent-green); font-weight: 500;">👑 Owner (can always approve)</span>' : ''}
                        </div>
                        ${requiredApprovers.map(role => {
                const hasApproval = Object.values(currentApprovals).includes('approved');
                return `
                                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 2px;">
                                    <span style="flex: 1; color: var(--text-secondary); text-transform: capitalize;">${role}:</span>
                                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; background: ${hasApproval ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.04)'}; color: ${hasApproval ? 'var(--accent-green)' : 'var(--text-tertiary)'};">
                                        ${hasApproval ? '✓ Approved' : 'Pending'}
                                    </span>
                                </div>
                            `;
            }).join('')}
                    </div>
                    
                    ${status === 'pending' ? `
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-approve" onclick="CompanyManager.handleApproveTransaction('${approval.tx_id}', 'approved')" style="flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--accent-green); background: rgba(0,230,118,0.1); color: var(--accent-green); cursor: pointer; font-size: 13px; font-weight: 500;">
                                ✓ Approve
                            </button>
                            <button class="btn-reject" onclick="CompanyManager.handleApproveTransaction('${approval.tx_id}', 'rejected')" style="flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--accent-red); background: rgba(255,76,106,0.1); color: var(--accent-red); cursor: pointer; font-size: 13px; font-weight: 500;">
                                ✗ Reject
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    async handleApproveTransaction(txId, decision) {
        if (!this.selectedCompany) return;
        this.isLoading = true;
        const walletAddress = localStorage.getItem('walletAddress');

        try {
            const res = await fetch(`${this.NODE_URL}/approve_transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: this.selectedCompany.company_id,
                    tx_id: txId,
                    approver_address: walletAddress,
                    decision: decision,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed');
            }
            const data = await res.json();
            App.showToast(`✓ Transaction ${decision}!`, 'success');
            this.fetchPendingApprovals();

            // If approved, submit for mining
            if (data.status === 'approved') {
                setTimeout(async () => {
                    const submitRes = await fetch(`${this.NODE_URL}/submit_for_mining/${this.selectedCompany.company_id}/${txId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    if (submitRes.ok) {
                        App.showToast('✓ Transaction submitted to mining pool!', 'success');
                        this.fetchPendingApprovals();
                    }
                }, 500);
            }
        } catch (e) {
            App.showToast(`✗ ${e.message}`, 'error');
        } finally {
            this.isLoading = false;
        }
    },
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    const sidebar = document.getElementById('sidebar');
    const navbar = document.getElementById('navbar');
    const footer = document.getElementById('footer');
    if (sidebar) sidebar.innerHTML = getSidebarHTML('company-manager');
    if (navbar) navbar.innerHTML = getNavbarHTML();
    if (footer) footer.innerHTML = getFooterHTML();
    CompanyManager.init();
});
