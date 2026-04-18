from flask import Flask, request, jsonify, send_file
from main import Blockchain, Transaction, Block, Company, FileTransaction, CompanyActionTransaction
from flask_cors import CORS
import hashlib
import os
import time
from werkzeug.utils import secure_filename

app = Flask(__name__)

blockchain = Blockchain()
# Load blockchain from saved JSON if it exists
blockchain.load_from_json("blockchain.json")

def calculate_file_hash(file_obj):
    """Calculate SHA256 hash of file (from file object, no storage)"""
    sha256_hash = hashlib.sha256()
    file_size = 0
    for chunk in iter(lambda: file_obj.read(4096), b''):
        sha256_hash.update(chunk)
        file_size += len(chunk)
    return sha256_hash.hexdigest(), file_size

CORS(app, resources={r"/*": {"origins": "*"}})


# =========================================
# COMPANY MANAGEMENT ENDPOINTS
# =========================================

# -------------------------
# CREATE COMPANY
# -------------------------
@app.route('/create_company', methods=['POST'])
def create_company():
    """Create a new company"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        name = data.get('name', '').strip() if data.get('name') else ''
        owner_address = data.get('owner_address', '').strip() if data.get('owner_address') else ''
        owner_public_key = data.get('owner_public_key', '').strip() if data.get('owner_public_key') else ''
        
        if not name or not owner_address or not owner_public_key:
            return jsonify({"error": "Missing or empty required fields: name, owner_address, owner_public_key"}), 400
        
        if len(name) < 2:
            return jsonify({"error": "Company name must be at least 2 characters"}), 400
        
        # Generate company ID as hash of (name + owner_address + timestamp)
        company_seed = f"{name}{owner_address}{int(time.time())}"
        company_id = "0x" + hashlib.sha256(company_seed.encode()).hexdigest()[:40]
        
        # Submit transaction
        tx = CompanyActionTransaction(
            owner_address,
            "create",
            {
                "company_id": company_id,
                "name": name,
                "owner_address": owner_address,
                "owner_public_key": owner_public_key
            },
            owner_public_key
        )
        
        blockchain.add_transaction(tx)
        
        print(f"[API] [OK] Company creation submitted: {name} ({company_id})")
        
        return jsonify({
            "message": "Company creation transaction submitted to pool",
            "company_id": company_id,
            "name": name,
            "owner": owner_address,
            "created_at": int(time.time())
        }), 200
        
    except Exception as e:
        import traceback
        print(f"[API] [ERROR] Error creating company: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# -------------------------
# ADD EMPLOYEE TO COMPANY
# -------------------------
@app.route('/add_employee', methods=['POST'])
def add_employee():
    """Add an employee to a company (owner only)"""
    data = request.json
    
    try:
        company_id = data.get('company_id', '').strip() if data.get('company_id') else ''
        employee_address = data.get('employee_address', '').strip() if data.get('employee_address') else ''
        employee_public_key = data.get('employee_public_key', '').strip() if data.get('employee_public_key') else ''
        requester_address = data.get('requester_address', '').strip() if data.get('requester_address') else ''
        role = data.get('role', 'employee').strip()  # employee, manager, owner
        
        if not company_id or not employee_address or not employee_public_key or not requester_address:
            return jsonify({"error": "Missing or empty required fields: company_id, employee_address, employee_public_key, requester_address"}), 400
        
        if role not in ['employee', 'manager', 'owner']:
            return jsonify({"error": "Invalid role. Must be: employee, manager, or owner"}), 400
        
        if company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        company = blockchain.companies[company_id]
        
        # Check if requester is the owner
        if requester_address != company.owner_address:
            return jsonify({"error": "Only company owner can add employees"}), 403
            
        # Submit transaction
        tx = CompanyActionTransaction(
            requester_address,
            "add_employee",
            {
                "company_id": company_id,
                "employee_address": employee_address,
                "employee_public_key": employee_public_key,
                "role": role
            },
            None  # Owner signature validation can be added later
        )
        
        blockchain.add_transaction(tx)
        
        print(f"[API] [OK] Submitted add employee: {employee_address} as {role} to {company.name}")
        
        return jsonify({
            "message": f"Add employee transaction submitted",
            "company_id": company_id,
            "employee": employee_address,
            "role": role
        }), 200
        
    except Exception as e:
        print(f"[API] [ERROR] Error adding employee: {e}")
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET COMPANY DETAILS
# -------------------------
@app.route('/company/<company_id>', methods=['GET'])
def get_company(company_id):
    """Get company details and employees"""
    try:
        if company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        company = blockchain.companies[company_id]
        
        return jsonify({
            "company_id": company.company_id,
            "name": company.name,
            "owner": company.owner_address,
            "created_at": company.created_at,
            "employees_count": len(company.employees),
            "employees": {
                addr: {
                    "role": info["role"],
                    "joined_at": info["joined_at"]
                }
                for addr, info in company.employees.items()
            }
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET ALL COMPANIES
# -------------------------
@app.route('/companies', methods=['GET'])
def get_companies():
    """Get list of all companies"""
    try:
        company_list = [
            {
                "company_id": c.company_id,
                "name": c.name,
                "owner": c.owner_address,
                "employees": list(c.employees.keys()),
                "employees_count": len(c.employees),
                "balance": c.balance
            }
            for c in blockchain.companies.values()
        ]
        
        return jsonify(company_list), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# =========================================
# TRANSACTION ENDPOINTS
# =========================================

# -------------------------
# FUND ACCOUNT (FOR TESTING)
# -------------------------
@app.route('/fund_account', methods=['POST'])
def fund_account():
    """Give initial coins to a wallet address for testing"""
    data = request.json
    address = data.get('address')
    amount = data.get('amount', 1000)  # Default 1000 coins
    
    if not address or not address.startswith('0x'):
        return jsonify({"error": "Invalid address"}), 400
    
    try:
        # Create a system transaction (no signature needed)
        tx = Transaction(
            "SYSTEM",  # System sender
            address,
            amount
        )
        
        # Add to pending transactions (system txs are always valid)
        blockchain.pending_transactions.append(tx)
        print(f"[API] Funded {address} with {amount} coins")
        
        return jsonify({"message": f"Funded with {amount} coins"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# =========================================
# APPROVAL SYSTEM ENDPOINTS
# =========================================

# -------------------------
# SET APPROVAL RULES
# -------------------------
@app.route('/set_approval_rules', methods=['POST'])
def set_approval_rules():
    """Set approval requirements for company transactions"""
    data = request.json
    
    try:
        company_id = data.get('company_id', '').strip()
        threshold = data.get('threshold', 0)  # Transactions above this need approval
        required_approvers = data.get('required_approvers', [])  # ["owner", "manager"]
        requester_address = data.get('requester_address', '').strip()
        
        if not company_id or company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        if not isinstance(threshold, (int, float)) or threshold < 0:
            return jsonify({"error": "Threshold must be a positive number"}), 400
        
        if not isinstance(required_approvers, list) or len(required_approvers) == 0:
            return jsonify({"error": "required_approvers must be a non-empty list"}), 400
        
        # Validate roles - Only managers and owners can approve (not employees)
        valid_approver_roles = {"manager", "owner"}
        for role in required_approvers:
            if role not in valid_approver_roles:
                return jsonify({"error": f"Invalid approver role: {role}. Only 'manager' or 'owner' can approve transactions. Employees cannot approve."}), 400
        
        company = blockchain.companies[company_id]
        
        if requester_address != company.owner_address:
            return jsonify({"error": "Only company owner can set approval rules"}), 403
            
        # Submit transaction
        tx = CompanyActionTransaction(
            requester_address,
            "set_rules",
            {
                "company_id": company_id,
                "threshold": threshold,
                "required_approvers": required_approvers
            },
            None
        )
        blockchain.add_transaction(tx)
        
        print(f"[API] [OK] Submitted set approval rules for {company.name}: threshold={threshold}, approvers={required_approvers}")
        
        return jsonify({
            "message": "Approval rules update submitted",
            "company_id": company_id,
            "threshold": threshold,
            "required_approvers": required_approvers
        }), 200
        
    except Exception as e:
        print(f"[API] [ERROR] Error setting approval rules: {e}")
        return jsonify({"error": str(e)}), 400


# -------------------------
# SUBMIT APPROVAL/REJECTION
# -------------------------
@app.route('/approve_transaction', methods=['POST'])
def approve_transaction():
    """Submit approval or rejection for a pending transaction"""
    data = request.json
    
    try:
        company_id = data.get('company_id', '').strip()
        tx_id = data.get('tx_id', '').strip()
        approver_address = data.get('approver_address', '').strip()
        decision = data.get('decision', '').strip().lower()  # "approved" or "rejected"
        
        if not all([company_id, tx_id, approver_address, decision]):
            return jsonify({"error": "Missing required fields"}), 400
        
        if decision not in ["approved", "rejected"]:
            return jsonify({"error": "Decision must be 'approved' or 'rejected'"}), 400
        
        if company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        company = blockchain.companies[company_id]
        success, message = company.submit_approval(tx_id, approver_address, decision)
        
        if not success:
            return jsonify({"error": message}), 403
        
        approval_status = company.get_pending_approval_status(tx_id)
        print(f"[API] [OK] {approver_address} {decision} transaction {tx_id[:16]}... Status: {approval_status['status']}")
        
        return jsonify({
            "message": message,
            "tx_id": tx_id,
            "status": approval_status["status"],
            "approvals_received": approval_status["approvals"]
        }), 200
        
    except Exception as e:
        print(f"[API] [ERROR] Error submitting approval: {e}")
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET PENDING APPROVALS
# -------------------------
@app.route('/pending_approvals/<company_id>', methods=['GET'])
def get_pending_approvals(company_id):
    """Get all pending approvals for a company"""
    try:
        if company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        company = blockchain.companies[company_id]
        
        pending = []
        for tx_id, approval_data in company.pending_approvals.items():
            pending.append({
                "tx_id": tx_id,
                "transaction": approval_data["tx"],
                "status": approval_data["status"],
                "approvals": approval_data["approvals"],
                "created_at": approval_data["created_at"],
                "required_approvers": company.required_approvers
            })
        
        return jsonify({
            "company_id": company_id,
            "approval_threshold": company.approval_threshold,
            "required_roles": company.required_approvers,
            "pending_count": len(pending),
            "pending": pending
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ADD TRANSACTION
# -------------------------
@app.route('/add_transaction', methods=['POST'])
def add_transaction():
    """Add a transaction (regular or company-based)"""
    data = request.json
    
    print(f"\n[API] Received transaction request:")
    print(f"  Sender: {data.get('sender')}")
    print(f"  Receiver: {data.get('receiver')}")
    print(f"  Amount: {data.get('amount')}")
    print(f"  Company ID: {data.get('company_id', 'None (personal transaction)')}")
    print(f"  Timestamp: {data.get('timestamp')}")

    try:
        # Create transaction
        tx = Transaction(
            data['sender'],
            data['receiver'],
            data['amount'],
            data.get('sender_public_key')
        )

        tx.timestamp = data['timestamp']
        tx.signature = data.get('signature')
        
        # If company_id provided, validate company membership
        company_id = data.get('company_id')
        requires_approval = False
        
        if company_id:
            if company_id not in blockchain.companies:
                return jsonify({"error": "Company not found"}), 404
            
            company = blockchain.companies[company_id]
            
            # Check if sender is employee
            if not company.is_employee(data['sender']):
                return jsonify({"error": "Not a company member"}), 403
            
            # Update public key if provided (allows key rotation)
            if data.get('sender_public_key'):
                company.employees[data['sender']]["public_key"] = data.get('sender_public_key')
            
            tx.company_id = company_id
            tx.role = company.get_employee_role(data['sender'])
            sender_role = tx.role
            
            # Role-based restriction: Employees cannot send amounts above threshold
            # Only managers and owners can bypass this restriction
            if sender_role in ["owner", "manager"]:
                requires_approval = False
            elif sender_role == "employee":
                if company.requires_approval(data['amount']):
                    requires_approval = True
                    print(f"[API] Employee {truncate(data['sender'])} sending {data['amount']} (above threshold {company.approval_threshold}) - requires approval")

        # Check balance across chain, pending transactions, and pending company approvals
        current_balance = blockchain.get_balance(data['sender'])
        
        # Deduct amounts from pending approvals across all companies
        for c in blockchain.companies.values():
            for pending_info in c.pending_approvals.values():
                ptx = pending_info["tx"]
                if ptx.get("sender") == data['sender'] and pending_info["status"] == "pending":
                    current_balance -= ptx.get("amount", 0)
        
        if data['amount'] > current_balance:
            print(f"[API] [ERROR] Insufficient funds: trying to send {data['amount']}, available {current_balance}")
            return jsonify({"error": f"Insufficient funds. Available: {current_balance} KLT"}), 400

        # Validate transaction signature
        print(f"[API] Validating transaction...")
        if not tx.is_valid():
            print(f"[API] [ERROR] Transaction validation failed\n")
            return jsonify({"error": "Invalid transaction"}), 400

        # If approval required, add to pending approvals; otherwise add to mining pool
        if requires_approval:
            tx_id = tx.hash()
            company.add_pending_approval(tx_id, tx.to_dict())
            print(f"[API] [OK] Transaction added to approval queue (needs {len(company.required_approvers)} approvals)\n")
            return jsonify({
                "message": "Transaction added to approval queue",
                "tx_id": tx_id,
                "status": "pending_approval",
                "required_approvers": company.required_approvers
            }), 200
        else:
            blockchain.add_transaction(tx)
            print(f"[API] [OK] Transaction added to pending pool\n")
            return jsonify({"message": "Transaction added"}), 200

    except Exception as e:
        import traceback
        print(f"[API] [ERROR] Error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# -------------------------
# SUBMIT APPROVED TRANSACTION TO MINING
# -------------------------
@app.route('/submit_for_mining/<company_id>/<tx_id>', methods=['POST'])
def submit_for_mining(company_id, tx_id):
    """Submit an approved transaction to the mining pool"""
    try:
        if company_id not in blockchain.companies:
            return jsonify({"error": "Company not found"}), 404
        
        company = blockchain.companies[company_id]
        approval_status = company.get_pending_approval_status(tx_id)
        
        if not approval_status:
            return jsonify({"error": "Transaction not found"}), 404
        
        if approval_status["status"] != "approved":
            return jsonify({"error": f"Transaction status is {approval_status['status']}, not approved"}), 400
        
        # Create transaction object from stored data
        tx_dict = approval_status["tx"]
        tx = Transaction(
            tx_dict['sender'],
            tx_dict['receiver'],
            tx_dict['amount'],
            tx_dict.get('sender_public_key')
        )
        tx.timestamp = tx_dict['timestamp']
        tx.signature = tx_dict.get('signature')
        tx.company_id = tx_dict.get('company_id')
        tx.role = tx_dict.get('role')
        
        # Add to blockchain's pending transactions
        blockchain.add_transaction(tx)
        
        print(f"[API] [OK] Approved transaction {tx_id[:16]}... submitted to mining pool")
        
        return jsonify({
            "message": "Approved transaction submitted to mining pool",
            "tx_id": tx_id
        }), 200
        
    except Exception as e:
        print(f"[API] [ERROR] Error submitting for mining: {e}")
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET PENDING TRANSACTIONS (with optional company filter)
# -------------------------
@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    """Get pending transactions, optionally filtered by company"""
    company_id = request.args.get('company_id')
    
    txs = []

    for tx in blockchain.pending_transactions:
        try:
            # Filter by company if specified
            if company_id and getattr(tx, 'company_id', None) != company_id:
                continue
            
            # Handle signature as string or bytes
            sig = getattr(tx, 'signature', None)
            if isinstance(sig, bytes):
                sig = sig.hex()
            
            # Check transaction type and build appropriate dict
            if hasattr(tx, 'file_hash'):  # FileTransaction
                tx_dict = {
                    "transaction_type": "file",
                    "sender": tx.sender,
                    "receiver": tx.receiver,
                    "file_name": tx.file_name,
                    "file_hash": tx.file_hash,
                    "file_size": tx.file_size,
                    "timestamp": tx.timestamp,
                    "signature": sig,
                    "sender_public_key": getattr(tx, 'sender_public_key', None)
                }
            else:  # Regular Transaction
                tx_dict = {
                    "transaction_type": "transfer",
                    "sender": tx.sender,
                    "receiver": tx.receiver,
                    "amount": getattr(tx, 'amount', 0),
                    "timestamp": tx.timestamp,
                    "signature": sig,
                    "sender_public_key": getattr(tx, 'sender_public_key', None)
                }
            
            # Include company info if available
            if getattr(tx, 'company_id', None):
                tx_dict["company_id"] = tx.company_id
                tx_dict["role"] = getattr(tx, 'role', None)
            
            txs.append(tx_dict)
        except Exception as e:
            print(f"[API] Warning: Error processing transaction: {e}")
            continue

    return jsonify(txs), 200


# -------------------------
# GET FILES FOR RECEIVER
# -------------------------
@app.route('/get_received_files/<receiver_address>', methods=['GET'])
def get_received_files(receiver_address):
    """Get all files that were sent to a receiver address"""
    try:
        received_files = []
        
        # Check all blocks for file transactions sent to this address
        for block in blockchain.chain:
            for tx in block.transactions:
                if hasattr(tx, 'file_hash') and tx.receiver == receiver_address:
                    received_files.append({
                        "file_name": tx.file_name,
                        "file_hash": tx.file_hash,
                        "file_size": tx.file_size,
                        "sender": tx.sender,
                        "timestamp": tx.timestamp,
                        "confirmed": True
                    })
        
        # Also check pending transactions
        for tx in blockchain.pending_transactions:
            if hasattr(tx, 'file_hash') and tx.receiver == receiver_address:
                received_files.append({
                    "file_name": tx.file_name,
                    "file_hash": tx.file_hash,
                    "file_size": tx.file_size,
                    "sender": tx.sender,
                    "timestamp": tx.timestamp,
                    "confirmed": False
                })
        
        # Sort by timestamp, newest first
        received_files.sort(key=lambda x: x['timestamp'], reverse=True)
        
        print(f"[API] Retrieved {len(received_files)} files for {truncate(receiver_address)}")
        
        return jsonify(received_files), 200
    except Exception as e:
        print(f"[API] Error fetching received files: {e}")
        return jsonify({"error": str(e)}), 400


def truncate(addr, n=8):
    """Helper to truncate addresses for logging"""
    if not addr or len(addr) <= n * 2:
        return addr
    return addr[:n] + "..." + addr[-n:]


# ========================
# FILE TRANSFER ENDPOINTS
# ========================

# -------------------------
# UPLOAD FILE
# -------------------------


# -------------------------
# UPLOAD FILE (calculate hash, no storage)
# -------------------------
@app.route('/upload_file', methods=['POST'])
def upload_file():
    """Upload a file, calculate hash (no storage on server)"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Calculate file hash and size (without storing file)
        file_hash, file_size = calculate_file_hash(file)
        filename = secure_filename(file.filename)
        
        print(f"[API] [OK] File hash calculated: {filename} ({file_size} bytes, hash: {file_hash[:16]}...)")
        
        return jsonify({
            "message": "File hash calculated successfully",
            "file_name": filename,
            "file_hash": file_hash,
            "file_size": file_size
        }), 200
    
    except Exception as e:
        print(f"[API] [ERROR] File hash calculation error: {e}")
        return jsonify({"error": str(e)}), 400


