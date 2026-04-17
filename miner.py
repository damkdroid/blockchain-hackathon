import requests
import hashlib
import time
from main import Block, Transaction, Wallet

NODE_URL = "http://127.0.0.1:5000"


# -------------------------
# FETCH TRANSACTIONS
# -------------------------
def get_pending_transactions():
    res = requests.get(f"{NODE_URL}/get_transactions")
    data = res.json()

    transactions = []

    for tx_data in data:
        tx = Transaction(
            tx_data['sender'],
            tx_data['receiver'],
            tx_data['amount']
        )
        tx.timestamp = tx_data['timestamp']
        tx.signature = bytes.fromhex(tx_data['signature']) if tx_data['signature'] else None
        transactions.append(tx)

    return transactions


# -------------------------
# GET LAST BLOCK
# -------------------------
def get_last_block():
    res = requests.get(f"{NODE_URL}/chain")
    chain = res.json()
    return chain[-1]


# -------------------------
# PROOF OF WORK
# -------------------------
def mine_block(block, difficulty):
    print("Mining started...")
    prefix = '0' * difficulty

    attempt = 0

    while not block.hash.startswith(prefix):
        block.nonce += 1
        block.hash = block.calculate_hash()
        attempt += 1

        # Print every 1000 attempts (adjust if needed)
        if attempt % 1000 == 0:
            print(f"Attempt {attempt} | Nonce: {block.nonce} | Hash: {block.hash}")

    print("\n Block mined!")
    print(f"Final Nonce: {block.nonce}")
    print(f"Final Hash : {block.hash}")

# -------------------------
# SUBMIT BLOCK
# -------------------------
def submit_block(block):
    data = {
        "timestamp": block.timestamp,
        "transactions": [
            {
                "sender": tx.sender,
                "receiver": tx.receiver,
                "amount": tx.amount,
                "timestamp": tx.timestamp,
                "signature": tx.signature.hex() if tx.signature else None
            }
            for tx in block.transactions
        ],
        "previous_hash": block.previous_hash,
        "nonce": block.nonce,
        "hash": block.hash
    }

    res = requests.post(f"{NODE_URL}/submit_block", json=data)
    print(">> Submit response:", res.json())


# -------------------------
# MAIN MINER LOOP
# -------------------------
def start_mining():
    miner_wallet = Wallet()

    while True:
        txs = get_pending_transactions()

        if not txs:
            print("No transactions... waiting...")
            time.sleep(5)
            continue

        last_block = get_last_block()

        # Reward transaction
        reward_tx = Transaction("SYSTEM", miner_wallet.get_address(), 50)

        txs.append(reward_tx)

        new_block = Block(txs, last_block['hash'])

        # Mine block
        mine_block(new_block, difficulty=3)

        # Submit to network
        submit_block(new_block)

        time.sleep(2)


# -------------------------
# RUN
# -------------------------
if __name__ == "__main__":
    start_mining()