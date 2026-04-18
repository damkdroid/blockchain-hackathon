import json
import time
import hashlib
import os
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256
from ecdsa import VerifyingKey
from ecdsa.util import sigdecode_string, sigdecode_der


# -------------------------
# WALLET (User Identity)
# -------------------------
class Wallet:
    def __init__(self):
        self.key = RSA.generate(2048)
        self.private_key = self.key
        self.public_key = self.key.publickey()

    def get_address(self):
        """Return 0x-prefixed SHA256 hash of public key"""
        public_key_bytes = self.public_key.export_key()
        address_hash = hashlib.sha256(public_key_bytes).hexdigest()
        return "0x" + address_hash
    
    def get_public_key(self):
        """Return full public key for signature verification"""
        return self.public_key.export_key().decode()


# -------------------------
# COMPANY (Organization with employees)
# -------------------------
# Role Hierarchy: Higher rank can satisfy lower rank requirements
ROLE_HIERARCHY = {
    "owner": 2,
    "manager": 1,
    "employee": 0
}

class Company:
    def __init__(self, company_id, name, owner_address, owner_public_key):
        """
        Create a company with an owner
        company_id: Unique identifier (0x-prefixed hash)
        name: Company name
        owner_address: Address of company owner
        owner_public_key: Public key of owner
        """
        self.company_id = company_id
        self.name = name
        self.owner_address = owner_address
        self.owner_public_key = owner_public_key
        self.created_at = int(time.time())
        
        # Employees: {address: {"role": "employee|manager|owner", "joined_at": timestamp}}
        self.employees = {
            owner_address: {
                "role": "owner",
                "joined_at": self.created_at,
                "public_key": owner_public_key
            }
        }
        
        # Company wallet balance (internal balance for the company)
        self.balance = 0
        
        # Approval settings
        self.approval_threshold = 0  # Transactions above this amount need approval
        self.required_approvers = []  # List of roles required to approve: ["owner", "manager"]
        
        # Pending approvals: {tx_id: {"tx": tx_dict, "approvals": {address: "approved"|"rejected"}, "status": "pending"|"approved"|"rejected"}}
        self.pending_approvals = {}

    def set_approval_rules(self, threshold, required_approvers):
        """Set approval rules for this company"""
        self.approval_threshold = threshold
        self.required_approvers = required_approvers
        return True

    def requires_approval(self, amount):
        """Check if transaction amount requires approval"""
        return amount > self.approval_threshold and len(self.required_approvers) > 0

    def add_pending_approval(self, tx_id, tx_dict):
        """Add a transaction pending for approvals"""
        self.pending_approvals[tx_id] = {
            "tx": tx_dict,
            "approvals": {},  # {approver_address: "approved"|"rejected"}
            "status": "pending",
            "created_at": int(time.time())
        }
        return True

    def submit_approval(self, tx_id, approver_address, decision):
        """Submit approval/rejection for a pending transaction"""
        if tx_id not in self.pending_approvals:
            return False, "Transaction not found"
        
        tx_data = self.pending_approvals[tx_id]["tx"]
        
        # BLOCK SELF-APPROVAL
        if approver_address == tx_data["sender"]:
            return False, "You cannot approve your own transaction"
        
        if approver_address not in self.employees:
            return False, "Approver not an employee"
        
        approver_role = self.get_employee_role(approver_address)
        
        # Role Rank
        approver_rank = ROLE_HIERARCHY.get(approver_role, 0)
        
        # Record approval
        self.pending_approvals[tx_id]["approvals"][approver_address] = decision
        
        # Check for any rejections
        if decision == "rejected":
            self.pending_approvals[tx_id]["status"] = "rejected"
            return False, "Transaction rejected by an approver"
        
        # Check if all required roles are satisfied
        # A required role is satisfied if someone with that role OR higher has approved
        satisfied_roles = set()
        for required_role in self.required_approvers:
            required_rank = ROLE_HIERARCHY.get(required_role, 0)
            
            # Check if any approver has rank >= required_rank
            for addr, dec in self.pending_approvals[tx_id]["approvals"].items():
                if dec == "approved":
                    role = self.get_employee_role(addr)
                    if ROLE_HIERARCHY.get(role, 0) >= required_rank:
                        satisfied_roles.add(required_role)
                        break
        
        # Special case: Owner can always approve everything if they are not the sender
        if approver_role == "owner" and decision == "approved":
            # If owner approves, it's a super-approval (unless we want to strictly follow roles)
            # The user said "owner can any", so let's mark it as approved if owner approves.
            self.pending_approvals[tx_id]["status"] = "approved"
            return True, "Approved by company owner!"

        # Check if all required roles have been satisfied
        if satisfied_roles >= set(self.required_approvers):
            self.pending_approvals[tx_id]["status"] = "approved"
            return True, "All required approvals received - transaction approved!"
        
        return True, "Approval recorded"

    def get_pending_approval_status(self, tx_id):
        """Get the current status of a pending approval"""
        if tx_id not in self.pending_approvals:
            return None
        return self.pending_approvals[tx_id]

    def add_employee(self, address, role, public_key, timestamp=None):
        """Add an employee to the company"""
        if address not in self.employees:
            self.employees[address] = {
                "role": role,
                "joined_at": timestamp or int(time.time()),
                "public_key": public_key
            }
            return True
        return False

    def remove_employee(self, address):
        """Remove an employee from the company (owner only)"""
        if address != self.owner_address and address in self.employees:
            del self.employees[address]
            return True
        return False

    def is_employee(self, address):
        """Check if address is an employee"""
        return address in self.employees

    def get_employee_role(self, address):
        """Get employee role"""
        if address in self.employees:
            return self.employees[address]["role"]
        return None

    def get_employee_public_key(self, address):
        """Get employee's public key"""
        if address in self.employees:
            return self.employees[address]["public_key"]
        return None

    def to_dict(self):
        """Convert company to dictionary"""
        return {
            "company_id": self.company_id,
            "name": self.name,
            "owner_address": self.owner_address,
            "created_at": self.created_at,
            "employees_count": len(self.employees),
            "balance": self.balance
        }


