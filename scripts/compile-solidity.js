/**
 * Compile PrivateVoting.sol using @parity/resolc for PolkaVM
 */
const { resolveInputs, version } = require("@parity/resolc");
const { resolc } = require(require.resolve("@parity/resolc").replace(/[/\\]dist[/\\]index\.js$/, "/dist/resolc"));
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("resolc version:", version());

  const solPath = path.join(__dirname, "..", "contracts", "solidity-frontend", "PrivateVoting.sol");
  const sol = fs.readFileSync(solPath, "utf8");

  console.log("Compiling...");
  const sources = {
    "PrivateVoting.sol": { content: sol }
  };

  // Resolve imports via solc
  const resolvedSources = resolveInputs(sources);

  // Build standard JSON input with proper outputSelection
  const input = JSON.stringify({
    language: 'Solidity',
    sources: resolvedSources,
    settings: {
      optimizer: { mode: 'z', enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      }
    }
  });

  // Call resolc WASM directly
  const resultRaw = resolc(input);
  const result = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;

  if (result.errors) {
    for (const err of result.errors) {
      console.log(`${err.severity}: ${err.message}`);
    }
    const hasError = result.errors.some(e => e.severity === "error");
    if (hasError) {
      console.error("Compilation failed.");
      process.exit(1);
    }
  }

  if (result.contracts) {
    const outDir = path.join(__dirname, "..", "contracts", "solidity-frontend", "output");
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of Object.keys(result.contracts)) {
      for (const name of Object.keys(result.contracts[file])) {
        const contract = result.contracts[file][name];
        const bytecode = contract.evm && contract.evm.bytecode && contract.evm.bytecode.object;
        const abi = contract.abi;

        if (bytecode) {
          const pvmPath = path.join(outDir, `${name}.pvm`);
          fs.writeFileSync(pvmPath, Buffer.from(bytecode, "hex"));
          console.log(`${name}: ${bytecode.length / 2} bytes -> ${pvmPath}`);
        }
        if (abi) {
          const abiPath = path.join(outDir, `${name}.abi.json`);
          fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
          console.log(`${name}: ABI -> ${abiPath}`);
        }
      }
    }
  } else {
    console.error("No contracts in output");
    process.exit(1);
  }

  console.log("Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
