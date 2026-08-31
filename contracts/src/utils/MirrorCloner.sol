// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// @notice Deploy once; call cloneMirror(impl) to create EIP-1167 MirrorReactor clones on Somnia.
contract MirrorCloner {
    function cloneMirror(address implementation) external returns (address instance) {
        return Clones.clone(implementation);
    }
}
