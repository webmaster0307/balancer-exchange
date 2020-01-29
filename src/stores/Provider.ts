import { observable, action, ObservableMap } from 'mobx';
import RootStore from 'stores/Root';
import { isChainIdSupported, web3ContextNames } from 'provider/connectors';
import { ethers, utils, providers } from 'ethers';
import { Web3ReactContextInterface } from '@web3-react/core/dist/types';
import UncheckedJsonRpcSigner from 'provider/UncheckedJsonRpcSigner';
import { sendAction } from './actions/actions';

export enum ContractTypes {
    BPool = 'BPool',
    BFactory = 'BFactory',
    TestToken = 'TestToken',
    ExchangeProxy = 'ExchangeProxy',
    ExchangeProxyCallable = 'ExchangeProxyCallable',
}

export const schema = {
    BPool: require('../abi/BPool').abi,
    BFactory: require('../abi/BFactory').abi,
    TestToken: require('../abi/TestToken').abi,
    ExchangeProxy: require('../abi/ExchangeProxy').abi,
    ExchangeProxyCallable: require('../abi/ExchangeProxyCallable').abi,
};

export interface ChainData {
    currentBlockNumber: number;
}

type ChainDataMap = ObservableMap<number, ChainData>;

export default class ProviderStore {
    @observable provider: any;
    @observable accounts: string[];
    @observable defaultAccount: string | null;
    @observable contexts: object;
    @observable blockNumber: number;
    @observable supportedNetworks: number[];
    @observable chainData: ChainDataMap;
    @observable activeChainId: number;
    @observable activeFetchLoop: any;
    @observable activeAccount: string;
    rootStore: RootStore;

    constructor(rootStore, networkIds: number[]) {
        this.rootStore = rootStore;
        this.contexts = {};
        this.supportedNetworks = networkIds;
        this.chainData = new ObservableMap<number, ChainData>();

        networkIds.forEach(networkId => {
            this.chainData.set(networkId, {
                currentBlockNumber: -1,
            });
        });
    }

    private safeGetChainData(chainId): ChainData {
        const chainData = this.chainData.get(chainId);
        if (!chainData) {
            throw new Error(
                'Attempting to access chain data for non-existent chainId'
            );
        }
        return chainData;
    }

    fetchLoop(this, forceFetch?: boolean) {
        const { library, chainId, account } = this.getActiveWeb3React();

        library
            .getBlockNumber()
            .then(blockNumber => {
                const lastChecked = this.getCurrentBlockNumber(chainId);

                const doFetch = blockNumber != lastChecked || forceFetch;
                if (doFetch) {
                    console.log('[Data Fetcher] Fetch Blockchain Data', {
                        blockNumber,
                        chainId,
                        account,
                    });

                    // Set block number
                    this.setCurrentBlockNumber(chainId, blockNumber);

                    // Get global blockchain data
                    // None

                    // Get user-specific blockchain data
                    if (account) {
                        this.fetchUserBlockchainData(chainId, account);
                    }
                }
            })
            .catch(() => {
                this.setCurrentBlockNumber(chainId, undefined);
            });
    }

    startFetchLoop() {
        this.fetchLoop(true);
        this.activeFetchLoop = setInterval(this.fetchLoop.bind(this), 500);
    }

    stopFetchLoop() {
        if (!this.activeFetchLoop) {
            throw new Error('No active fetch loop to stop');
        }
        clearInterval(this.activeFetchLoop);
    }

    getCurrentBlockNumber(chainId): number {
        const chainData = this.safeGetChainData(chainId);
        return chainData.currentBlockNumber;
    }

    @action setCurrentBlockNumber(chainId, blockNumber): void {
        const chainData = this.safeGetChainData(chainId);
        chainData.currentBlockNumber = blockNumber;
    }

    @action setActiveAccount(account: string) {
        this.activeAccount = account;
    }