# -------------------------
# SEND FILE (create file transaction)
# -------------------------
@app.route('/send_file', methods=['POST'])
def send_file_transaction():
    """Create a file transfer transaction on the blockchain (hash only)"""
    data = request.json
    
    try:
        sender = data.get('sender', '').strip()
        receiver = data.get('receiver', '').strip()
        file_name = data.get('file_name', '').strip()
        file_hash = data.get('file_hash', '').strip()
        file_size = data.get('file_size')
        company_id = data.get('company_id')
        
        if not all([sender, receiver, file_name, file_hash, file_size]):
            return jsonify({"error": "Missing required fields: sender, receiver, file_name, file_hash, file_size"}), 400
        
        # Create file transaction (hash only - no file storage)
        file_tx = FileTransaction(sender, receiver, file_name, file_hash, file_size, data.get('sender_public_key'))
        file_tx.timestamp = int(__import__('time').time())
        file_tx.signature = data.get('signature')
        
        requires_approval = False
        
        if company_id:
            if company_id not in blockchain.companies:
                return jsonify({"error": "Company not found"}), 404
            
            company = blockchain.companies[company_id]
            
            if not company.is_employee(sender):
                return jsonify({"error": "Not a company member"}), 403
            
            file_tx.company_id = company_id
            file_tx.role = company.get_employee_role(sender)
            
            # Check if approval required (based on file size)
            if company.requires_approval(file_size):
                requires_approval = True
        
        # Validate transaction
        if not file_tx.is_valid():
            return jsonify({"error": "Invalid file transaction"}), 400
        
        # Add to pending transactions
        blockchain.pending_transactions.append(file_tx)
        
        print(f"[API] [OK] File transaction created: {sender} -> {receiver} ({file_name})")
        
        return jsonify({
            "message": "File transaction recorded on blockchain",
            "file_name": file_name,
            "file_hash": file_hash,
            "requires_approval": requires_approval
        }), 200
    
    except Exception as e:
        print(f"[API] [ERROR] File transaction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

# -------------------------
# DOWNLOAD FILE
# -------------------------



# -------------------------
# VERIFY FILE HASH
# -------------------------
@app.route('/verify_file', methods=['POST'])
def verify_file():
    """Verify a file matches the blockchain hash (no storage, just verification)"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        expected_hash = request.form.get('expected_hash')
        
        if not expected_hash:
            return jsonify({"error": "Expected hash not provided"}), 400
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Calculate hash from received file (without storing)
        actual_hash, file_size = calculate_file_hash(file)
        
        # Verify hash matches blockchain record
        if actual_hash == expected_hash:
            print(f"[API] [OK] File verification successful: {file.filename}")
            return jsonify({
                "verified": True,
                "message": "File hash matches blockchain record",
                "file_name": file.filename,
                "file_hash": actual_hash
            }), 200
        else:
            print(f"[API] [ERROR] File verification failed: hash mismatch")
            return jsonify({
                "verified": False,
                "message": "File hash does not match blockchain record",
                "file_name": file.filename,
                "expected": expected_hash,
                "actual": actual_hash
            }), 400
    
    except Exception as e:
        print(f"[API] [ERROR] File verification error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# -------------------------
# SUBMIT MINED BLOCK
# -------------------------
@app.route('/submit_block', methods=['POST'])
def submit_block():
    data = request.json

    try:
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        if 'transactions' not in data:
            return jsonify({"error": "Missing transactions field"}), 400

        transactions = []

        for i, tx_data in enumerate(data['transactions']):
            try:
                tx_type = tx_data.get('transaction_type', 'transfer')
                
                if tx_type == 'file':
                    # Create FileTransaction
                    tx = FileTransaction(
                        tx_data['sender'],
                        tx_data['receiver'],
                        tx_data['file_name'],
                        tx_data['file_hash'],
                        tx_data['file_size'],
                        tx_data.get('sender_public_key')
                    )
                else:
                    # Create regular Transaction
                    tx = Transaction(
                        tx_data['sender'],
                        tx_data['receiver'],
                        tx_data.get('amount', 0),
                        tx_data.get('sender_public_key')
                    )
                
                tx.timestamp = tx_data['timestamp']
                tx.signature = tx_data.get('signature')
                
                # Restore company info if present
                if 'company_id' in tx_data:
                    tx.company_id = tx_data['company_id']
                    tx.role = tx_data.get('role')

                if not tx.is_valid():
                    return jsonify({"error": f"Invalid transaction {i} in block"}), 400

                transactions.append(tx)
            except KeyError as e:
                return jsonify({"error": f"Missing field in transaction {i}: {str(e)}"}), 400
            except Exception as e:
                return jsonify({"error": f"Error processing transaction {i}: {str(e)}"}), 400

        new_block = Block(transactions, data['previous_hash'])

        new_block.timestamp = data['timestamp']
        new_block.nonce = data['nonce']
        new_block.hash = data['hash']

        # Validate proof-of-work
        if not new_block.hash.startswith('0' * blockchain.difficulty):
            return jsonify({"error": "Invalid proof of work"}), 400

        # Validate hash correctness
        recalc_hash = new_block.calculate_hash()
        if new_block.hash != recalc_hash:
            print(f"[API] [ERROR] Hash mismatch!")
            print(f"[API] Expected hash: {new_block.hash}")
            print(f"[API] Calculated hash: {recalc_hash}")
            print(f"[API] Transaction count: {len(transactions)}")
            for i, tx in enumerate(transactions):
                print(f"[API] Tx {i}: {tx.to_dict()}")
            return jsonify({"error": "Hash mismatch"}), 400

        # Validate chain linking
        if data['previous_hash'] != blockchain.get_latest_block().hash:
            return jsonify({"error": "Invalid previous hash"}), 400

        blockchain.chain.append(new_block)
        blockchain.pending_transactions = []
        
        # Save blockchain to JSON
        blockchain.save_to_json("blockchain.json")

        return jsonify({"message": "Block accepted"}), 200

    except Exception as e:
        import traceback
        print(f"[API] [ERROR] Error in /submit_block: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET FULL CHAIN (with optional company filter)
# -------------------------
@app.route('/chain', methods=['GET'])
def get_chain():
    """Get blockchain, optionally filtered by company"""
    company_id = request.args.get('company_id')
    
    chain_data = []

    for block in blockchain.chain:
        # Filter transactions by company if specified
        if company_id:
            transactions = [
                tx.to_dict() for tx in block.transactions
                if not tx.company_id or tx.company_id == company_id
            ]
        else:
            transactions = [tx.to_dict() for tx in block.transactions]
        
        chain_data.append({
            "timestamp": block.timestamp,
            "transactions": transactions,
            "previous_hash": block.previous_hash,
            "hash": block.hash,
            "nonce": block.nonce
        })

    return jsonify(chain_data), 200


# -------------------------
# RUN NODE
# -------------------------
if __name__ == "__main__":
    print("Starting blockchain node...")
    app.run(host='0.0.0.0', port=5000)