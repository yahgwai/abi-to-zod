import { abi as erc20Abi } from './erc/ERC20.js';
import { abi as erc721Abi } from './erc/ERC721.js';
import { abi as erc1155Abi } from './erc/ERC1155.js';
import { abi as arbSysAbi } from './arbitrum/precompiles/ArbSys.js';
import { abi as arbGasInfoAbi } from './arbitrum/precompiles/ArbGasInfo.js';
import { abi as arbOwnerAbi } from './arbitrum/precompiles/ArbOwner.js';
import { abi as arbOwnerPublicAbi } from './arbitrum/precompiles/ArbOwnerPublic.js';
import { abi as arbRetryableTxAbi } from './arbitrum/precompiles/ArbRetryableTx.js';
import { abi as arbAddressTableAbi } from './arbitrum/precompiles/ArbAddressTable.js';
import { abi as arbAggregatorAbi } from './arbitrum/precompiles/ArbAggregator.js';
import { abi as arbWasmAbi } from './arbitrum/precompiles/ArbWasm.js';
import { abi as arbStatisticsAbi } from './arbitrum/precompiles/ArbStatistics.js';
import { abi as arbInfoAbi } from './arbitrum/precompiles/ArbInfo.js';
import { abi as inboxAbi } from './arbitrum/l1/Inbox.js';
import { abi as outboxAbi } from './arbitrum/l1/Outbox.js';
import { abi as bridgeAbi } from './arbitrum/l1/Bridge.js';
import { abi as nodeInterfaceAbi } from './arbitrum/l1/NodeInterface.js';
import { abi as sequencerInboxAbi } from './arbitrum/l1/SequencerInbox.js';
import { abi as rollupAdminLogicAbi } from './arbitrum/l1/RollupAdminLogic.js';
import { abi as rollupUserLogicAbi } from './arbitrum/l1/RollupUserLogic.js';
import { abi as edgeChallengeManagerAbi } from './arbitrum/l1/EdgeChallengeManager.js';
import { abi as uniswapV2RouterAbi } from './mainnet/UniswapV2Router.js';
import { abi as uniswapV3SwapRouterAbi } from './mainnet/UniswapV3SwapRouter.js';
import { abi as seaportAbi } from './mainnet/Seaport.js';

export {
  erc20Abi,
  erc721Abi,
  erc1155Abi,
  arbSysAbi,
  arbGasInfoAbi,
  arbOwnerAbi,
  arbOwnerPublicAbi,
  arbRetryableTxAbi,
  arbAddressTableAbi,
  arbAggregatorAbi,
  arbWasmAbi,
  arbStatisticsAbi,
  arbInfoAbi,
  inboxAbi,
  outboxAbi,
  bridgeAbi,
  nodeInterfaceAbi,
  sequencerInboxAbi,
  rollupAdminLogicAbi,
  rollupUserLogicAbi,
  edgeChallengeManagerAbi,
  uniswapV2RouterAbi,
  uniswapV3SwapRouterAbi,
  seaportAbi,
};

export const FIXTURES = {
  'erc/ERC20.ts': erc20Abi,
  'erc/ERC721.ts': erc721Abi,
  'erc/ERC1155.ts': erc1155Abi,
  'arbitrum/precompiles/ArbSys.ts': arbSysAbi,
  'arbitrum/precompiles/ArbGasInfo.ts': arbGasInfoAbi,
  'arbitrum/precompiles/ArbOwner.ts': arbOwnerAbi,
  'arbitrum/precompiles/ArbOwnerPublic.ts': arbOwnerPublicAbi,
  'arbitrum/precompiles/ArbRetryableTx.ts': arbRetryableTxAbi,
  'arbitrum/precompiles/ArbAddressTable.ts': arbAddressTableAbi,
  'arbitrum/precompiles/ArbAggregator.ts': arbAggregatorAbi,
  'arbitrum/precompiles/ArbWasm.ts': arbWasmAbi,
  'arbitrum/precompiles/ArbStatistics.ts': arbStatisticsAbi,
  'arbitrum/precompiles/ArbInfo.ts': arbInfoAbi,
  'arbitrum/l1/Inbox.ts': inboxAbi,
  'arbitrum/l1/Outbox.ts': outboxAbi,
  'arbitrum/l1/Bridge.ts': bridgeAbi,
  'arbitrum/l1/NodeInterface.ts': nodeInterfaceAbi,
  'arbitrum/l1/SequencerInbox.ts': sequencerInboxAbi,
  'arbitrum/l1/RollupAdminLogic.ts': rollupAdminLogicAbi,
  'arbitrum/l1/RollupUserLogic.ts': rollupUserLogicAbi,
  'arbitrum/l1/EdgeChallengeManager.ts': edgeChallengeManagerAbi,
  'mainnet/UniswapV2Router.ts': uniswapV2RouterAbi,
  'mainnet/UniswapV3SwapRouter.ts': uniswapV3SwapRouterAbi,
  'mainnet/Seaport.ts': seaportAbi,
} as const;