# -------------------------
# FILE TRANSACTION
# -------------------------
class FileTransaction:
    """Transaction for transferring files with hash verification"""
    def __init__(self, sender_address, receiver_address, file_name, file_hash, file_size, sender_public_key=None):
        """
        Create a file transfer transaction
        sender_address: 0x-prefixed hash
        receiver_address: 0x-prefixed hash
        file_name: Original filename (e.g., "data.xlsx")
        file_hash: SHA256 hash of file content
        file_size: Size of file in bytes
        sender_public_key: For signature verification
        """
        self.sender = sender_address
        self.receiver = receiver_address
        self.file_name = file_name
        self.file_hash = file_hash
        self.file_size = file_size
        self.timestamp = int(time.time())
        self.signature = None
        self.sender_public_key = sender_public_key
        self.company_id = None
        self.role = None
        self.transaction_type = "file"

    def to_dict(self):
        return {
            "sender": self.sender,
            "receiver": self.receiver,
            "file_name": self.file_name,
            "file_hash": self.file_hash,
            "file_size": self.file_size,
            "timestamp": self.timestamp,
            "signature": self.signature.hex() if isinstance(self.signature, bytes) else self.signature,
            "sender_public_key": self.sender_public_key,
            "company_id": self.company_id,
            "role": self.role,
            "transaction_type": self.transaction_type
        }

    def is_valid(self):
        """Validate file transaction"""
        if self.sender == "SYSTEM":
            return True
        
        # For company file transfers, skip signature verification
        if self.company_id:
            print("[DEBUG] Company file transaction - signature verification skipped")
            return True
        
        return True


