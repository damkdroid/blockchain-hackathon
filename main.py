import json
import time
import hashlib
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256

# -------------------------
# WALLET (User Identity)
# -------------------------
class Wallet:
    def __init__(self):
        self.key = RSA.generate(2048)
        self.private_key = self.key
        self.public_key = self.key.publickey()

    def get_address(self):
        return self.public_key.export_key().decode()


# -------------------------
# TRANSACTION
# -------------------------
class Transaction:
    def __init__(self, sender, receiver, amount):
        self.sender = sender
        self.receiver = receiver
        self.amount = amount
        self.timestamp = time.time()
        self.signature = None

    def to_dict(self):
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
        if self.sender == "SYSTEM":
            return True

        if not self.signature:
            return False

        try:
            public_key = RSA.import_key(self.sender.encode())
            tx_string = json.dumps(self.to_dict(), sort_keys=True).encode()
            h = SHA256.new(tx_string)
            pkcs1_15.new(public_key).verify(h, self.signature)
            return True
        except:
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