// File Transfer Module
const FileTransfer = {
    NODE_URL: 'http://127.0.0.1:5000',
    isLoading: false,
    files: {
        send: null,
        received: []
    },

    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.fetchReceivedFiles();
        // Refresh received files every 10 seconds
        setInterval(() => this.fetchReceivedFiles(), 10000);
    },

    cacheElements() {
        // Send Tab
        this.fileInput = document.getElementById('fileInput');
        this.receiverInput = document.getElementById('receiverInput');
        this.companySelect = document.getElementById('companySelect');
        this.btnSendFile = document.getElementById('btnSendFile');
        this.fileNameDisplay = document.getElementById('fileNameDisplay');
        this.statusSend = document.getElementById('statusSend');

        // Receive Tab
        this.receivedFilesList = document.getElementById('receivedFilesList');
        this.statusReceive = document.getElementById('statusReceive');
    },

    attachEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        if (this.btnSendFile) {
            this.btnSendFile.addEventListener('click', () => this.handleSendFile());
        }
    },

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.files.send = file;
            if (this.fileNameDisplay) {
                this.fileNameDisplay.textContent = `${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
                this.fileNameDisplay.style.display = 'block';
            }
        }
    },

    async handleSendFile() {
        const walletAddress = localStorage.getItem('walletAddress');
        const publicKey = localStorage.getItem('publicKey');

        if (!walletAddress || !publicKey) {
            this.showStatus(this.statusSend, 'Not logged in with wallet', false);
            return;
        }

        if (!this.files.send) {
            this.showStatus(this.statusSend, 'Please select a file', false);
            return;
        }

        const receiver = this.receiverInput.value.trim();
        if (!receiver) {
            this.showStatus(this.statusSend, 'Please enter recipient address', false);
            return;
        }

        this.isLoading = true;
        this.btnSendFile.disabled = true;
        this.btnSendFile.textContent = 'Uploading...';

        try {
            // Step 1: Upload file to calculate hash
            const formData = new FormData();
            formData.append('file', this.files.send);

            const uploadRes = await fetch(`${this.NODE_URL}/upload_file`, {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) {
                const err = await uploadRes.json();
                throw new Error(err.error || 'File hash calculation failed');
            }

            const uploadData = await uploadRes.json();

            // Step 2: Send file hash transaction to blockchain
            const companyId = this.companySelect?.value || null;
            const fileTransactionData = {
                sender: walletAddress,
                receiver: receiver,
                file_name: uploadData.file_name,
                file_hash: uploadData.file_hash,
                file_size: uploadData.file_size,
                company_id: companyId,
                sender_public_key: publicKey
            };

            const txRes = await fetch(`${this.NODE_URL}/send_file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fileTransactionData)
            });

            if (!txRes.ok) {
                const err = await txRes.json();
                throw new Error(err.error || 'File transaction failed');
            }

            this.showStatus(
                this.statusSend,
                `✓ File sent! Hash: ${uploadData.file_hash.substring(0, 16)}...`,
                true
            );

            // Reset form
            this.fileInput.value = '';
            this.receiverInput.value = '';
            this.files.send = null;
            if (this.fileNameDisplay) {
                this.fileNameDisplay.style.display = 'none';
            }
        } catch (e) {
            this.showStatus(this.statusSend, `✗ ${e.message}`, false);
        } finally {
            this.isLoading = false;
            this.btnSendFile.disabled = false;
            this.btnSendFile.textContent = 'Send File';
        }
    },

    async fetchReceivedFiles() {
        const walletAddress = localStorage.getItem('walletAddress');
        if (!walletAddress) return;

        try {
            const res = await fetch(`${this.NODE_URL}/get_received_files/${walletAddress}`);
            if (!res.ok) throw new Error('Failed to fetch files');

            this.files.received = await res.json() || [];
            this.renderReceivedFiles();
        } catch (e) {
            console.error('Failed to fetch received files:', e);
        }
    },

    renderReceivedFiles() {
        if (!this.receivedFilesList) return;

        if (this.files.received.length === 0) {
            this.receivedFilesList.innerHTML = '<p class="empty-state">No files received yet.</p>';
            return;
        }

        this.receivedFilesList.innerHTML = this.files.received.map((file, idx) => `
            <div class="file-card">
                <div class="file-header">
                    <div>
                        <p class="file-name">${file.file_name}</p>
                        <p class="file-sender">From: ${this.truncate(file.sender, 8)}</p>
                    </div>
                    <div class="file-meta">
                        <p class="file-size">${(file.file_size / 1024).toFixed(2)} KB</p>
                        <p class="file-status">${file.confirmed ? '[OK]' : '[PENDING]'}</p>
                    </div>
                </div>
                <div class="file-hash">
                    Hash: ${this.truncate(file.file_hash, 16)}
                </div>
                <div class="file-actions">
                    <input 
                        type="file" 
                        id="verifyFile-${idx}" 
                        class="file-input-verify"
                        onchange="FileTransfer.handleVerifyFile('${file.file_hash}', '${file.file_name}', ${idx})"
                    >
                    <button 
                        class="btn-verify" 
                        onclick="document.getElementById('verifyFile-${idx}').click()"
                    >
                        Verify File
                    </button>
                </div>
                <div id="verifyStatus-${idx}" class="verify-status"></div>
            </div>
        `).join('');
    },

    async handleVerifyFile(expectedHash, fileName, idx) {
        const fileInput = document.getElementById(`verifyFile-${idx}`);
        if (!fileInput.files[0]) return;

        const statusEl = document.getElementById(`verifyStatus-${idx}`);
        statusEl.textContent = 'Verifying...';
        statusEl.className = 'verify-status verifying';

        try {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('expected_hash', expectedHash);

            const res = await fetch(`${this.NODE_URL}/verify_file`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (data.verified) {
                statusEl.textContent = '✓ File verified! Hash matches blockchain record.';
                statusEl.className = 'verify-status success';
            } else {
                statusEl.innerHTML = `✗ Hash mismatch!<br>Expected: ${data.expected.substring(0, 20)}...<br>Actual: ${data.actual.substring(0, 20)}...`;
                statusEl.className = 'verify-status error';
            }
        } catch (e) {
            statusEl.textContent = `✗ Verification error: ${e.message}`;
            statusEl.className = 'verify-status error';
        }

        // Reset file input
        fileInput.value = '';
    },

    truncate(str, n = 12) {
        if (!str) return '—';
        if (str.length <= n * 2 + 3) return str;
        return str.slice(0, n) + '...' + str.slice(-n);
    },

    showStatus(element, message, isSuccess) {
        if (!element) return;
        element.textContent = message;
        element.className = `status-message show ${isSuccess ? 'success' : 'error'}`;
        setTimeout(() => {
            element.classList.remove('show');
        }, 4000);
    }
};

// Export for use
window.FileTransfer = FileTransfer;
