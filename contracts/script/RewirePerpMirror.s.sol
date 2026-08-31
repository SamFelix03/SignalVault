// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {MirrorReactor} from "../src/reactivity/MirrorReactor.sol";
import {PerpRouter} from "../src/integrations/PerpRouter.sol";
import {StrategyVault} from "../src/core/StrategyVault.sol";

/// @notice Rewire perp vault: fresh MirrorReactor clone + PerpRouter v4, update vault pointers.
///   forge script script/RewirePerpMirror.s.sol:RewirePerpMirror --rpc-url $RPC_URL --broadcast
///   Env: VAULT, IMPL_MIRROR (optional — reads from VaultFactory if omitted)
contract RewirePerpMirror is Script {
    address internal constant MARGIN_BANK = 0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E;

    function run() external {
        address vault = vm.envAddress("VAULT");
        address implMirror = vm.envOr("IMPL_MIRROR", _implFromFactory());

        StrategyVault v = StrategyVault(payable(vault));
        address owner = v.owner();
        require(msg.sender == owner, "not vault owner");

        address stop = v.stopReactor();
        address guard = v.drawdownGuard();

        vm.startBroadcast();

        address newMirror = Clones.clone(implMirror);
        PerpRouter newRouter = new PerpRouter(newMirror, MARGIN_BANK);

        MirrorReactor(payable(newMirror)).initialize(owner, vault, address(newRouter));
        v.setEventRouter(address(newRouter));
        v.setReactors(newMirror, stop, guard);

        vm.stopBroadcast();

        console2.log("newMirrorReactor", newMirror);
        console2.log("newPerpRouter", address(newRouter));
        console2.log("ROUTER_VERSION", newRouter.ROUTER_VERSION());
    }

    function _implFromFactory() internal view returns (address) {
        address factory = vm.envAddress("VAULT_FACTORY_ADDRESS");
        (bool ok, bytes memory data) = factory.staticcall(
            abi.encodeWithSignature("implMirrorReactor()")
        );
        require(ok && data.length >= 32, "implMirrorReactor read failed");
        return abi.decode(data, (address));
    }
}