    @action fetchUserBlockchainData = async (
        chainId: number,
        account: string
    ) => {
        const { transactionStore, tokenStore } = this.rootStore;

        console.debug('[Fetch Start - User Blockchain Data]', {
            chainId,
            account,
        });

        transactionStore.checkPendingTransactions(chainId);
        tokenStore.fetchBalancerTokenData(account, chainId).then(result => {
            console.debug('[Fetch End - User Blockchain Data]', {
                chainId,
                account,
            });
        });
    };

    getWeb3React(name: string): Web3ReactContextInterface {
        if (!this.contexts[name]) {
            throw new Error('Context not loaded to store');
        }

        return this.contexts[name];
    }

    getActiveWeb3React(
        allowInvalidChainId?: boolean
    ): Web3ReactContextInterface {
        if (
            !this.contexts[web3ContextNames.injected] ||
            !this.contexts[web3ContextNames.backup]
        ) {
            throw new Error('Contexts not loaded to store');
        }

        const contextInjected = this.contexts[web3ContextNames.injected];
        const contextNetwork = this.contexts[web3ContextNames.backup];

        console.log('[Active Web3 React]', {
            activeAndValidInjected:
                contextInjected.active &&
                isChainIdSupported(contextInjected.chainId),
            allowInvalidChainId,
            result:
                contextInjected.active &&
                isChainIdSupported(contextInjected.chainId)
                    ? 'injected'
                    : 'network',
        });

        if (allowInvalidChainId) {
            return contextInjected.active ? contextInjected : contextNetwork;
        }

        return contextInjected.active &&
            isChainIdSupported(contextInjected.chainId)
            ? contextInjected
            : contextNetwork;
    }

    getActiveProviderName(): string {
        if (
            !this.contexts[web3ContextNames.injected] ||
            !this.contexts[web3ContextNames.backup]
        ) {
            throw new Error('Contexts not loaded to store');
        }

        const contextInjected = this.contexts[web3ContextNames.injected];
        const contextNetwork = this.contexts[web3ContextNames.backup];
        return contextInjected.active
            ? web3ContextNames.injected
            : web3ContextNames.backup;
    }

    // account is optional
    getProviderOrSigner(library, account) {
        console.debug('[getProviderOrSigner', {
            library,
            account,
            signer: library.getSigner(account),
        });

        return account
            ? new UncheckedJsonRpcSigner(library.getSigner(account))
            : library;
    }

    getContract(
        type: ContractTypes,
        address: string,
        signerAccount?: string
    ): ethers.Contract {
        const { library } = this.getActiveWeb3React();

        if (signerAccount) {
            return new ethers.Contract(
                address,
                schema[type],
                this.getProviderOrSigner(library, signerAccount)
            );
        }

        return new ethers.Contract(address, schema[type], library);
    }

    @action setWeb3Context(name, context) {
        console.log('[setWeb3Context]', name, context);
        this.contexts[name] = context;
    }

    @action sendTransaction = async (
        contractType: ContractTypes,
        contractAddress: string,
        action: string,
        params: any[],
        overrides?: any
    ): Promise<void> => {
        const { transactionStore } = this.rootStore;
        const { chainId, account } = this.getActiveWeb3React();

        overrides = overrides ? overrides : {};

        if (!account) {
            throw new Error(
                '[Error] Attempting to do blockchain transaction with no account'
            );
        }

        if (!chainId) {
            throw new Error(
                '[Invariant] Attempting to do blockchain transaction with no chainId'
            );
        }

        const contract = this.getContract(
            contractType,
            contractAddress,
            account
        );

        const { txResponse, error } = await sendAction({
            contract,
            action,
            sender: account,
            data: params,
            overrides,
        });

        if (error) {
            console.log('[Send Transaction Error', error);
        } else if (txResponse) {
            transactionStore.addTransactionRecord(chainId, txResponse);
        } else {
            throw new Error(
                '[Invariant]: No error or response received from blockchain action'
            );
        }
    };
}
