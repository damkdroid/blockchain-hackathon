"""
Blockchain Miner v1.0
Standalone executable miner for Blockchain4 network
"""

import requests
import hashlib
import time
import sys
import logging
from datetime import datetime
from main import Block, Transaction, Wallet

# Fix Windows console encoding for Unicode support
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# =====================
# CONFIGURATION
# =====================
NODE_URL = "http://127.0.0.1:5000"
DIFFICULTY = 3
MINING_REWARD = 50
RETRY_DELAY = 5
NETWORK_TIMEOUT = 10

# =====================
# LOGGING SETUP
# =====================
def setup_logging():
    """Configure logging for miner"""
    log_format = '%(asctime)s - [%(levelname)s] - %(message)s'
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        handlers=[
            logging.FileHandler('miner.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

logger = setup_logging()

# =====================
# HEADER & STATUS
# =====================
def print_header():
    """Print banner"""
    print("\n" + "="*60)
    print("BLOCKCHAIN MINER v1.0")
    print("="*60)
    print(f"Network: {NODE_URL}")
    print(f"Difficulty: {DIFFICULTY}")
    print(f"Mining Reward: {MINING_REWARD}")
    print("="*60 + "\n")
    logger.info("Miner started")

# =====================
# FETCH TRANSACTIONS
# =====================
def get_pending_transactions():
    """Fetch pending transactions from network"""
    try:
        res = requests.get(
            f"{NODE_URL}/get_transactions",
            timeout=NETWORK_TIMEOUT
        )
        res.raise_for_status()
        data = res.json()

        transactions = []

        for tx_data in data:
            tx_type = tx_data.get('transaction_type', 'transfer')
            
            if tx_type == 'file':
                # File transaction
                from main import FileTransaction
                tx = FileTransaction(
                    tx_data['sender'],
                    tx_data['receiver'],
                    tx_data['file_name'],
                    tx_data['file_hash'],
                    tx_data['file_size'],
                    tx_data.get('sender_public_key')
                )
            else:
                # Regular transaction
                tx = Transaction(
                    tx_data['sender'],
                    tx_data['receiver'],
                    tx_data.get('amount', 0),
                    tx_data.get('sender_public_key')
                )
            
            tx.timestamp = tx_data['timestamp']
            tx.signature = bytes.fromhex(tx_data['signature']) if tx_data.get('signature') else None
            
            # Preserve company info if present
            if 'company_id' in tx_data:
                tx.company_id = tx_data['company_id']
                tx.role = tx_data.get('role')
            
            transactions.append(tx)

        logger.info(f"Fetched {len(transactions)} pending transactions")
        return transactions

    except requests.exceptions.ConnectionError:
        logger.error("[ERROR] Network error: Cannot connect to node")
        return None
    except requests.exceptions.Timeout:
        logger.error("[ERROR] Network timeout: Connection took too long")
        return None
    except Exception as e:
        logger.error(f"[ERROR] Error fetching transactions: {e}")
        return None


# =====================
# GET LAST BLOCK
# =====================
def get_last_block():
    """Fetch last block from network"""
    try:
        res = requests.get(
            f"{NODE_URL}/chain",
            timeout=NETWORK_TIMEOUT
        )
        res.raise_for_status()
        chain = res.json()
        
        if not chain:
            logger.error("[ERROR] Chain is empty!")
            return None
            
        return chain[-1]

    except requests.exceptions.ConnectionError:
        logger.error("[ERROR] Network error: Cannot connect to node")
        return None
    except requests.exceptions.Timeout:
        logger.error("[ERROR] Network timeout: Connection took too long")
        return None
    except Exception as e:
        logger.error(f"[ERROR] Error fetching block: {e}")
        return None


# =====================
# PROOF OF WORK
# =====================
def mine_block(block, difficulty):
    """Perform proof of work mining"""
    print(f"[MINING] Mining started... (difficulty: {difficulty})")
    logger.info(f"Mining block with {len(block.transactions)} transactions")
    
    prefix = '0' * difficulty
    attempt = 0
    start_time = time.time()

    while not block.hash.startswith(prefix):
        block.nonce += 1
        block.hash = block.calculate_hash()
        attempt += 1

        # Print progress every 10000 attempts
        if attempt % 10000 == 0:
            elapsed = time.time() - start_time
            print(f"  ⏳ Attempt {attempt:,} | Nonce: {block.nonce} | Time: {elapsed:.1f}s | Hash: {block.hash[:16]}...")

    elapsed = time.time() - start_time
    print(f"\n Block mined!")
    print(f"    Final Nonce: {block.nonce}")
    print(f"   Final Hash : {block.hash}")
    print(f"    Time taken : {elapsed:.2f} seconds")
    print(f"   Total attempts: {attempt:,}\n")
    
    logger.info(f"Block mined successfully in {elapsed:.2f}s after {attempt:,} attempts")

# =====================
# SUBMIT BLOCK
# =====================
def submit_block(block):
    """Submit mined block to network"""
    try:
        # Serialize transactions - handle both Transaction and FileTransaction
        serialized_txs = []
        for tx in block.transactions:
            if hasattr(tx, 'file_hash'):  # FileTransaction
                tx_dict = {
                    "sender": tx.sender,
                    "receiver": tx.receiver,
                    "file_name": tx.file_name,
                    "file_hash": tx.file_hash,
                    "file_size": tx.file_size,
                    "timestamp": tx.timestamp,
                    "signature": tx.signature.hex() if isinstance(tx.signature, bytes) else tx.signature,
                    "sender_public_key": tx.sender_public_key,
                    "company_id": getattr(tx, 'company_id', None),
                    "role": getattr(tx, 'role', None),
                    "transaction_type": "file"
                }
            else:  # Regular Transaction
                tx_dict = {
                    "sender": tx.sender,
                    "receiver": tx.receiver,
                    "amount": tx.amount,
                    "timestamp": tx.timestamp,
                    "signature": tx.signature.hex() if isinstance(tx.signature, bytes) else tx.signature,
                    "sender_public_key": tx.sender_public_key,
                    "company_id": getattr(tx, 'company_id', None),
                    "role": getattr(tx, 'role', None),
                    "transaction_type": "transfer"
                }
            serialized_txs.append(tx_dict)
        
        data = {
            "timestamp": block.timestamp,
            "transactions": serialized_txs,
            "previous_hash": block.previous_hash,
            "nonce": block.nonce,
            "hash": block.hash
        }
        
        # Log the data being sent (first transaction only for brevity)
        print(f"[DEBUG] Submitting block with {len(serialized_txs)} transactions")
        print(f"[DEBUG] First transaction: {serialized_txs[0] if serialized_txs else 'None'}")

        res = requests.post(
            f"{NODE_URL}/submit_block",
            json=data,
            timeout=NETWORK_TIMEOUT
        )
        res.raise_for_status()
        response = res.json()
        
        print(f" Block submitted!")
        print(f" Response: {response}\n")
        logger.info(f"Block submitted successfully: {response}")
        return True

    except requests.exceptions.ConnectionError:
        logger.error("[ERROR] Network error: Cannot submit block")
        return False
    except requests.exceptions.Timeout:
        logger.error("[ERROR] Network timeout: Submission took too long")
        return False
    except Exception as e:
        logger.error(f"[ERROR] Error submitting block: {e}")
        return False


# =====================
# MAIN MINER LOOP
# =====================
def start_mining():
    """Main mining loop"""
    print_header()
    
    try:
        # Import and initialize blockchain
        from main import Blockchain
        miner_blockchain = Blockchain()
        miner_blockchain.load_from_json("blockchain.json")
        logger.info(f"Miner blockchain initialized with {len(miner_blockchain.chain)} blocks")
        
        miner_wallet = Wallet()
        print(f" Miner Wallet: {miner_wallet.get_address()}\n")
        logger.info(f"Miner wallet created: {miner_wallet.get_address()}")

        blocks_mined = 0
        total_reward = 0

        while True:
            try:
                # Get pending transactions
                txs = get_pending_transactions()
                
                if txs is None:
                    print(f" Waiting {RETRY_DELAY}s before retry...")
                    time.sleep(RETRY_DELAY)
                    continue

                if not txs:
                    print(" No pending transactions. Waiting...")
                    time.sleep(RETRY_DELAY)
                    continue

                # Get last block
                last_block = get_last_block()
                
                if last_block is None:
                    print(f" Waiting {RETRY_DELAY}s before retry...")
                    time.sleep(RETRY_DELAY)
                    continue

                print(f" {len(txs)} transactions to mine")
                
                # Add mining reward transaction
                reward_tx = Transaction("SYSTEM", miner_wallet.get_address(), MINING_REWARD)
                txs.append(reward_tx)

                new_block = Block(txs, last_block['hash'])

                # Mine block
                mine_block(new_block, difficulty=DIFFICULTY)

                # Submit to network
                if submit_block(new_block):
                    blocks_mined += 1
                    total_reward += MINING_REWARD
                    print(f" Blocks mined: {blocks_mined} | Total reward: {total_reward}")
                    print("-" * 60 + "\n")
                else:
                    print("  Block mining failed, retrying...")
                    time.sleep(RETRY_DELAY)

                time.sleep(2)

            except KeyboardInterrupt:
                print("\n\n Mining interrupted by user")
                logger.info("Mining stopped by user")
                break
            except Exception as e:
                logger.error(f"Unexpected error in mining loop: {e}")
                print(f" Unexpected error: {e}")
                print(f" Waiting {RETRY_DELAY}s before retry...")
                time.sleep(RETRY_DELAY)

    except Exception as e:
        logger.critical(f"Critical error: {e}")
        print(f"\n[CRITICAL ERROR]: {e}")
        print("Press Enter to exit...")
        input()
        sys.exit(1)


# =====================
# ENTRY POINT
# =====================
if __name__ == "__main__":
    try:
        start_mining()
    except KeyboardInterrupt:
        print("\n\nMiner stopped.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[FATAL ERROR]: {e}")
        print("Press Enter to exit...")
        input()
        sys.exit(1)