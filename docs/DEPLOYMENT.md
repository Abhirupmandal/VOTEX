# VOTEX — Deployment & Configuration Guide

This document specifies the exact deployment procedures, configuration requirements, and authoritative contract addresses for reproducing or connecting to the VOTEX platform.

---

## 1. Authoritative Ethereum Sepolia Deployment

- **Network**: Ethereum Sepolia Testnet
- **Chain ID**: `11155111`
- **Currency**: SepoliaETH
- **Earliest Deployment Block**: `11938337`
- **Authoritative Election ID**: `#1` (VOTEX Sepolia E2E Test Election)

### 1.1 Deployed Contract Registry

| Contract | Address | Sepolia Etherscan Link |
| :--- | :--- | :--- |
| **VotexAccessManager** | `0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033` | [View on Etherscan](https://sepolia.etherscan.io/address/0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033) |
| **VoterRegistry** | `0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc` | [View on Etherscan](https://sepolia.etherscan.io/address/0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc) |
| **ElectionFactory** | `0x27B6CBfCF0E909e2e4158A34b42e2904041312Be` | [View on Etherscan](https://sepolia.etherscan.io/address/0x27B6CBfCF0E909e2e4158A34b42e2904041312Be) |
| **EmergencyController** | `0x6a381FCe8494c09D131d0F0467e83150801Ec526` | [View on Etherscan](https://sepolia.etherscan.io/address/0x6a381FCe8494c09D131d0F0467e83150801Ec526) |
| **ElectionInstance #1** | `0xA88aa3bB1754Cc5cE43D48e7374D8BdF802f7762` | [View on Etherscan](https://sepolia.etherscan.io/address/0xA88aa3bB1754Cc5cE43D48e7374D8BdF802f7762) |

---

## 2. Environment Configuration

### 2.1 Backend (`votex/backend/.env`)

```ini
# Environment
ENVIRONMENT=production
DEBUG=false
PROJECT_NAME="VOTEX Backend"
API_V1_STR=/api/v1

# Database (PostgreSQL for production, SQLite for local demo)
# DATABASE_URL=postgresql://votex_user:votex_password@localhost:5432/votex
DATABASE_URL=sqlite:///./votex_sepolia.db

# Blockchain (Ethereum Sepolia)
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_CHAIN_ID=11155111
SEPOLIA_ACCESS_MANAGER_ADDRESS=0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033
SEPOLIA_VOTER_REGISTRY_ADDRESS=0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc
SEPOLIA_ELECTION_FACTORY_ADDRESS=0x27B6CBfCF0E909e2e4158A34b42e2904041312Be
SEPOLIA_EMERGENCY_CONTROLLER_ADDRESS=0x6a381FCe8494c09D131d0F0467e83150801Ec526

# Indexer Configuration
INDEXER_NETWORK=sepolia
INDEXER_START_BLOCK=11938337
INDEXER_POLL_INTERVAL=10
INDEXER_CHUNK_SIZE=20
INDEXER_CONFIRMATIONS=2
```

### 2.2 Frontend (`votex/frontend/.env.local`)

```ini
# Target Network Configuration
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# Contract Addresses
NEXT_PUBLIC_SEPOLIA_ACCESS_MANAGER=0x32CcA7F2A1336e9160e2c1D76F9C3493C0f6F033
NEXT_PUBLIC_SEPOLIA_VOTER_REGISTRY=0x3C2482EdA3aaDa7EEeb07c937f1c2DAF7fedCeEc
NEXT_PUBLIC_SEPOLIA_ELECTION_FACTORY=0x27B6CBfCF0E909e2e4158A34b42e2904041312Be
NEXT_PUBLIC_SEPOLIA_EMERGENCY_CONTROLLER=0x6a381FCe8494c09D131d0F0467e83150801Ec526
```

### 2.3 Contracts Deployment (`votex/contracts/.env`)

```ini
# Note: For deployment only; NOT committed to source control
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# SEPOLIA_PRIVATE_KEY=0x... (Configured locally by deployer only)
# ETHERSCAN_API_KEY=...    (Optional, for contract verification)
```

---

## 3. Step-by-Step Setup & Execution

### 3.1 Backend Setup

1. **Create and Activate Python Virtual Environment**:
   ```bash
   cd votex/backend
   python -m venv .venv
   # Windows:
   .\.venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate
   ```
2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Database Migrations**:
   ```bash
   alembic upgrade head
   ```
4. **Start the API Server**:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

### 3.2 Indexer Execution

To sync on-chain Sepolia events into the read model:
```bash
cd votex/backend
python -m app.services.blockchain.sync_manager --network sepolia
```
*Note: For evaluation, the pre-indexed database `votex_sepolia.db` already contains the authoritative 9 events for Election #1.*

### 3.3 Frontend Setup

1. **Install Node Dependencies**:
   ```bash
   cd votex/frontend
   npm install
   ```
2. **Build for Production**:
   ```bash
   npm run build
   ```
3. **Start the Production Server**:
   ```bash
   npm run start -- -p 3000 -H 0.0.0.0
   ```
   Open `http://localhost:3000` in a web browser.

---

## 4. Wallet Integration (MetaMask)

1. Open MetaMask and switch network to **Sepolia**.
   - Network Name: `Sepolia test network`
   - RPC URL: `https://ethereum-sepolia-rpc.publicnode.com`
   - Chain ID: `11155111`
   - Currency Symbol: `SepoliaETH`
   - Block Explorer URL: `https://sepolia.etherscan.io`
2. Navigate to `http://localhost:3000/elections`.
3. Click **Connect Wallet** in the top navigation bar.
4. If connected to any network other than Sepolia (11155111), the UI displays the yellow **Wrong Network** banner with a single-click network switch action.
