// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnableToken {
    function burn(uint256 amount) external;
}

/// @title RiftArena — torneos de habilidad con inscripción en RIFT
/// @notice El bote se reparte entre los mejores puntajes (verificados por replay en el servidor).
///         De las inscripciones sale un "rake" para la tesorería (máx. 15%) y una quema (máx. 10%).
///         Los premios no asignados vuelven al pool de recompensas. Si un torneo se cancela,
///         cada jugador recupera su inscripción.
contract RiftArena is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct Tournament {
        uint256 entryFee;
        uint256 fees;
        uint256 sponsored;
        uint64 endsAt;
        uint16 rakeBps;
        uint16 burnBps;
        uint32 entrants;
        Status status;
    }

    uint16 public constant MAX_RAKE_BPS = 1500;
    uint16 public constant MAX_BURN_BPS = 1000;
    uint256 public constant MAX_PAYOUT_SLOTS = 20;

    IERC20 public immutable rift;
    address public immutable vault;
    address public treasury;
    address public operator;

    Tournament[] internal _tournaments;
    mapping(uint256 id => uint16[]) internal _payoutBps;
    mapping(uint256 id => mapping(address player => bool)) public entered;
    mapping(uint256 id => mapping(address player => bool)) public settledOrRefunded;

    event TournamentCreated(uint256 indexed id, uint256 entryFee, uint64 endsAt, uint16 rakeBps, uint16 burnBps);
    event Entered(uint256 indexed id, address indexed player);
    event Sponsored(uint256 indexed id, address indexed sponsor, uint256 amount);
    event Settled(uint256 indexed id, uint256 rake, uint256 burned, uint256 prizePool, uint256 returnedToVault);
    event Prize(uint256 indexed id, address indexed player, uint256 rank, uint256 amount);
    event TournamentCancelled(uint256 indexed id);
    event Refunded(uint256 indexed id, address indexed player, uint256 amount);
    event OperatorUpdated(address operator);

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == owner(), "Arena: operator");
        _;
    }

    constructor(IERC20 rift_, address vault_, address treasury_, address operator_, address owner_) Ownable(owner_) {
        require(vault_ != address(0) && treasury_ != address(0), "Arena: zero");
        rift = rift_;
        vault = vault_;
        treasury = treasury_;
        operator = operator_;
    }

    function create(uint256 entryFee, uint64 endsAt, uint16 rakeBps, uint16 burnBps, uint16[] calldata payoutBps)
        external
        onlyOperator
        returns (uint256 id)
    {
        require(endsAt > block.timestamp, "Arena: endsAt");
        require(rakeBps <= MAX_RAKE_BPS && burnBps <= MAX_BURN_BPS, "Arena: caps");
        require(payoutBps.length > 0 && payoutBps.length <= MAX_PAYOUT_SLOTS, "Arena: slots");
        uint256 sum;
        for (uint256 i = 0; i < payoutBps.length; i++) sum += payoutBps[i];
        require(sum == 10_000, "Arena: payout sum");

        id = _tournaments.length;
        _tournaments.push(Tournament(entryFee, 0, 0, endsAt, rakeBps, burnBps, 0, Status.Open));
        _payoutBps[id] = payoutBps;
        emit TournamentCreated(id, entryFee, endsAt, rakeBps, burnBps);
    }

    function enter(uint256 id) external nonReentrant {
        Tournament storage t = _open(id);
        require(block.timestamp < t.endsAt, "Arena: closed");
        require(!entered[id][msg.sender], "Arena: already entered");
        entered[id][msg.sender] = true;
        t.entrants += 1;
        t.fees += t.entryFee;
        if (t.entryFee > 0) rift.safeTransferFrom(msg.sender, address(this), t.entryFee);
        emit Entered(id, msg.sender);
    }

    /// @notice Patrocinar un bote (marketing): suma al premio sin rake.
    function sponsor(uint256 id, uint256 amount) external nonReentrant {
        Tournament storage t = _open(id);
        t.sponsored += amount;
        rift.safeTransferFrom(msg.sender, address(this), amount);
        emit Sponsored(id, msg.sender, amount);
    }

    function settle(uint256 id, address[] calldata winners) external onlyOperator nonReentrant {
        Tournament storage t = _open(id);
        require(block.timestamp >= t.endsAt, "Arena: not ended");
        uint16[] storage payout = _payoutBps[id];
        require(winners.length <= payout.length, "Arena: too many winners");
        t.status = Status.Settled;

        uint256 rake = (t.fees * t.rakeBps) / 10_000;
        uint256 burned = (t.fees * t.burnBps) / 10_000;
        uint256 prizePool = t.fees - rake - burned + t.sponsored;
        if (rake > 0) rift.safeTransfer(treasury, rake);
        if (burned > 0) IBurnableToken(address(rift)).burn(burned);

        uint256 paid;
        for (uint256 i = 0; i < winners.length; i++) {
            address w = winners[i];
            require(entered[id][w] && !settledOrRefunded[id][w], "Arena: bad winner");
            settledOrRefunded[id][w] = true;
            uint256 amount = (prizePool * payout[i]) / 10_000;
            paid += amount;
            if (amount > 0) rift.safeTransfer(w, amount);
            emit Prize(id, w, i + 1, amount);
        }
        uint256 leftover = prizePool - paid;
        if (leftover > 0) rift.safeTransfer(vault, leftover);
        emit Settled(id, rake, burned, prizePool, leftover);
    }

    function cancel(uint256 id) external onlyOperator nonReentrant {
        Tournament storage t = _open(id);
        t.status = Status.Cancelled;
        if (t.sponsored > 0) rift.safeTransfer(treasury, t.sponsored);
        emit TournamentCancelled(id);
    }

    function refund(uint256 id) external nonReentrant {
        require(id < _tournaments.length, "Arena: id");
        Tournament storage t = _tournaments[id];
        require(t.status == Status.Cancelled, "Arena: not cancelled");
        require(entered[id][msg.sender] && !settledOrRefunded[id][msg.sender], "Arena: nothing to refund");
        settledOrRefunded[id][msg.sender] = true;
        if (t.entryFee > 0) rift.safeTransfer(msg.sender, t.entryFee);
        emit Refunded(id, msg.sender, t.entryFee);
    }

    function tournamentCount() external view returns (uint256) {
        return _tournaments.length;
    }

    function getTournament(uint256 id) external view returns (Tournament memory t, uint16[] memory payoutBps) {
        require(id < _tournaments.length, "Arena: id");
        return (_tournaments[id], _payoutBps[id]);
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Arena: zero");
        treasury = treasury_;
    }

    function _open(uint256 id) internal view returns (Tournament storage t) {
        require(id < _tournaments.length, "Arena: id");
        t = _tournaments[id];
        require(t.status == Status.Open, "Arena: not open");
    }
}
