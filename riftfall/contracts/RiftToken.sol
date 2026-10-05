// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title RIFT — token de utilidad de RIFTFALL
/// @notice Suministro fijo acuñado una sola vez en el despliegue. No tiene owner, no se puede
///         mintear más, no cobra impuestos por transferencia y no tiene listas negras:
///         nadie (ni siquiera el creador) puede congelar o confiscar fondos de los jugadores.
contract RiftToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address initialHolder) ERC20("Riftfall", "RIFT") ERC20Permit("Riftfall") {
        require(initialHolder != address(0), "RIFT: holder");
        _mint(initialHolder, MAX_SUPPLY);
    }
}