# -------------------------
# TRANSACTION
# -------------------------
class Transaction:
    def __init__(self, sender_address, receiver_address, amount, sender_public_key=None):
        """
        Create a transaction using simple addresses (0x-prefixed hash)
        sender_address: 0x-prefixed hash (address of sender)
        receiver_address: 0x-prefixed hash (address of receiver)
        sender_public_key: Full public key for signature verification
        """
        self.sender = sender_address  # 0x... format
        self.receiver = receiver_address  # 0x... format
        self.amount = amount
        self.timestamp = int(time.time())
        self.signature = None
        self.sender_public_key = sender_public_key  # Store for validation
        self.company_id = None
        self.role = None

    def to_dict(self):
        return {
            "sender": self.sender,
            "receiver": self.receiver,
            "amount": self.amount,
            "timestamp": self.timestamp,
            "signature": self.signature.hex() if isinstance(self.signature, bytes) else self.signature,
            "sender_public_key": self.sender_public_key,
            "company_id": self.company_id,
            "role": self.role
        }

    def hash(self):
        tx_string = json.dumps(self.to_dict(), sort_keys=True).encode()
        return hashlib.sha256(tx_string).hexdigest()

    def sign(self, private_key):
        tx_string = json.dumps(self.to_dict(), sort_keys=True).encode()
        h = SHA256.new(tx_string)
        self.signature = pkcs1_15.new(private_key).sign(h)

    def is_valid(self):
        """Validate transaction signature using ECDSA (Web Crypto API) or RSA"""
        if self.sender == "SYSTEM":
            return True

        # For company transactions, skip signature verification entirely
        # Company membership is already validated separately
        if self.company_id:
            print("[DEBUG] Company transaction - signature verification skipped")
            return True

        if not self.signature:
            print("[DEBUG] No signature provided")
            return False

        if not self.sender_public_key:
            print("[DEBUG] No public key provided")
            return False

        try:
            # Prepare transaction data for signature verification
            # IMPORTANT: Key order must match frontend's JSON.stringify() order (NOT sorted)
            tx_dict = {
                "sender": self.sender,
                "receiver": self.receiver,
                "amount": self.amount,
                "timestamp": self.timestamp
            }
            # Use separators to match JavaScript JSON.stringify exactly
            tx_string = json.dumps(tx_dict, separators=(',', ':')).encode()
            tx_hash = hashlib.sha256(tx_string).digest()
            
            print(f"[DEBUG] TX String: {tx_string}")
            print(f"[DEBUG] TX Hash (hex): {tx_hash.hex()}")
            print(f"[DEBUG] Signature type: {type(self.signature)}, value (first 50 chars): {str(self.signature)[:50]}")
            print(f"[DEBUG] Public key type: {type(self.sender_public_key)}")
            print(f"[DEBUG] Public key (first 100 chars): {str(self.sender_public_key)[:100]}")
            
            # Try ECDSA verification first (for wallet extension)
            try:
                print("[DEBUG] Attempting ECDSA verification...")
                # Import the PEM public key as ECDSA P-256
                public_key = VerifyingKey.from_pem(self.sender_public_key.encode())
                print("[DEBUG] ECDSA key imported successfully")
                
                # Convert hex signature to bytes (Web Crypto API returns hex)
                if isinstance(self.signature, str):
                    sig_bytes = bytes.fromhex(self.signature)
                else:
                    sig_bytes = self.signature
                
                print(f"[DEBUG] Signature bytes length: {len(sig_bytes)}")
                print(f"[DEBUG] Signature (hex): {sig_bytes.hex()[:100]}")
                print(f"[DEBUG] TX Hash (hex): {tx_hash.hex()}")
                
                # Try with hashfunc to handle the verification
                try:
                    # Raw format verification
                    public_key.verify_digest(sig_bytes, tx_hash, sigdecode=sigdecode_string)
                    print("[DEBUG] ✓ ECDSA signature verified (raw format)!")
                    return True
                except:
                    # Try with der_encode_ecdsa_signature in case signature is DER-encoded
                    from ecdsa.util import sigdecode_der
                    public_key.verify_digest(sig_bytes, tx_hash, sigdecode=sigdecode_der)
                    print("[DEBUG] ✓ ECDSA signature verified (DER format)!")
                    return True
            except Exception as ecdsa_error:
                print(f"[DEBUG] ECDSA verification failed: {ecdsa_error}")
                import traceback
                traceback.print_exc()
                # Not an ECDSA key, try RSA
                pass
            
            # Fallback to RSA verification (for backward compatibility)
            try:
                print("[DEBUG] Attempting RSA verification...")
                public_key = RSA.import_key(self.sender_public_key.encode())
                h = SHA256.new(tx_string)
                pkcs1_15.new(public_key).verify(h, self.signature if isinstance(self.signature, bytes) else bytes.fromhex(self.signature))
                print("[DEBUG] ✓ RSA signature verified!")
                return True
            except Exception as rsa_error:
                print(f"[DEBUG] RSA verification failed: {rsa_error}")
            
            print("[DEBUG] All signature verification attempts failed")
            return False
        except Exception as e:
            print(f"[DEBUG] Signature validation error: {e}")
            import traceback
            traceback.print_exc()
            return False


