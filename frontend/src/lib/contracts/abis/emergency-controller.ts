// AUTO-GENERATED FROM HARDHAT ARTIFACTS. DO NOT EDIT BY HAND.
// Regenerate with: (cd votex/contracts && npm run export:abis)
/* eslint-disable */
export const emergencyControllerAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "accessManager_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "factory_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAddress",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "electionId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "officer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "action",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "EmergencyAction",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "AUDITOR_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ELECTION_MANAGER_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SECURITY_OFFICER_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "VOTER_REGISTRAR_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "accessManager",
    "outputs": [
      {
        "internalType": "contract IVotexAccessManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "factory",
    "outputs": [
      {
        "internalType": "contract IElectionFactory",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "electionId",
        "type": "uint256"
      }
    ],
    "name": "pauseElection",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "electionId",
        "type": "uint256"
      }
    ],
    "name": "resumeElection",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
