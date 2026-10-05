// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";

/// @title TeamVesting — asignación del creador con cliff + liberación lineal
/// @notice Bloquear la parte del equipo genera confianza: nada se libera antes del cliff
///         y luego se libera de forma lineal hasta el final del periodo.
contract TeamVesting is VestingWalletCliff {
    constructor(address beneficiary, uint64 start, uint64 duration, uint64 cliff)
        VestingWallet(beneficiary, start, duration)
        VestingWalletCliff(cliff)
    {}
}
