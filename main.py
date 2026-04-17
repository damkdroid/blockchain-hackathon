import json
import time
import hashlib
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256
from ecdsa import VerifyingKey
from ecdsa.util import sigdecode_string


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
        self.timestamp = time.time()
        self.signature = None
        self.sender_public_key = sender_public_key  # Store for validation

    def to_dict(self):
        # Order matters for signature verification - must match frontend's JSON.stringify order
        return {
            "sender": self.sender,
            "receiver": self.receiver,
            "amount": self.amount,
            "timestamp": self.timestamp
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
                
                # Verify ECDSA signature (raw format: r || s)
                # Note: verify_digest expects pre-hashed data, don't pass hashfunc
                public_key.verify_digest(sig_bytes, tx_hash)
                print("[DEBUG] ✓ ECDSA signature verified!")
                return True
            except Exception as ecdsa_error:
                print(f"[DEBUG] ECDSA verification failed: {ecdsa_error}")
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
        self.timestamp = time.time()
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