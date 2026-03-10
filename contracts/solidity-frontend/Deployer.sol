// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Deployer {
    bytes public buf;

    function a(bytes calldata c) external {
        buf = bytes.concat(buf, c);
    }

    function d(bytes calldata data) external payable returns (address r) {
        bytes memory b = bytes.concat(buf, data);
        assembly {
            r := create(callvalue(), add(b, 0x20), mload(b))
        }
        require(r != address(0));
        delete buf;
    }

    function len() external view returns (uint256) {
        return buf.length;
    }
}
