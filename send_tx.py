import requests
from main import Wallet, Transaction

NODE_URL = "http://127.0.0.1:5000"

# Create users
alice = Wallet()
bob = Wallet()

print("A's Address:", alice.get_address())
print("B's Address:", bob.get_address())

# Create transaction using simple addresses
tx = Transaction(alice.get_address(), bob.get_address(), 100, alice.get_public_key())

# Sign transaction
tx.sign(alice.private_key)

# Send to node
data = {
    "sender": tx.sender,  # 0x-prefixed address
    "receiver": tx.receiver,  # 0x-prefixed address
    "amount": tx.amount,
    "timestamp": tx.timestamp,
    "signature": tx.signature.hex(),
    "sender_public_key": tx.sender_public_key  # Include public key for verification
}

response = requests.post(f"{NODE_URL}/add_transaction", json=data)

print("\nResponse:", response.json())