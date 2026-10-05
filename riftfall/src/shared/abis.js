// ABIs mínimos (formato legible de ethers v6) compartidos por el cliente y el servidor.

export const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export const VAULT_ABI = [
  'function claim(uint256 amount, uint256 claimId, uint256 deadline, bytes signature)',
  'function claimUsed(uint256) view returns (bool)',
  'function remainingToday() view returns (uint256)',
  'function remainingForPlayerToday(address) view returns (uint256)',
  'function dailyBudget(uint256 day) view returns (uint256)',
  'function currentDay() view returns (uint256)',
  'function maxClaimPerPlayerPerDay() view returns (uint256)',
  'event Claimed(address indexed player, uint256 indexed claimId, uint256 amount, uint256 day)'
];

export const SHIPS_ABI = [
  'function mint(uint256 classId) payable returns (uint256)',
  'function mintWithRift(uint256 classId) returns (uint256)',
  'function forge(uint256 tokenId)',
  'function forgeCost(uint8 level) view returns (uint256)',
  'function classCount() view returns (uint256)',
  'function getClass(uint256 classId) view returns (tuple(string name, string color, uint256 priceWei, uint256 priceRift, uint32 maxSupply, uint32 minted, bool active))',
  'function shipsOf(address owner) view returns (uint256[] ids, uint16[] classIds, uint8[] levels)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function classOf(uint256 tokenId) view returns (uint16)',
  'function levelOf(uint256 tokenId) view returns (uint8)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'event ShipMinted(address indexed to, uint256 indexed tokenId, uint256 indexed classId, bool paidInRift)'
];

export const MARKET_ABI = [
  'function list(uint256 tokenId, uint256 price)',
  'function cancel(uint256 tokenId)',
  'function buy(uint256 tokenId, uint256 maxPrice)',
  'function feeBps() view returns (uint16)',
  'function listedCount() view returns (uint256)',
  'function listedPage(uint256 offset, uint256 limit) view returns (uint256[] ids, address[] sellers, uint256[] prices)'
];

export const ARENA_ABI = [
  'function create(uint256 entryFee, uint64 endsAt, uint16 rakeBps, uint16 burnBps, uint16[] payoutBps) returns (uint256)',
  'function enter(uint256 id)',
  'function settle(uint256 id, address[] winners)',
  'function entered(uint256 id, address player) view returns (bool)',
  'function tournamentCount() view returns (uint256)',
  'function getTournament(uint256 id) view returns (tuple(uint256 entryFee, uint256 fees, uint256 sponsored, uint64 endsAt, uint16 rakeBps, uint16 burnBps, uint32 entrants, uint8 status) t, uint16[] payoutBps)',
  'event TournamentCreated(uint256 indexed id, uint256 entryFee, uint64 endsAt, uint16 rakeBps, uint16 burnBps)'
];

export const CLAIM_TYPES = {
  Claim: [
    { name: 'player', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'claimId', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

export const VAULT_DOMAIN_NAME = 'RiftfallRewardVault';
