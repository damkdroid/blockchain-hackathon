class NetworkGraph {
    constructor() {
        this.NODE_URL = "http://127.0.0.1:5000";
        this.canvas = document.getElementById('networkCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('canvasWrapper');
        this.overlay = document.getElementById('nodeInfoOverlay');
        
        this.nodes = [];
        this.links = [];
        this.allData = { chain: [], companies: [] };
        
        this.width = 0;
        this.height = 0;
        this.dpr = window.devicePixelRatio || 1;
        
        this.dragNode = null;
        this.hoverNode = null;
        this.offset = { x: 0, y: 0 };
        this.zoom = 1;
        this.showLabels = true;
        this.currentFilter = 'all';
        
        try {
            if (window.WalletAPI) {
                this.walletAddress = WalletAPI.getSession()?.address;
            } else {
                console.warn('WalletAPI not found during NetworkGraph construction');
            }
            
            if (window.App && typeof window.App.init === 'function') {
                App.init();
            }
        } catch (err) {
            console.error('Error during NetworkGraph init state setup:', err);
        }
        
        this.init();
    }

    async init() {
        console.log('Initializing Network Graph...');
        this.resize();
        
        // If dimensions are 0, try again in a bit
        if (this.width === 0 || this.height === 0) {
            setTimeout(() => this.init(), 100);
            return;
        }

        await this.loadData();
        this.buildGraph();
        this.bindEvents();
        this.animate();
        this.populateCompanyFilter();
        
        // Refresh every 15 seconds to reduce network noise
        setInterval(async () => {
            await this.loadData();
            this.buildGraph(true);
        }, 15000);
    }

    async loadData() {
        try {
            const [chainRes, companiesRes] = await Promise.all([
                fetch(`${this.NODE_URL}/chain`),
                fetch(`${this.NODE_URL}/companies`)
            ]);
            this.allData.chain = await chainRes.json();
            this.allData.companies = await companiesRes.json();
            
            document.getElementById('statTxs').textContent = this.allData.chain.reduce((acc, b) => acc + (b.transactions?.length || 0), 0);
            document.getElementById('statCompanies').textContent = this.allData.companies.length;
            const blockHeightEl = document.querySelector('.mini-stat-value:not(#statTxs):not(#statCompanies)');
            if (blockHeightEl) blockHeightEl.textContent = `#${this.allData.chain.length - 1}`;
        } catch (e) {
            console.error('Failed to load network data:', e);
        }
    }

    buildGraph(isUpdate = false) {
        const transactions = this.allData.chain.flatMap(b => b.transactions || []);
        const filteredTxs = this.currentFilter === 'all' 
            ? transactions 
            : transactions.filter(tx => tx.company_id === this.currentFilter);

        const nodeMap = new Map();
        if (isUpdate) {
            this.nodes.forEach(n => {
                nodeMap.set(n.id, n);
                // Reset accumulated stats before recalculating
                n.volume = 0;
                n.companies = new Set();
                n.roles = new Set();
            });
        }

        const newNodes = [];
        const newLinks = [];

        if (filteredTxs.length === 0 && !isUpdate) {
            console.warn('No transactions found for the current filter.');
            // Add a dummy node if no data exists to show something is working
            const dummy = {
                id: 'No Transactions Found',
                x: this.width / 2,
                y: this.height / 2,
                vx: 0, vy: 0, radius: 10, color: '#666', volume: 0, companies: new Set(), roles: new Set()
            };
            this.nodes = [dummy];
            this.links = [];
            return;
        }

        filteredTxs.forEach(tx => {
            if (!tx.sender || !tx.receiver) return;

            // Add/Update nodes
            [tx.sender, tx.receiver].forEach(addr => {
                if (!nodeMap.has(addr)) {
                    const node = {
                        id: addr,
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        vx: 0,
                        vy: 0,
                        radius: 6,
                        color: '#0098ff',
                        volume: 0,
                        companies: new Set(),
                        roles: new Set()
                    };
                    nodeMap.set(addr, node);
                    newNodes.push(node);
                }
            });

            const sender = nodeMap.get(tx.sender);
            const receiver = nodeMap.get(tx.receiver);

            sender.volume += tx.amount;
            receiver.volume += tx.amount;
            
            if (tx.company_id) {
                const company = this.allData.companies.find(c => c.company_id === tx.company_id);
                if (company) {
                    sender.companies.add(company.name);
                    receiver.companies.add(company.name);
                }
                if (tx.role) {
                    sender.roles.add(tx.role);
                }
            }

            newLinks.push({ source: sender, target: receiver, amount: tx.amount });
        });

        // Determine node roles relative to user for coloring
        nodeMap.forEach((node, addr) => {
            if (addr === this.walletAddress) {
                node.relation = 'self';
            } else {
                const isSender = filteredTxs.some(tx => tx.sender === addr && tx.receiver === this.walletAddress);
                const isReceiver = filteredTxs.some(tx => tx.sender === this.walletAddress && tx.receiver === addr);
                
                if (isSender && isReceiver) node.relation = 'both';
                else if (isSender) node.relation = 'sender';
                else if (isReceiver) node.relation = 'receiver';
                else node.relation = 'none';
            }
        });

        if (isUpdate) {
            // Keep existing nodes that are still relevant
            this.nodes = Array.from(nodeMap.values()).filter(n => {
                const inNew = newNodes.find(nn => nn.id === n.id);
                return inNew || filteredTxs.some(tx => tx.sender === n.id || tx.receiver === n.id);
            });
        } else {
            this.nodes = Array.from(nodeMap.values());
        }
        this.links = newLinks;
        this.populatePeerList();
    }

    resize() {
        this.width = this.wrapper.clientWidth;
        this.height = this.wrapper.clientHeight;
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        
        // Reset transform before scaling to avoid accumulation
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.dpr, this.dpr);
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offset.x) / this.zoom;
            const y = (e.clientY - rect.top - this.offset.y) / this.zoom;
            
            this.dragNode = this.nodes.find(n => {
                const dx = n.x - x;
                const dy = n.y - y;
                return Math.sqrt(dx*dx + dy*dy) < n.radius + 5;
            });
            
            if (!this.dragNode) {
                this.isPanning = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offset.x) / this.zoom;
            const y = (e.clientY - rect.top - this.offset.y) / this.zoom;

            if (this.dragNode) {
                this.dragNode.x = x;
                this.dragNode.y = y;
            } else if (this.isPanning) {
                const dx = (e.clientX - this.lastMouse.x);
                const dy = (e.clientY - this.lastMouse.y);
                this.offset.x += dx;
                this.offset.y += dy;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            } else {
                this.hoverNode = this.nodes.find(n => {
                    const dx = n.x - x;
                    const dy = n.y - y;
                    return Math.sqrt(dx*dx + dy*dy) < n.radius + 5;
                });
                
                if (this.hoverNode) {
                    this.showOverlay(this.hoverNode, e.clientX, e.clientY);
                } else {
                    this.overlay.classList.remove('active');
                }
            }
        });

        window.addEventListener('mouseup', () => {
            this.dragNode = null;
            this.isPanning = false;
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= delta;
            this.zoom = Math.max(0.1, Math.min(5, this.zoom));
        });

        document.getElementById('resetZoom').addEventListener('click', () => {
            this.offset = { x: 0, y: 0 };
            this.zoom = 1;
        });

        document.getElementById('toggleLabels').addEventListener('click', () => {
            this.showLabels = !this.showLabels;
        });

        document.getElementById('companyFilter').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.buildGraph();
        });
    }

    showOverlay(node, mouseX, mouseY) {
        document.getElementById('nodeId').textContent = `User: ${node.id.slice(0,10)}...${node.id.slice(-6)}`;
        document.getElementById('nodeVolume').textContent = `${node.volume.toFixed(2)} KLT`;
        document.getElementById('nodeCompany').textContent = Array.from(node.companies).join(', ') || 'Independent';
        document.getElementById('nodeRole').textContent = Array.from(node.roles).join(', ') || 'User';
        
        this.overlay.classList.add('active');
    }

    applyForces() {
        const k = 0.1; // Spring constant
        const repulsion = 4000; // Stronger repulsion
        
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[i].x - this.nodes[j].x;
                const dy = this.nodes[i].y - this.nodes[j].y;
                const distSq = dx * dx + dy * dy || 1;
                const dist = Math.sqrt(distSq);
                
                const force = repulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                this.nodes[i].vx += fx;
                this.nodes[i].vy += fy;
                this.nodes[j].vx -= fx;
                this.nodes[j].vy -= fy;
            }
        }

        this.links.forEach(link => {
            const s = link.source;
            const t = link.target;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 120) * k;
            
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            s.vx += fx;
            s.vy += fy;
            t.vx -= fx;
            t.vy -= fy;
        });

        this.nodes.forEach(node => {
            const dx = (this.width / 2) - node.x;
            const dy = (this.height / 2) - node.y;
            node.vx += dx * 0.005;
            node.vy += dy * 0.005;
            
            node.vx *= 0.85;
            node.vy *= 0.85;
            
            if (node !== this.dragNode) {
                node.x += node.vx;
                node.y += node.vy;
            }
            
            // Boundary constraints
            node.x = Math.max(50, Math.min(this.width - 50, node.x));
            node.y = Math.max(50, Math.min(this.height - 50, node.y));
        });
    }

    drawGrid() {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < this.width; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
        }
        for (let y = 0; y < this.height; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
        }
        this.ctx.stroke();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.save();
        this.ctx.translate(this.offset.x, this.offset.y);
        this.ctx.scale(this.zoom, this.zoom);

        // Draw background grid
        this.drawGrid();

        // Draw Links
        this.links.forEach(link => {
            this.ctx.beginPath();
            const alpha = Math.min(0.5, 0.1 + (link.amount / 1000));
            
            // Color logic: Green for incoming to user, Red for outgoing from user
            let color = 'rgba(0, 152, 255, '; // Default blueish
            if (this.walletAddress) {
                if (link.target.id === this.walletAddress) color = 'rgba(0, 230, 118, '; // Green
                else if (link.source.id === this.walletAddress) color = 'rgba(255, 76, 106, '; // Red
            }
            
            this.ctx.strokeStyle = color + alpha + ')';
            this.ctx.lineWidth = 1 + (link.amount / 500);
            this.ctx.moveTo(link.source.x, link.source.y);
            this.ctx.lineTo(link.target.x, link.target.y);
            this.ctx.stroke();
        });

        // Draw Nodes
        this.nodes.forEach(node => {
            // Color logic based on relation to user
            let nodeColor = '#666666'; // Default gray
            if (node.relation === 'self') nodeColor = '#0098ff'; // Blue
            else if (node.relation === 'sender') nodeColor = '#00e676'; // Green (Credit source)
            else if (node.relation === 'receiver') nodeColor = '#ff4c6a'; // Red (Debit destination)
            else if (node.relation === 'both') nodeColor = '#ff9f43'; // Orange (Mixed)
            
            const isUser = node.relation === 'self';
            
            // Safety checks for radius and volume
            const radius = node.radius || 6;
            const volume = node.volume || 0;
            const r = radius + (volume / 1000);
            
            if (isNaN(r) || r <= 0) return;

            // Glow
            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 3);
            gradient.addColorStop(0, nodeColor + '44');
            gradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = gradient;
            this.ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Core
            this.ctx.beginPath();
            this.ctx.fillStyle = nodeColor;
            this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = isUser ? '#fff' : 'rgba(255,255,255,0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            if (this.showLabels) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                this.ctx.font = '10px Inter';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(node.id.length > 10 ? node.id.slice(0, 6) + '...' : node.id, node.x, node.y + r + 15);
            }
        });

        this.ctx.restore();
    }

    animate() {
        this.applyForces();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    populateCompanyFilter() {
        const select = document.getElementById('companyFilter');
        if (!select) return;
        
        const currentVal = select.value;
        select.innerHTML = '<option value="all">All Transactions</option>';
        this.allData.companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.company_id;
            opt.textContent = c.name;
            if (c.company_id === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
    }

    populatePeerList() {
        const peerContainer = document.getElementById('peerItems');
        if (!peerContainer) return;
        
        const sortedNodes = [...this.nodes]
            .filter(n => n.id !== 'SYSTEM' && n.id !== 'No Transactions Found')
            .sort((a, b) => b.volume - a.volume);
        
        peerContainer.innerHTML = sortedNodes.slice(0, 20).map(node => `
            <div class="peer-item">
                <div class="peer-avatar">${node.id.slice(2, 4).toUpperCase()}</div>
                <div class="peer-info">
                    <div class="peer-id">${node.id.slice(0,10)}...${node.id.slice(-6)}</div>
                    <div class="peer-meta">${node.volume.toFixed(2)} KLT Total Volume</div>
                </div>
            </div>
        `).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.networkGraph = new NetworkGraph();
});
