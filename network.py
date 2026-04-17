from flask import Flask, request, jsonify
from main import Blockchain, Transaction, Block
import json

app = Flask(__name__)

blockchain = Blockchain()


# -------------------------
# ADD TRANSACTION
# -------------------------
@app.route('/add_transaction', methods=['POST'])
def add_transaction():
    data = request.json

    try:
        tx = Transaction(
            data['sender'],
            data['receiver'],
            data['amount']
        )

        tx.timestamp = data['timestamp']  
        tx.signature = bytes.fromhex(data['signature'])

        if not tx.is_valid():
            return jsonify({"error": "Invalid transaction"}), 400

        blockchain.add_transaction(tx)

        return jsonify({"message": "Transaction added"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# -------------------------
# GET PENDING TRANSACTIONS
# -------------------------
@app.route('/get_transactions', methods=['GET'])
def get_transactions():
    txs = []

    for tx in blockchain.pending_transactions:
        txs.append({
            "sender": tx.sender,
            "receiver": tx.receiver,
            "amount": tx.amount,
            "timestamp": tx.timestamp,
            "signature": tx.signature.hex() if tx.signature else None
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
                tx_data['sender'],
                tx_data['receiver'],
                tx_data['amount']
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