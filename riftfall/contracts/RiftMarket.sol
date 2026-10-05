// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title RiftMarket — mercado P2P de naves, pagado en RIFT
/// @notice Sin custodia: la nave sigue en la wallet del vendedor hasta la venta.
///         Comisión para la tesorería con tope fijo del 10%.
contract RiftMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    struct Listing {
        address seller;
        uint256 price;
    }

    uint16 public constant MAX_FEE_BPS = 1000;

    IERC721 public immutable ships;
    IERC20 public immutable rift;
    address public treasury;
    uint16 public feeBps;

    mapping(uint256 tokenId => Listing) public listings;
    EnumerableSet.UintSet private _listed;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address treasury);

    constructor(IERC721 ships_, IERC20 rift_, address treasury_, address owner_, uint16 feeBps_) Ownable(owner_) {
        require(feeBps_ <= MAX_FEE_BPS, "Market: fee cap");
        require(treasury_ != address(0), "Market: zero");
        ships = ships_;
        rift = rift_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    function list(uint256 tokenId, uint256 price) external {
        require(price > 0, "Market: price");
        require(ships.ownerOf(tokenId) == msg.sender, "Market: not owner");
        require(
            ships.getApproved(tokenId) == address(this) || ships.isApprovedForAll(msg.sender, address(this)),
            "Market: not approved"
        );
        listings[tokenId] = Listing(msg.sender, price);
        _listed.add(tokenId);
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice El vendedor puede cancelar; cualquiera puede limpiar un anuncio obsoleto
    ///         (la nave ya no está en la wallet del vendedor).
    function cancel(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "Market: not listed");
        require(msg.sender == l.seller || ships.ownerOf(tokenId) != l.seller, "Market: not seller");
        _remove(tokenId);
        emit Cancelled(tokenId);
    }

    /// @param maxPrice protege al comprador si el vendedor cambia el precio en el mismo bloque.
    function buy(uint256 tokenId, uint256 maxPrice) external nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "Market: not listed");
        require(l.price <= maxPrice, "Market: price changed");
        require(msg.sender != l.seller, "Market: own listing");
        require(ships.ownerOf(tokenId) == l.seller, "Market: stale listing");
        _remove(tokenId);

        uint256 fee = (l.price * feeBps) / 10_000;
        if (fee > 0) rift.safeTransferFrom(msg.sender, treasury, fee);
        rift.safeTransferFrom(msg.sender, l.seller, l.price - fee);
        ships.safeTransferFrom(l.seller, msg.sender, tokenId);
        emit Sold(tokenId, l.seller, msg.sender, l.price, fee);
    }

    function listedCount() external view returns (uint256) {
        return _listed.length();
    }

    function listedPage(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, address[] memory sellers, uint256[] memory prices)
    {
        uint256 total = _listed.length();
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 n = end > offset ? end - offset : 0;
        ids = new uint256[](n);
        sellers = new address[](n);
        prices = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 id = _listed.at(offset + i);
            ids[i] = id;
            sellers[i] = listings[id].seller;
            prices[i] = listings[id].price;
        }
    }

    function setFee(uint16 feeBps_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "Market: fee cap");
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Market: zero");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function _remove(uint256 tokenId) internal {
        delete listings[tokenId];
        _listed.remove(tokenId);
    }
}
