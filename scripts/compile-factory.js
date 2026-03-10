const { resolc } = require(require.resolve('@parity/resolc').replace(/[/\\]dist[/\\]index\.js$/, '/dist/resolc'));
const { resolveInputs } = require('@parity/resolc');
const fs = require('fs');

const contracts = {
  // V1: calldatasize dispatch (no selector byte)
  'V1_NoSelector': [
    'pragma solidity ^0.8.20;',
    'contract D {',
    '    fallback() external payable {',
    '        assembly {',
    '            if calldatasize() {',
    '                let n := sload(0)',
    '                let w := div(add(calldatasize(), 31), 32)',
    '                for { let i := 0 } lt(i, w) { i := add(i, 1) } {',
    '                    sstore(add(add(n, i), 1), calldataload(mul(i, 32)))',
    '                }',
    '                sstore(0, add(n, w))',
    '                return(0, 0)',
    '            }',
    '            let n := sload(0)',
    '            for { let i := 0 } lt(i, n) { i := add(i, 1) } {',
    '                mstore(mul(i, 32), sload(add(i, 1)))',
    '            }',
    '            let a := create(callvalue(), 0, mul(n, 32))',
    '            mstore(0, a)',
    '            return(0, 32)',
    '        }',
    '    }',
    '}',
  ].join('\n'),

  // V2: Even simpler - store in slot=caller nonce  
  'V2_SimpleStore': [
    'pragma solidity ^0.8.20;',
    'contract D {',
    '    fallback() external payable {',
    '        assembly {',
    '            if calldatasize() {',
    '                let n := sload(0)',
    '                sstore(add(n, 1), calldataload(0))',
    '                if gt(calldatasize(), 32) { sstore(add(n, 2), calldataload(32)) }',
    '                sstore(0, add(n, div(add(calldatasize(), 31), 32)))',
    '                return(0, 0)',
    '            }',
    '            let n := sload(0)',
    '            for { let i := 0 } lt(i, n) { i := add(i, 1) } {',
    '                mstore(mul(i, 32), sload(add(i, 1)))',
    '            }',
    '            let a := create(callvalue(), 0, mul(n, 32))',
    '            mstore(0, a)',
    '            return(0, 32)',
    '        }',
    '    }',
    '}',
  ].join('\n'),

  // V3: Absolute minimum - just for loop store and create
  'V3_Minimal': [
    'pragma solidity ^0.8.20;',
    'contract D {',
    '    fallback() external payable {',
    '        assembly {',
    '            let s := calldatasize()',
    '            if s {',
    '                let n := sload(0)',
    '                let w := div(add(s, 31), 32)',
    '                let i := 0',
    '                for {} lt(i, w) { i := add(i, 1) } {',
    '                    sstore(add(n, add(i, 1)), calldataload(mul(i, 32)))',
    '                }',
    '                sstore(0, add(n, w))',
    '                stop()',
    '            }',
    '            let n := sload(0)',
    '            let i := 0',
    '            for {} lt(i, n) { i := add(i, 1) } {',
    '                mstore(mul(i, 32), sload(add(i, 1)))',
    '            }',
    '            let a := create(callvalue(), 0, mul(n, 32))',
    '            mstore(0, a)',
    '            return(0, 32)',
    '        }',
    '    }',
    '}',
  ].join('\n'),

  'MinCreate': [
    'pragma solidity ^0.8.20;',
    'contract D {',
    '    fallback() external payable {',
    '        assembly {',
    '            calldatacopy(0, 0, calldatasize())',
    '            let addr := create(callvalue(), 0, calldatasize())',
    '            mstore(0, addr)',
    '            return(0, 32)',
    '        }',
    '    }',
    '}',
  ].join('\n'),
};

for (const [name, sol] of Object.entries(contracts)) {
  const sources = { 'T.sol': { content: sol } };
  const resolvedSources = resolveInputs(sources);
  const input = JSON.stringify({
    language: 'Solidity',
    sources: resolvedSources,
    settings: {
      optimizer: { mode: 'z', enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  });
  const resultRaw = resolc(input);
  const result = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;
  if (result.errors) {
    for (const e of result.errors) {
      if (e.severity === 'error') console.log(name, e.severity + ':', e.message);
    }
  }
  const c = result.contracts?.['T.sol'];
  if (c) {
    const cName = Object.keys(c)[0];
    const bytecodeHex = c[cName]?.evm?.bytecode?.object;
    if (bytecodeHex) {
      const size = bytecodeHex.length / 2;
      console.log(name + ':', size, 'bytes', size < 2000 ? '(FITS!)' : '(too large)');
      if (name === 'V3_Minimal' || name === 'V1_NoSelector') {
        fs.mkdirSync('contracts/solidity-frontend/output', { recursive: true });
        fs.writeFileSync('contracts/solidity-frontend/output/AssemblyStore.pvm', Buffer.from(bytecodeHex, 'hex'));
      }
    }
  }
}
