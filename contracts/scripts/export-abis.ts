import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Exports the ABI arrays from the compiled Hardhat artifacts into
 * `as const` TypeScript modules consumed by the VOTEX frontend.
 */
interface Target {
  label: string;
  artifact: string;
  exportName: string;
  outFile: string;
}

const TARGETS: Target[] = [
  {
    label: "ElectionFactory",
    artifact: "artifacts/contracts/core/ElectionFactory.sol/ElectionFactory.json",
    exportName: "electionFactoryAbi",
    outFile: "election-factory",
  },
  {
    label: "ElectionInstance",
    artifact: "artifacts/contracts/core/ElectionInstance.sol/ElectionInstance.json",
    exportName: "electionInstanceAbi",
    outFile: "election-instance",
  },
  {
    label: "VoterRegistry",
    artifact: "artifacts/contracts/core/VoterRegistry.sol/VoterRegistry.json",
    exportName: "voterRegistryAbi",
    outFile: "voter-registry",
  },
  {
    label: "EmergencyController",
    artifact: "artifacts/contracts/emergency/EmergencyController.sol/EmergencyController.json",
    exportName: "emergencyControllerAbi",
    outFile: "emergency-controller",
  },
  {
    label: "VotexAccessManager",
    artifact: "artifacts/contracts/access/VotexAccessManager.sol/VotexAccessManager.json",
    exportName: "votexAccessManagerAbi",
    outFile: "votex-access-manager",
  },
];

const HEADER = `// AUTO-GENERATED FROM HARDHAT ARTIFACTS. DO NOT EDIT BY HAND.
// Regenerate with: (cd votex/contracts && npm run export:abis)
/* eslint-disable */
`;

export function exportAbis(): void {
  const projectRoot = resolve(__dirname, "..");
  const outDir = resolve(projectRoot, "..", "frontend", "src", "lib", "contracts", "abis");
  mkdirSync(outDir, { recursive: true });

  for (const target of TARGETS) {
    const artifactPath = resolve(projectRoot, target.artifact);
    let artifact: { abi?: unknown[] };
    try {
      artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi?: unknown[] };
    } catch {
      throw new Error(
        `Missing artifact for ${target.label} at ${artifactPath}. Run 'npm run compile' first.`,
      );
    }
    if (!Array.isArray(artifact.abi)) {
      throw new Error(`Artifact for ${target.label} has no 'abi' array.`);
    }

    const body = `${HEADER}export const ${target.exportName} = ${JSON.stringify(
      artifact.abi,
      null,
      2,
    )} as const;\n`;

    const outPath = resolve(outDir, `${target.outFile}.ts`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, body, "utf8");
    console.log(`Exported ${target.label} -> ${outPath}`);
  }

  console.log(`Exported ${TARGETS.length} ABIs to ${outDir}`);
}

if (require.main === module) {
  exportAbis();
}
