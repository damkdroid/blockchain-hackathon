from flask import Flask, request, jsonify
from main import Blockchain, Transaction, Block
from flask_cors import CORS

app = Flask(__name__)

blockchain = Blockchain()
CORS(app, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173"
])


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


# -------------------------
# ADD TRANSACTION
# -------------------------
@app.route('/add_transaction', methods=['POST'])
def add_transaction():
    data = request.json
    print(f"\n[API] Received transaction request:")
    print(f"  Sender: {data.get('sender')}")
    print(f"  Receiver: {data.get('receiver')}")
    print(f"  Amount: {data.get('amount')}")
    print(f"  Timestamp: {data.get('timestamp')}")
    print(f"  Signature (first 50 chars): {str(data.get('signature'))[:50]}")
    print(f"  Public key (first 100 chars): {str(data.get('sender_public_key'))[:100]}")

    try:
        tx = Transaction(
            data['sender'],  # 0x-prefixed address
            data['receiver'],  # 0x-prefixed address
            data['amount'],
            data.get('sender_public_key')  # Full public key for verification
        )

        tx.timestamp = data['timestamp']  
        tx.signature = data.get('signature')

        print(f"\n[API] Validating transaction...")
        if not tx.is_valid():
            print(f"[API] ❌ Transaction validation failed\n")
            return jsonify({"error": "Invalid transaction"}), 400

        blockchain.add_transaction(tx)
        print(f"[API] ✓ Transaction added to pending pool\n")

        return jsonify({"message": "Transaction added"}), 200

    except Exception as e:
        import traceback
        print(f"[API] ❌ Error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET PENDING TRANSACTIONS
# -------------------------
@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    txs = []

    for tx in blockchain.pending_transactions:
        # Handle signature as string or bytes
        sig = tx.signature
        if isinstance(sig, bytes):
            sig = sig.hex()
        
        txs.append({
            "sender": tx.sender,  # 0x-prefixed address
            "receiver": tx.receiver,  # 0x-prefixed address
            "amount": tx.amount,
            "timestamp": tx.timestamp,
            "signature": sig,
            "sender_public_key": tx.sender_public_key
        })

    return jsonify(txs), 200


# -------------------------
# SUBMIT MINED BLOCK
# -------------------------
@app.route('/submit_block', methods=['POST'])
def submit_block():
    data = request.json

    try:
        transactions = []

        for tx_data in data['transactions']:
            tx = Transaction(
                tx_data['sender'],  # 0x-prefixed address
                tx_data['receiver'],  # 0x-prefixed address
                tx_data['amount'],
                tx_data.get('sender_public_key')
            )
            tx.timestamp = tx_data['timestamp']
            tx.signature = bytes.fromhex(tx_data['signature']) if tx_data['signature'] else None

            if not tx.is_valid():
                return jsonify({"error": "Invalid transaction in block"}), 400

            transactions.append(tx)

        new_block = Block(transactions, data['previous_hash'])

        new_block.timestamp = data['timestamp']
        new_block.nonce = data['nonce']
        new_block.hash = data['hash']

        # Validate proof-of-work
        if not new_block.hash.startswith('0' * blockchain.difficulty):
            return jsonify({"error": "Invalid proof of work"}), 400

        # Validate hash correctness
        if new_block.hash != new_block.calculate_hash():
            return jsonify({"error": "Hash mismatch"}), 400

        # Validate chain linking
        if data['previous_hash'] != blockchain.get_latest_block().hash:
            return jsonify({"error": "Invalid previous hash"}), 400

        blockchain.chain.append(new_block)
        blockchain.pending_transactions = []

        return jsonify({"message": "Block accepted"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET FULL CHAIN
# -------------------------
@app.route('/chain', methods=['GET'])
def get_chain():
    chain_data = []

    for block in blockchain.chain:
        chain_data.append({
            "timestamp": block.timestamp,
            "transactions": [tx.to_dict() for tx in block.transactions],
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