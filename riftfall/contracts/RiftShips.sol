// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface IBurnable {
    function burn(uint256 amount) external;
}

/// @title RiftShips — naves NFT de RIFTFALL
/// @notice Cada nave tiene una clase (define arma inicial y bonus en el juego) y un nivel 1-10
///         que se sube en la Forja pagando RIFT. Metadatos e imagen 100% on-chain (SVG).
///         Ingresos para el proyecto:
///           - venta primaria en ETH (va íntegra a la tesorería),
///           - venta primaria en RIFT y Forja: reparto quema / pool de recompensas / tesorería,
///           - regalías ERC-2981 en marketplaces externos (máx. 10%).
contract RiftShips is ERC721Enumerable, ERC2981, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    struct ShipClass {
        string name;
        string color;
        uint256 priceWei;
        uint256 priceRift;
        uint32 maxSupply;
        uint32 minted;
        bool active;
    }

    uint8 public constant MAX_LEVEL = 10;
    uint16 public constant MAX_TREASURY_BPS = 5000;
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    IERC20 public immutable rift;
    address public immutable vault;
    address public treasury;

    ShipClass[] internal _classes;
    mapping(uint256 tokenId => uint16) public classOf;
    mapping(uint256 tokenId => uint8) public levelOf;
    uint256 public nextId = 1;

    uint256 public forgeBaseCost;
    uint16 public burnBps = 4000;
    uint16 public vaultBps = 3000;

    event ClassAdded(uint256 indexed classId, string name, uint256 priceWei, uint256 priceRift, uint32 maxSupply);
    event ClassUpdated(uint256 indexed classId, uint256 priceWei, uint256 priceRift, bool active);
    event ShipMinted(address indexed to, uint256 indexed tokenId, uint256 indexed classId, bool paidInRift);
    event Forged(uint256 indexed tokenId, uint8 newLevel, uint256 cost);
    event RiftSplit(uint256 burned, uint256 toVault, uint256 toTreasury);
    event TreasuryUpdated(address treasury);

    constructor(IERC20 rift_, address vault_, address treasury_, address owner_, uint256 forgeBaseCost_)
        ERC721("Riftfall Ships", "RSHIP")
        Ownable(owner_)
    {
        require(address(rift_) != address(0) && vault_ != address(0) && treasury_ != address(0), "Ships: zero");
        rift = rift_;
        vault = vault_;
        treasury = treasury_;
        forgeBaseCost = forgeBaseCost_;
        _setDefaultRoyalty(treasury_, 500);
    }

    // ----------------------------------------------------------------- catálogo

    function addClass(
        string calldata name,
        string calldata color,
        uint256 priceWei,
        uint256 priceRift,
        uint32 maxSupply
    ) external onlyOwner returns (uint256 classId) {
        classId = _classes.length;
        _classes.push(ShipClass(name, color, priceWei, priceRift, maxSupply, 0, true));
        emit ClassAdded(classId, name, priceWei, priceRift, maxSupply);
    }

    function setClass(uint256 classId, uint256 priceWei, uint256 priceRift, bool active) external onlyOwner {
        ShipClass storage c = _class(classId);
        c.priceWei = priceWei;
        c.priceRift = priceRift;
        c.active = active;
        emit ClassUpdated(classId, priceWei, priceRift, active);
    }

    function classCount() external view returns (uint256) {
        return _classes.length;
    }

    function getClass(uint256 classId) external view returns (ShipClass memory) {
        return _class(classId);
    }

    // ----------------------------------------------------------------- compra

    function mint(uint256 classId) external payable nonReentrant returns (uint256) {
        ShipClass storage c = _class(classId);
        require(c.priceWei > 0 && msg.value == c.priceWei, "Ships: price");
        return _mintShip(msg.sender, classId, c, false);
    }

    function mintWithRift(uint256 classId) external nonReentrant returns (uint256) {
        ShipClass storage c = _class(classId);
        require(c.priceRift > 0, "Ships: no RIFT price");
        _collectRift(msg.sender, c.priceRift);
        return _mintShip(msg.sender, classId, c, true);
    }

    // ----------------------------------------------------------------- forja

    function forgeCost(uint8 level) public view returns (uint256) {
        return forgeBaseCost * uint256(level) * uint256(level);
    }

    function forge(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Ships: not owner");
        uint8 level = levelOf[tokenId];
        require(level < MAX_LEVEL, "Ships: max level");
        uint256 cost = forgeCost(level);
        _collectRift(msg.sender, cost);
        levelOf[tokenId] = level + 1;
        emit Forged(tokenId, level + 1, cost);
    }

    function shipsOf(address owner_)
        external
        view
        returns (uint256[] memory ids, uint16[] memory classIds, uint8[] memory levels)
    {
        uint256 n = balanceOf(owner_);
        ids = new uint256[](n);
        classIds = new uint16[](n);
        levels = new uint8[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 id = tokenOfOwnerByIndex(owner_, i);
            ids[i] = id;
            classIds[i] = classOf[id];
            levels[i] = levelOf[id];
        }
    }

    // ----------------------------------------------------------------- owner

    function setForgeBaseCost(uint256 cost) external onlyOwner {
        forgeBaseCost = cost;
    }

    /// @notice El reparto de pagos en RIFT tiene un tope: la tesorería nunca recibe más del 50%.
    function setSplit(uint16 burnBps_, uint16 vaultBps_) external onlyOwner {
        require(uint256(burnBps_) + vaultBps_ <= 10_000, "Ships: bps");
        require(10_000 - uint256(burnBps_) - vaultBps_ <= MAX_TREASURY_BPS, "Ships: treasury cap");
        burnBps = burnBps_;
        vaultBps = vaultBps_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Ships: zero");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setRoyalty(uint96 bps) external onlyOwner {
        require(bps <= MAX_ROYALTY_BPS, "Ships: royalty cap");
        _setDefaultRoyalty(treasury, bps);
    }

    /// @notice Cualquiera puede llamarla; el ETH solo puede ir a la tesorería.
    function withdraw() external nonReentrant {
        (bool ok,) = treasury.call{value: address(this).balance}("");
        require(ok, "Ships: withdraw");
    }

    // ----------------------------------------------------------------- metadatos on-chain

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        ShipClass storage c = _classes[classOf[tokenId]];
        uint8 level = levelOf[tokenId];
        bytes memory head = abi.encodePacked(
            '{"name":"', c.name, " #", tokenId.toString(),
            '","description":"Nave de RIFTFALL. Equipa esta nave en el Hangar y sube su nivel en la Forja.",'
        );
        bytes memory attrs = abi.encodePacked(
            '"attributes":[{"trait_type":"Clase","value":"', c.name,
            '"},{"trait_type":"Nivel","display_type":"number","value":', uint256(level).toString(), "}],"
        );
        bytes memory image = abi.encodePacked(
            '"image":"data:image/svg+xml;base64,', Base64.encode(_svg(c.name, c.color, level)), '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(abi.encodePacked(head, attrs, image)));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ----------------------------------------------------------------- internos

    function _class(uint256 classId) internal view returns (ShipClass storage) {
        require(classId < _classes.length, "Ships: class");
        return _classes[classId];
    }

    function _mintShip(address to, uint256 classId, ShipClass storage c, bool paidInRift)
        internal
        returns (uint256 id)
    {
        require(c.active, "Ships: inactive");
        require(c.minted < c.maxSupply, "Ships: sold out");
        c.minted += 1;
        id = nextId++;
        classOf[id] = uint16(classId);
        levelOf[id] = 1;
        _safeMint(to, id);
        emit ShipMinted(to, id, classId, paidInRift);
    }

    function _collectRift(address from, uint256 amount) internal {
        rift.safeTransferFrom(from, address(this), amount);
        uint256 toBurn = (amount * burnBps) / 10_000;
        uint256 toVault = (amount * vaultBps) / 10_000;
        uint256 toTreasury = amount - toBurn - toVault;
        if (toBurn > 0) IBurnable(address(rift)).burn(toBurn);
        if (toVault > 0) rift.safeTransfer(vault, toVault);
        if (toTreasury > 0) rift.safeTransfer(treasury, toTreasury);
        emit RiftSplit(toBurn, toVault, toTreasury);
    }

    function _svg(string memory name, string memory color, uint8 level) internal pure returns (bytes memory) {
        bytes memory pips;
        for (uint256 i = 0; i < MAX_LEVEL; i++) {
            pips = abi.encodePacked(
                pips,
                '<rect x="', (113 + i * 18).toString(), '" y="296" width="12" height="12" rx="3" fill="',
                i < level ? color : "#1b2638", '"/>'
            );
        }
        bytes memory body = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g">',
            '<stop offset="0" stop-color="', color, '" stop-opacity=".6"/><stop offset="1" stop-color="#05070f" stop-opacity="0"/>',
            '</radialGradient></defs><rect width="400" height="400" fill="#05070f"/>',
            '<circle cx="200" cy="170" r="150" fill="url(#g)"/>'
        );
        bytes memory ship = abi.encodePacked(
            '<path d="M200 62 L258 214 L226 202 L200 252 L174 202 L142 214 Z" fill="#0a1020" stroke="', color,
            '" stroke-width="6" stroke-linejoin="round"/><circle cx="200" cy="166" r="13" fill="', color, '"/>'
        );
        bytes memory label = abi.encodePacked(
            '<text x="200" y="356" font-family="monospace" font-size="24" fill="#e8f6ff" text-anchor="middle">',
            name, " LV ", uint256(level).toString(), "</text></svg>"
        );
        return abi.encodePacked(body, ship, pips, label);
    }
}
