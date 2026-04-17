import requests
from main import Wallet, Transaction

NODE_URL = "http://127.0.0.1:5000"

# Create users
alice = Wallet()
bob = Wallet()

print("A's Public Key:\n", alice.get_address())
print("\nB's Public Key:\n", bob.get_address())

# Create transaction
tx = Transaction(alice.get_address(), bob.get_address(), 100)

# Sign transaction
tx.sign(alice.private_key)

# Send to node
data = {
    "sender": tx.sender,
    "receiver": tx.receiver,
    "amount": tx.amount,
    "timestamp": tx.timestamp,
    "signature": tx.signature.hex()
}

response = requests.post(f"{NODE_URL}/add_transaction", json=data)

print("\nResponse:", response.json())