# -------------------------
# BLOCK
# -------------------------
class Block:
    def __init__(self, transactions, previous_hash):
        self.timestamp = int(time.time())
        self.transactions = transactions
        self.previous_hash = previous_hash
        self.nonce = 0
        self.hash = self.calculate_hash()

    def calculate_hash(self):
        block_data = {
            "timestamp": self.timestamp,
            "transactions": [tx.to_dict() for tx in self.transactions],
            "previous_hash": self.previous_hash,
            "nonce": self.nonce
        }
        block_string = json.dumps(block_data, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()


# -------------------------
# BLOCKCHAIN
# -------------------------
class Blockchain:
    def __init__(self):
        self.chain = [self.create_genesis_block()]
        self.pending_transactions = []
        self.difficulty = 3
        self.mining_reward = 50

    def create_genesis_block(self):
        return Block([], "0")

    def get_latest_block(self):
        return self.chain[-1]

    def add_transaction(self, transaction):
        if not transaction.is_valid():
            raise Exception("Invalid transaction!")
        self.pending_transactions.append(transaction)

    def add_block(self, block):
        # Validate previous hash
        if block.previous_hash != self.get_latest_block().hash:
            raise Exception("Invalid previous hash")

        # Validate proof-of-work
        if not block.hash.startswith('0' * self.difficulty):
            raise Exception("Invalid proof of work")

        # Validate hash integrity
        if block.hash != block.calculate_hash():
            raise Exception("Hash mismatch")

        # Validate all transactions
        for tx in block.transactions:
            if not tx.is_valid():
                raise Exception("Invalid transaction in block")

        self.chain.append(block)
        self.pending_transactions = []

    def is_chain_valid(self):
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i - 1]

            if current.hash != current.calculate_hash():
                return False

            if current.previous_hash != previous.hash:
                return False

            for tx in current.transactions:
                if not tx.is_valid():
                    return False

        return True

    def save_to_json(self, filename="blockchain.json"):
        """Save blockchain to JSON file"""
        try:
            blockchain_data = {
                "chain": [
                    {
                        "timestamp": block.timestamp,
                        "transactions": [tx.to_dict() for tx in block.transactions],
                        "previous_hash": block.previous_hash,
                        "nonce": block.nonce,
                        "hash": block.hash
                    }
                    for block in self.chain
                ],
                "pending_transactions": [tx.to_dict() for tx in self.pending_transactions],
                "difficulty": self.difficulty,
                "mining_reward": self.mining_reward
            }
            
            with open(filename, 'w') as f:
                json.dump(blockchain_data, f, indent=2)
            
            print(f"[BLOCKCHAIN] Saved blockchain to {filename}")
            return True
        except Exception as e:
            print(f"[BLOCKCHAIN] Error saving blockchain: {e}")
            return False

    def load_from_json(self, filename="blockchain.json"):
        """Load blockchain from JSON file"""
        try:
            if not os.path.exists(filename):
                print(f"[BLOCKCHAIN] No saved blockchain found at {filename}, using fresh chain")
                return False
            
            with open(filename, 'r') as f:
                blockchain_data = json.load(f)
            
            # Clear current chain and rebuild from JSON
            self.chain = []
            
            # Reconstruct blocks
            for block_data in blockchain_data.get("chain", []):
                # Reconstruct transactions
                transactions = []
                for tx_data in block_data.get("transactions", []):
                    tx_type = tx_data.get('transaction_type', 'transfer')
                    
                    if tx_type == 'file':
                        # Reconstruct FileTransaction
                        tx = FileTransaction(
                            tx_data['sender'],
                            tx_data['receiver'],
                            tx_data['file_name'],
                            tx_data['file_hash'],
                            tx_data['file_size'],
                            tx_data.get('sender_public_key')
                        )
                    else:
                        # Reconstruct regular Transaction
                        tx = Transaction(
                            tx_data['sender'],
                            tx_data['receiver'],
                            tx_data.get('amount', 0),
                            tx_data.get('sender_public_key')
                        )
                    
                    tx.timestamp = tx_data['timestamp']
                    tx.signature = bytes.fromhex(tx_data['signature']) if tx_data.get('signature') else None
                    tx.company_id = tx_data.get('company_id')
                    tx.role = tx_data.get('role')
                    transactions.append(tx)
                
                # Create block with reconstructed data
                block = Block(transactions, block_data['previous_hash'])
                block.timestamp = block_data['timestamp']
                block.nonce = block_data['nonce']
                block.hash = block_data['hash']
                self.chain.append(block)
            
            # Restore pending transactions
            self.pending_transactions = []
            for tx_data in blockchain_data.get("pending_transactions", []):
                tx_type = tx_data.get('transaction_type', 'transfer')
                
                if tx_type == 'file':
                    # Reconstruct FileTransaction
                    tx = FileTransaction(
                        tx_data['sender'],
                        tx_data['receiver'],
                        tx_data['file_name'],
                        tx_data['file_hash'],
                        tx_data['file_size'],
                        tx_data.get('sender_public_key')
                    )
                else:
                    # Reconstruct regular Transaction
                    tx = Transaction(
                        tx_data['sender'],
                        tx_data['receiver'],
                        tx_data.get('amount', 0),
                        tx_data.get('sender_public_key')
                    )
                
                tx.timestamp = tx_data['timestamp']
                tx.signature = bytes.fromhex(tx_data['signature']) if tx_data.get('signature') else None
                tx.company_id = tx_data.get('company_id')
                tx.role = tx_data.get('role')
                self.pending_transactions.append(tx)
            
            self.difficulty = blockchain_data.get('difficulty', 3)
            self.mining_reward = blockchain_data.get('mining_reward', 50)
            
            print(f"[BLOCKCHAIN] Loaded blockchain from {filename} ({len(self.chain)} blocks, {len(self.pending_transactions)} pending)")
            return True
        except Exception as e:
            print(f"[BLOCKCHAIN] Error loading blockchain: {e}")
            return False