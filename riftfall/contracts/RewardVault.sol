// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title RewardVault — pool de recompensas play-to-earn
/// @notice Guarda los RIFT destinados a jugadores. El servidor del juego firma (EIP-712) un vale
///         por cada canje de Shards verificado con su replay; el jugador lo cobra aquí.
///         Límites on-chain:
///           - presupuesto diario global que se reduce a la mitad cada 180 días,
///           - tope diario por jugador,
///           - cada vale se usa una sola vez y caduca.
///         El owner NO puede retirar fondos: solo puede migrarlos a un vault nuevo con un
///         aviso público de 14 días (timelock), visible para todos los jugadores.
contract RewardVault is EIP712, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address player,uint256 amount,uint256 claimId,uint256 deadline)");
    uint256 public constant HALVING_PERIOD = 180 days;
    uint256 public constant MIGRATION_DELAY = 14 days;

    IERC20 public immutable rift;
    uint256 public immutable genesis;
    uint256 public immutable initialDailyEmission;

    address public signer;
    uint256 public baseDailyEmission;
    uint256 public maxClaimPerPlayerPerDay;

    mapping(uint256 day => uint256) public emittedOnDay;
    mapping(address player => mapping(uint256 day => uint256)) public claimedOnDay;
    mapping(uint256 claimId => bool) public claimUsed;

    address public pendingVault;
    uint256 public migrationReadyAt;

    event Claimed(address indexed player, uint256 indexed claimId, uint256 amount, uint256 day);
    event SignerUpdated(address signer);
    event EmissionUpdated(uint256 baseDailyEmission, uint256 maxClaimPerPlayerPerDay);
    event MigrationScheduled(address newVault, uint256 readyAt);
    event MigrationCancelled();
    event Migrated(address newVault, uint256 amount);

    error Expired();
    error AlreadyClaimed();
    error BadSignature();
    error DailyBudgetExceeded();
    error PlayerCapExceeded();

    constructor(
        IERC20 rift_,
        address owner_,
        address signer_,
        uint256 dailyEmission_,
        uint256 maxClaimPerPlayerPerDay_
    ) EIP712("RiftfallRewardVault", "1") Ownable(owner_) {
        require(address(rift_) != address(0) && signer_ != address(0), "Vault: zero");
        rift = rift_;
        genesis = block.timestamp;
        signer = signer_;
        initialDailyEmission = dailyEmission_;
        baseDailyEmission = dailyEmission_;
        maxClaimPerPlayerPerDay = maxClaimPerPlayerPerDay_;
    }

    // ----------------------------------------------------------------- vistas

    function currentDay() public view returns (uint256) {
        return (block.timestamp - genesis) / 1 days;
    }

    /// @notice Presupuesto de emisión de un día: base >> (número de halvings transcurridos).
    function dailyBudget(uint256 day) public view returns (uint256) {
        uint256 halvings = (day * 1 days) / HALVING_PERIOD;
        if (halvings >= 64) return 0;
        return baseDailyEmission >> halvings;
    }

    function remainingToday() public view returns (uint256) {
        uint256 day = currentDay();
        uint256 budget = dailyBudget(day);
        uint256 emitted = emittedOnDay[day];
        uint256 left = budget > emitted ? budget - emitted : 0;
        uint256 bal = rift.balanceOf(address(this));
        return left < bal ? left : bal;
    }

    function remainingForPlayerToday(address player) external view returns (uint256) {
        uint256 used = claimedOnDay[player][currentDay()];
        uint256 left = maxClaimPerPlayerPerDay > used ? maxClaimPerPlayerPerDay - used : 0;
        uint256 global = remainingToday();
        return left < global ? left : global;
    }

    function claimDigest(address player, uint256 amount, uint256 claimId, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, player, amount, claimId, deadline)));
    }

    // ----------------------------------------------------------------- jugadores

    function claim(uint256 amount, uint256 claimId, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
    {
        if (block.timestamp > deadline) revert Expired();
        if (claimUsed[claimId]) revert AlreadyClaimed();
        address recovered = ECDSA.recover(claimDigest(msg.sender, amount, claimId, deadline), signature);
        if (recovered != signer) revert BadSignature();

        uint256 day = currentDay();
        uint256 emitted = emittedOnDay[day] + amount;
        if (emitted > dailyBudget(day)) revert DailyBudgetExceeded();
        uint256 playerTotal = claimedOnDay[msg.sender][day] + amount;
        if (playerTotal > maxClaimPerPlayerPerDay) revert PlayerCapExceeded();

        claimUsed[claimId] = true;
        emittedOnDay[day] = emitted;
        claimedOnDay[msg.sender][day] = playerTotal;
        rift.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, claimId, amount, day);
    }

    // ----------------------------------------------------------------- owner

    function setSigner(address signer_) external onlyOwner {
        require(signer_ != address(0), "Vault: zero");
        signer = signer_;
        emit SignerUpdated(signer_);
    }

    /// @notice La emisión base solo puede ajustarse por debajo de la inicial: nunca inflar más.
    function setEmission(uint256 baseDailyEmission_, uint256 maxClaimPerPlayerPerDay_) external onlyOwner {
        require(baseDailyEmission_ <= initialDailyEmission, "Vault: above initial");
        baseDailyEmission = baseDailyEmission_;
        maxClaimPerPlayerPerDay = maxClaimPerPlayerPerDay_;
        emit EmissionUpdated(baseDailyEmission_, maxClaimPerPlayerPerDay_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function scheduleMigration(address newVault) external onlyOwner {
        require(newVault != address(0), "Vault: zero");
        pendingVault = newVault;
        migrationReadyAt = block.timestamp + MIGRATION_DELAY;
        emit MigrationScheduled(newVault, migrationReadyAt);
    }

    function cancelMigration() external onlyOwner {
        pendingVault = address(0);
        migrationReadyAt = 0;
        emit MigrationCancelled();
    }

    function executeMigration() external onlyOwner {
        address target = pendingVault;
        require(target != address(0) && block.timestamp >= migrationReadyAt, "Vault: timelock");
        pendingVault = address(0);
        migrationReadyAt = 0;
        uint256 amount = rift.balanceOf(address(this));
        rift.safeTransfer(target, amount);
        emit Migrated(target, amount);
    }
}
